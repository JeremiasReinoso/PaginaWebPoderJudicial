/** Create a source ZIP for upload to a repository, excluding runtime/private files. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DIRECTORIES = [
  '.github',
  'frontend',
  'backend',
  'scripts',
  'tests',
  'docs',
];
export const ROOT_FILES = [
  'README.md',
  '.gitignore',
  '.gitattributes',
];
export const SUFFIXES = new Set([
  '.ps1',
  '.js',
  '.json',
  '.css',
  '.html',
  '.svg',
  '.webp',
  '.png',
  '.jpg',
  '.md',
  '.yml',
  '.yaml',
]);

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '__pycache__' ||
        entry.name === 'private'
      )
        continue;
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export function packageRepository() {
  const output = path.join(ROOT, 'output/repositorio-github.zip');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const entries = [];

  for (const name of ROOT_FILES) {
    const filePath = path.join(ROOT, name);
    if (
      fs.existsSync(filePath) &&
      !fs.lstatSync(filePath).isSymbolicLink() &&
      fs.statSync(filePath).isFile()
    ) {
      entries.push({ name, data: fs.readFileSync(filePath) });
    }
  }

  for (const directory of DIRECTORIES) {
    const dirPath = path.join(ROOT, directory);
    for (const filePath of walkFiles(dirPath)) {
      const ext = path.extname(filePath).toLowerCase();
      if (!SUFFIXES.has(ext)) continue;
      const rel = path.relative(ROOT, filePath).split(path.sep).join('/');
      entries.push({ name: rel, data: fs.readFileSync(filePath) });
    }
  }

  writeZip(output, entries);
  console.log(
    `ZIP del repositorio: ${output}. Sin códigos, bases, PDF ni archivos de ejecución local.`,
  );
  return output;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  packageRepository();
}
