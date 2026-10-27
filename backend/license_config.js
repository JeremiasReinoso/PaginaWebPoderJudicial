/** Environment configuration for the License Validation System; no embedded secrets. */
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_STATE } from './config.js';

// Generate an ephemeral per-process secret if none is provided in dev/test,
// never a static hardcoded production secret.
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

export function getLicenseConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  if (isProduction && !env.INSTALLATION_TOKEN_SECRET) {
    throw new Error(
      'INSTALLATION_TOKEN_SECRET es obligatorio en entorno de producción.',
    );
  }

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
    installationSecret:
      env.INSTALLATION_TOKEN_SECRET || EPHEMERAL_DEV_SECRET,
    adminSessionCookie: env.ADMIN_SESSION_COOKIE || 'mj_admin_session',
    installationCookie: env.INSTALLATION_COOKIE || 'mj_installation_cred',
    adminSessionIdleSeconds: 30 * 60,
    adminSessionMaxSeconds: 2 * 60 * 60,
    rateLimitWindowSeconds: 15 * 60,
    maxActivationAttempts: 6,
    maxAdminLoginAttempts: 5,
  });
}
