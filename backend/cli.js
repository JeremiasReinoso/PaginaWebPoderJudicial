/** Local bootstrap and administrative code commands. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, DEFAULT_STATE } from './config.js';
import { Store } from './storage.js';
import { Server } from './app.js';

function isRelativeTo(targetPath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseArgs(argv) {
  const args = {
    port: 4173,
    state: DEFAULT_STATE,
    init: false,
    createCode: null,
    revokeCode: null,
    days: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      args.port = Number.parseInt(argv[++i], 10);
    } else if (arg === '--state' && argv[i + 1]) {
      args.state = argv[++i];
    } else if (arg === '--init') {
      args.init = true;
    } else if (arg === '--create-code' && argv[i + 1]) {
      args.createCode = argv[++i];
    } else if (arg === '--revoke-code' && argv[i + 1]) {
      args.revokeCode = argv[++i];
    } else if (arg === '--days' && argv[i + 1]) {
      args.days = Number.parseInt(argv[++i], 10);
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state);
  if (isRelativeTo(state, ROOT)) {
    console.error('Guardá el estado fuera de la carpeta pública.');
    process.exit(1);
  }
  const store = new Store(path.join(state, 'campus.sqlite3'));

  if (args.revokeCode) {
    store.withDb((db) => {
      db.prepare('UPDATE access_codes SET active = 0 WHERE username = ?').run(
        args.revokeCode,
      );
      db.prepare('DELETE FROM sessions WHERE username = ?').run(
        args.revokeCode,
      );
    });
    console.log('Código deshabilitado y sesiones revocadas.');
    return;
  }

  if (args.init || args.createCode) {
    const principal = args.init ? 'prueba' : args.createCode;
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(principal)) {
      console.error(
        'Usá una etiqueta interna de hasta 60 letras, números o guiones.',
      );
      process.exit(1);
    }
    if (args.days !== null && args.days <= 0) {
      console.error('La duración debe ser positiva.');
      process.exit(1);
    }
    const existing = store.withDb((db) =>
      db
        .prepare('SELECT username FROM access_codes WHERE username = ?')
        .get(principal),
    );
    const accessPath = path.join(state, `codigo-${principal}.txt`);
    if (!existing) {
      const expires = args.days ? Date.now() / 1000 + args.days * 86400 : null;
      const code = store.create_code(principal, null, expires);
      fs.writeFileSync(
        accessPath,
        `URL: http://127.0.0.1:${args.port}/ingreso\nCódigo: ${code}\nEtiqueta interna: ${principal}\nSolo prueba local. No subir este archivo a GitHub.\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
    } else if (args.createCode) {
      console.error(
        'La etiqueta ya tiene un código. Usá una etiqueta nueva; no se reemplaza automáticamente.',
      );
      process.exit(1);
    }
    console.log(`Acceso por código preparado. Archivo privado: ${accessPath}`);
    return;
  }

  const server = new Server(args.port, store);
  await server.listen();
  console.log(`Campus de prueba local: ${server.origin}`);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  await main();
}
