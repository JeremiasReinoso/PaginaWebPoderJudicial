/** Secure CLI bootstrap to initialize an administrative user without hardcoding credentials. */
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Store } from '../backend/storage.js';
import { getLicenseConfig } from '../backend/license_config.js';
import { createAdminUser } from '../backend/admin_auth.js';

function parseArgs(argv) {
  const args = {
    username: null,
    role: 'admin',
    dbPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--username' && argv[i + 1]) {
      args.username = argv[++i];
    } else if (argv[i] === '--role' && argv[i + 1]) {
      args.role = argv[++i];
    } else if (argv[i] === '--db' && argv[i + 1]) {
      args.dbPath = argv[++i];
    }
  }
  return args;
}

function promptPassword(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.username) {
    console.error(
      'Uso: node scripts/init_admin.js --username <usuario> [--role admin|auditor|viewer] [--db <ruta_sqlite>]',
    );
    process.exit(1);
  }
  const config = getLicenseConfig(
    args.dbPath ? { LICENSE_DB_PATH: args.dbPath } : {},
  );
  let password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!password) {
    password = await promptPassword(
      `Contraseña para el administrador "${args.username}" (mínimo 10 caracteres): `,
    );
  }
  const store = new Store(config.dbPath);
  const created = createAdminUser(store, {
    username: args.username,
    password: password.trim(),
    role: args.role,
  });
  console.log(
    `Administrador creado correctamente: ${created.username} (rol: ${created.role}, id: ${created.id})`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  await main();
}
