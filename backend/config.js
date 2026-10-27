/** Filesystem and local-session settings; no credentials in source control. */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const FRONTEND = path.join(ROOT, 'frontend');
export const PUBLIC = path.join(FRONTEND, 'public');
export const DEFAULT_STATE = path.join(
  os.homedir(),
  '.codex',
  'private',
  'MetodoJudicialPrueba',
);
export const COOKIE = 'mj_session';
export const IDLE = 30 * 60;
export const LIFETIME = 2 * 60 * 60;
export const PUBLIC_PAGES = new Set([
  '/',
  '/index.html',
  ...[
    'material-estudio',
    'institucional',
    'contacto',
    'novedades',
    'terminos',
    'privacidad',
    'fuentes',
  ].map((name) => `/pages/${name}.html`),
]);
