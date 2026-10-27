/** Portable local preview entry point, copied as iniciar.js in the private ZIP. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function openBrowser(url) {
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else if (process.platform === 'darwin') {
    execFile('open', [url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

export async function main(argv = process.argv.slice(2)) {
  let port = 4173;
  let noBrowser = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) {
      port = Number.parseInt(argv[++i], 10);
    } else if (argv[i] === '--no-browser') {
      noBrowser = true;
    }
  }
  const root = __dirname;
  const state = path.join(root, 'private');
  const dbPath = path.join(state, 'campus.sqlite3');
  if (!fs.existsSync(dbPath)) {
    console.error(
      'Faltan archivos. Extraé TODO el ZIP antes de abrir INICIAR.cmd.',
    );
    process.exit(1);
  }
  const appModuleUrl = pathToFileURL(
    path.join(root, 'app', 'backend', 'app.js'),
  ).href;
  const storageModuleUrl = pathToFileURL(
    path.join(root, 'app', 'backend', 'storage.js'),
  ).href;
  const { Server } = await import(appModuleUrl);
  const { Store } = await import(storageModuleUrl);
  const store = new Store(dbPath);
  let server = new Server(port, store);
  try {
    await server.listen();
  } catch {
    server = new Server(0, store);
    await server.listen();
  }
  console.log(`Abrí: ${server.origin}/ingreso`);
  console.log(
    'El código está en codigo-amigo.txt. Dejá esta ventana abierta.',
  );
  if (!noBrowser) {
    openBrowser(`${server.origin}/ingreso`);
  }
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
