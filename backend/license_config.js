/** Configuración del sistema de licencias a partir de variables de entorno. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Archivo oculto con el usuario y la contraseña del panel de licencias.
 * Está en `backend/private/`, excluido de Git, del paquete público y del servidor web.
 */
export const DEFAULT_CREDENTIALS_FILE = path.join(
  __dirname,
  'private',
  'admin_credentials.json',
);

export function getLicenseConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const rawAdminPath = (env.ADMIN_PANEL_PATH || '/panel-licencias').trim();
  const adminPanelPath = rawAdminPath.startsWith('/')
    ? rawAdminPath.replace(/\/+$/, '') || '/panel-licencias'
    : `/${rawAdminPath.replace(/\/+$/, '')}`;

  return Object.freeze({
    nodeEnv,
    isProduction,
    dbPath:
      env.LICENSE_DB_PATH || path.join(DEFAULT_STATE, 'campus.sqlite3'),
    adminPanelPath,
    credentialsFile: env.ADMIN_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE,
    adminSessionCookie: env.ADMIN_SESSION_COOKIE || 'mj_admin_session',
    installationCookie: env.INSTALLATION_COOKIE || 'mj_installation_cred',
    adminSessionIdleSeconds: 30 * 60,
    adminSessionMaxSeconds: 2 * 60 * 60,
    rateLimitWindowSeconds: 15 * 60,
    maxActivationAttempts: 6,
    maxAdminLoginAttempts: 5,
  });
}
