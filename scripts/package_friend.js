/** Build a private, isolated preview ZIP. Never publish its output to Pages. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build_public } from './package_pages.js';
import { writeZip } from './zip.js';
import { DEFAULT_STATE } from '../backend/config.js';
import { Store } from '../backend/storage.js';
import { digest, normalize_code } from '../backend/access.js';
import { load_library } from '../backend/library.js';
import { ValueError } from '../backend/domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function isRelativeTo(targetPath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function prepare_access(stateDir) {
  const state = path.resolve(String(stateDir));
  const deliveryPath = path.join(state, 'entrega-amigo.json');
  const store = new Store(path.join(state, 'campus.sqlite3'));

  if (fs.existsSync(deliveryPath)) {
    const delivery = JSON.parse(fs.readFileSync(deliveryPath, 'utf8'));
    const normalized = normalize_code(delivery.code);
    if (!normalized) {
      throw new ValueError('El archivo de entrega contiene un código inválido.');
    }
    const row = store.withDb((db) =>
      db
        .prepare(
          `SELECT c.active, c.expires, c.username, u.active AS account_active
           FROM access_codes c JOIN users u ON u.username = c.username
           WHERE c.fingerprint = ?`,
        )
        .get(digest(normalized)),
    );
    const now = Date.now() / 1000;
    if (
      !row ||
      row.active !== 1 ||
      row.account_active !== 1 ||
      row.username !== delivery.principal ||
      (row.expires !== null && row.expires !== undefined && row.expires <= now)
    ) {
      throw new ValueError(
        'El acceso fue revocado, venció o no corresponde a esta entrega.',
      );
    }
    delivery.expires = row.expires;
    return delivery;
  }

  const principal = `amigo_${crypto.randomBytes(4).toString('hex')}`;
  const code = store.create_code(principal);
  const delivery = { principal, code };
  fs.writeFileSync(deliveryPath, JSON.stringify(delivery), 'utf8');
  return delivery;
}

function copyTreeFiltered(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (
      entry.name === '__pycache__' ||
      entry.name === '.gitkeep' ||
      entry.name.endsWith('.pyc')
    ) {
      continue;
    }
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function walkAllFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkAllFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export function build_friend(stateDir, runtime = null) {
  const state = path.resolve(String(stateDir));
  load_library(state); // Fail before issuing a code if the promised material is absent.
  const delivery = prepare_access(state);
  const output = path.join(ROOT, 'output');
  fs.mkdirSync(output, { recursive: true });
  const builds = path.join(state, 'builds');
  fs.mkdirSync(builds, { recursive: true });
  const stage = fs.mkdtempSync(path.join(builds, 'amigo-'));
  if (!isRelativeTo(stage, builds)) {
    throw new ValueError('Destino fuera de la carpeta privada de compilación.');
  }
  const bundle = path.join(stage, 'MetodoJudicial-Prueba');
  fs.mkdirSync(bundle, { recursive: true });

  copyTreeFiltered(
    path.join(ROOT, 'backend'),
    path.join(bundle, 'app/backend'),
  );
  copyTreeFiltered(
    path.join(ROOT, 'frontend/campus'),
    path.join(bundle, 'app/frontend/campus'),
  );
  fs.mkdirSync(path.join(bundle, 'app/frontend'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'frontend/access.html'),
    path.join(bundle, 'app/frontend/access.html'),
  );
  fs.copyFileSync(
    path.join(ROOT, 'package.json'),
    path.join(bundle, 'package.json'),
  );
  build_public(path.join(bundle, 'app/frontend/public'));

  const privateDir = path.join(bundle, 'private');
  copyTreeFiltered(
    path.join(state, 'library'),
    path.join(privateDir, 'library'),
  );
  const isolated = new Store(path.join(privateDir, 'campus.sqlite3'));
  isolated.create_code(
    delivery.principal,
    delivery.code,
    delivery.expires ?? null,
  );
  fs.copyFileSync(
    path.join(ROOT, 'scripts/share_launcher.js'),
    path.join(bundle, 'iniciar.js'),
  );

  const credential = `Código de acceso: ${delivery.code}\nNo se solicita usuario ni contraseña adicional.\n`;
  fs.writeFileSync(path.join(bundle, 'codigo-amigo.txt'), credential, 'utf8');
  fs.writeFileSync(
    path.join(output, 'credencial-amigo.txt'),
    credential,
    'utf8',
  );

  if (runtime) {
    copyTreeFiltered(path.resolve(String(runtime)), path.join(bundle, 'runtime'));
  }

  const launcher = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'if exist "runtime\\node.exe" (',
    '  "runtime\\node.exe" iniciar.js',
    ') else (',
    '  node iniciar.js',
    ')',
    'pause',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(bundle, 'INICIAR.cmd'), launcher, 'ascii');

  fs.writeFileSync(
    path.join(bundle, 'LEEME.txt'),
    `MÉTODO JUDICIAL · PRUEBA PRIVADA

1. Extraé TODO el ZIP en una carpeta de tu computadora.
2. En Windows 64 bits, abrí INICIAR.cmd (requiere Node.js o el runtime incluido).
3. Se abrirá el navegador. Pegá el código de codigo-amigo.txt.
4. Probá Biblioteca, exámenes, comprensión lectora, mecanografía y resultados.
5. Dejá la ventana de consola abierta mientras usás la página. Cerrala al terminar.
`,
    'utf8',
  );

  const archive = path.join(output, 'MetodoJudicial-Para-Amigo.zip');
  const entries = walkAllFiles(bundle).map((filePath) => ({
    name: path.relative(stage, filePath).split(path.sep).join('/'),
    data: fs.readFileSync(filePath),
  }));
  writeZip(archive, entries);
  return [archive, bundle];
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let state = DEFAULT_STATE;
  let runtime = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--state' && argv[i + 1]) state = argv[++i];
    if (argv[i] === '--runtime' && argv[i + 1]) runtime = argv[++i];
  }
  const [archive] = build_friend(state, runtime);
  console.log(
    `Prueba privada: ${archive}. Credencial separada en output/credencial-amigo.txt.`,
  );
}
