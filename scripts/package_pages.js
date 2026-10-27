/** Package allowlisted public files and browser campus for GitHub Pages. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundle_styles } from './styles.js';
import { ValueError } from '../backend/domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultRoot = path.resolve(__dirname, '..');

export const PAGES = [
  'index.html',
  ...[
    'material-estudio',
    'institucional',
    'contacto',
    'novedades',
    'terminos',
    'privacidad',
    'fuentes',
  ].map((name) => `pages/${name}.html`),
];
export const DIRECTORIES = ['css', 'js', 'assets/img'];
export const SUFFIXES = new Set([
  '.css',
  '.js',
  '.svg',
  '.webp',
  '.png',
  '.jpg',
  '.jpeg',
  '.woff2',
]);

const PDF_SOURCES = [
  [
    1,
    'Concurso-Ingreso-2026-SCJM-Modulo-1-Organizacion-del-Estado-Material-de-Estudio.pdf',
  ],
  [
    2,
    'Concurso-Ingreso-2026-SCJM-Modulo-2-El-Poder-Judicial-de-Mendoza-Material-de-Estudio.pdf',
  ],
  [
    3,
    'Concurso-Ingreso-2026-SCJM-Modulo-3-Derechos-Humanos-Material-de-Estudio.pdf',
  ],
  [
    4,
    'Concurso-Ingreso-2026-SCJM-Modulo-4-Violencia-de-Genero-Material-de-Estudio.pdf',
  ],
  [
    5,
    'Concurso-Ingreso-2026-SCJM-Modulo-5-Atencion-para-un-Servicio-de-Justicia-Material-de-Estudio-1.pdf',
  ],
];

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      results.push({ path: full, isSymlink: true, isFile: false });
    } else if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push({ path: full, isSymlink: false, isFile: true });
    }
  }
  return results;
}

export function build_public(destination, options = {}) {
  const rootDir = options.root ? path.resolve(options.root) : defaultRoot;
  const sourceDir = path.join(DEFAULT_SOURCE_ROOT(rootDir), 'frontend/public');
  const dest = path.resolve(String(destination));
  if (
    dest === rootDir ||
    (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink())
  ) {
    throw new ValueError('Destino inválido.');
  }
  if (fs.existsSync(dest)) {
    throw new Error('El destino debe ser una carpeta nueva y vacía.');
  }
  fs.mkdirSync(dest, { recursive: true });

  for (const relative of PAGES) {
    const src = path.join(sourceDir, relative);
    if (fs.lstatSync(src).isSymbolicLink()) {
      throw new ValueError('No se empaquetan enlaces simbólicos.');
    }
    const target = path.join(dest, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(src, target);
  }

  for (const relative of DIRECTORIES) {
    const baseDir = path.join(sourceDir, relative);
    for (const item of walkFiles(baseDir)) {
      if (item.isSymlink) {
        throw new ValueError('No se empaquetan enlaces simbólicos.');
      }
      const ext = path.extname(item.path).toLowerCase();
      if (!item.isFile || !SUFFIXES.has(ext)) continue;
      if (ext === '.css') continue;
      const relToSource = path.relative(sourceDir, item.path);
      const target = path.join(dest, relToSource);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(item.path, target);
    }
  }

  const cssTarget = path.join(dest, 'css/main.css');
  fs.mkdirSync(path.dirname(cssTarget), { recursive: true });
  fs.writeFileSync(
    cssTarget,
    bundle_styles(path.join(sourceDir, 'css')),
    'utf8',
  );
  fs.writeFileSync(path.join(dest, '.nojekyll'), '', 'utf8');

  if (options.includeCampus) {
    const frontendDir = path.join(DEFAULT_SOURCE_ROOT(rootDir), 'frontend');
    const accessSrc = path.join(frontendDir, 'access.html');
    if (fs.existsSync(accessSrc) && !fs.lstatSync(accessSrc).isSymbolicLink()) {
      fs.copyFileSync(accessSrc, path.join(dest, 'access.html'));
    }
    const campusSrc = path.join(frontendDir, 'campus');
    if (fs.existsSync(campusSrc)) {
      for (const item of walkFiles(campusSrc)) {
        if (item.isSymlink || !item.isFile) continue;
        const ext = path.extname(item.path).toLowerCase();
        if (!['.html', '.css', '.js'].includes(ext)) continue;
        const rel = path.relative(campusSrc, item.path);
        const target = path.join(dest, 'campus', rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(item.path, target);
      }
    }
    const pdfFolder = path.join(
      DEFAULT_SOURCE_ROOT(rootDir),
      'assets ',
      'pdfs-estudio',
    );
    if (fs.existsSync(pdfFolder)) {
      const destPdfDir = path.join(dest, 'assets/pdfs-estudio');
      fs.mkdirSync(destPdfDir, { recursive: true });
      for (const [id, filename] of PDF_SOURCES) {
        const srcPdf = path.join(pdfFolder, filename);
        if (fs.existsSync(srcPdf) && !fs.lstatSync(srcPdf).isSymbolicLink()) {
          fs.copyFileSync(srcPdf, path.join(destPdfDir, `module-${id}.pdf`));
        }
      }
    }
  }

  return dest;
}

function DEFAULT_SOURCE_ROOT(rootDir) {
  if (fs.existsSync(path.join(rootDir, 'frontend/public/index.html'))) {
    return rootDir;
  }
  return defaultRoot;
}

export function rebuild_public(options = {}) {
  const rootDir = options.root ? path.resolve(options.root) : defaultRoot;
  const includeCampus = options.includeCampus ?? true;
  const target = path.join(rootDir, 'dist');
  if (
    (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) ||
    path.resolve(target) !== path.join(path.resolve(rootDir), 'dist')
  ) {
    throw new Error('Destino de compilación no seguro.');
  }
  const builds = path.join(rootDir, 'output/pages-builds');
  fs.mkdirSync(builds, { recursive: true });
  const stage = path.join(builds, `nuevo-${crypto.randomUUID().replace(/-/g, '')}`);
  build_public(stage, { root: rootDir, includeCampus });
  let previous = null;
  if (fs.existsSync(target)) {
    previous = path.join(
      builds,
      `anterior-${crypto.randomUUID().replace(/-/g, '')}`,
    );
    fs.renameSync(target, previous);
  }
  try {
    fs.renameSync(stage, target);
  } catch (err) {
    if (previous !== null && fs.existsSync(previous)) {
      fs.renameSync(previous, target);
    }
    throw err;
  }
  return target;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const target = rebuild_public({ includeCampus: true });
  console.log(
    `Paquete público generado: ${target}. Listo para publicar en GitHub Pages.`,
  );
}
