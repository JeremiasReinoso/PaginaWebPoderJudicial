/** Autenticación del panel administrativo: usuario y contraseña desde un archivo oculto, sesiones, roles y auditoría. */
import fs from 'node:fs';
import { CampusError } from './errors.js';
import { randomHex, randomId } from './random_ids.js';

const ROLES = ['admin', 'auditor', 'viewer'];

function norm(value) {
  return String(value).normalize('NFC');
}

/**
 * Lee las credenciales desde el archivo oculto (`backend/private/admin_credentials.json`).
 * Formato: { "users": [ { "username": "...", "password": "...", "role": "admin" } ] }
 */
export function loadAdminCredentials(credentialsFile) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  } catch {
    throw new CampusError(
      503,
      'El acceso administrativo no está configurado en este servidor.',
    );
  }
  const list = Array.isArray(parsed?.users) ? parsed.users : [];
  return list
    .filter(
      (u) =>
        u &&
        typeof u.username === 'string' &&
        typeof u.password === 'string' &&
        u.username.trim() &&
        u.password,
    )
    .map((u) => ({
      username: norm(u.username.trim()).toLowerCase(),
      displayName: norm(u.username.trim()),
      password: norm(u.password),
      role: ROLES.includes(u.role) ? u.role : 'admin',
    }));
}

export function recordAudit(
  db,
  { actorId = null, action, entityType, entityId = null, metadata = {} },
) {
  db.prepare(
    `INSERT INTO audit_logs(id, actor_id, action, entity_type, entity_id, timestamp, metadata)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomId(),
    actorId,
    action,
    entityType,
    entityId,
    new Date().toISOString(),
    JSON.stringify(metadata),
  );
}

export function authenticateAdmin(
  store,
  { username, password, ipAddress = '127.0.0.1' },
  config = {},
) {
  const windowSec = config.rateLimitWindowSeconds || 900;
  const maxAttempts = config.maxAdminLoginAttempts || 5;
  const idleSec = config.adminSessionIdleSeconds || 1800;
  const maxSessionSec = config.adminSessionMaxSeconds || 7200;

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password
  ) {
    throw new CampusError(400, 'Ingresá usuario y contraseña administrativos.');
  }

  const users = loadAdminCredentials(config.credentialsFile);
  const normalizedUsername = norm(username.trim()).toLowerCase();
  const now = Date.now() / 1000;
  const nowIso = new Date().toISOString();
  let failureError = null;
  let sessionData = null;

  store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM license_rate_limits WHERE attempted_at < ?').run(
      now - windowSec,
    );

    const failCount = db
      .prepare(
        `SELECT COUNT(*) AS count FROM license_rate_limits
         WHERE scope = 'admin_login' AND (identifier = ? OR identifier = ?)`,
      )
      .get(ipAddress, normalizedUsername).count;

    if (failCount >= maxAttempts) {
      recordAudit(db, {
        action: 'ADMIN_LOGIN_RATE_LIMITED',
        entityType: 'AdminUsers',
        metadata: { username: normalizedUsername },
      });
      failureError = new CampusError(
        429,
        'Demasiados intentos de inicio de sesión. Esperá 15 minutos.',
      );
      return;
    }

    const account = users.find((u) => u.username === normalizedUsername);
    const valid = Boolean(account) && account.password === norm(password);

    if (!valid) {
      db.prepare(
        'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
      ).run('admin_login', ipAddress, now);
      db.prepare(
        'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
      ).run('admin_login', normalizedUsername, now);
      recordAudit(db, {
        action: 'ADMIN_LOGIN_FAILED',
        entityType: 'AdminUsers',
        metadata: { username: normalizedUsername },
      });
      failureError = new CampusError(
        401,
        'Credenciales administrativas inválidas.',
      );
      return;
    }

    db.prepare(
      `DELETE FROM license_rate_limits
       WHERE scope = 'admin_login' AND (identifier = ? OR identifier = ?)`,
    ).run(ipAddress, normalizedUsername);

    // Registro del usuario en la base (solo identificación; la contraseña no se guarda).
    const adminId = `admin-${account.username}`;
    db.prepare(
      `INSERT INTO admin_users(id, username, role, created_at, last_login_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET role = excluded.role, last_login_at = excluded.last_login_at`,
    ).run(adminId, account.username, account.role, nowIso, nowIso);
    const user = db
      .prepare('SELECT id, username, role FROM admin_users WHERE username = ?')
      .get(account.username);

    db.prepare(
      'DELETE FROM admin_sessions WHERE expires_at < ? OR touched_at < ?',
    ).run(now, now - idleSec);

    const rawToken = randomHex(48);
    const csrfToken = randomHex(48);
    const sessionId = randomId();

    db.prepare(
      `INSERT INTO admin_sessions(id, token, csrf_token, admin_id, created_at, touched_at, expires_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, rawToken, csrfToken, user.id, now, now, now + maxSessionSec);

    recordAudit(db, {
      actorId: user.id,
      action: 'ADMIN_LOGIN_SUCCESS',
      entityType: 'AdminSessions',
      entityId: sessionId,
      metadata: { username: user.username, role: user.role },
    });

    sessionData = {
      token: rawToken,
      csrf: csrfToken,
      admin: {
        id: user.id,
        username: account.displayName,
        role: user.role,
      },
    };
  });

  if (failureError) throw failureError;
  return sessionData;
}

export function findAdminSession(store, rawToken, config = {}) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const idleSec = config.adminSessionIdleSeconds || 1800;
  const now = Date.now() / 1000;

  return store.withDb((db) => {
    const row = db
      .prepare(
        `SELECT s.*, u.username, u.role, u.disabled_at
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.admin_id
         WHERE s.token = ?`,
      )
      .get(rawToken);
    if (!row) return null;
    const expired =
      Boolean(row.revoked_at) ||
      Boolean(row.disabled_at) ||
      now >= row.expires_at ||
      now - row.touched_at > idleSec;
    if (expired) {
      db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(row.id);
      return null;
    }
    db.prepare('UPDATE admin_sessions SET touched_at = ? WHERE id = ?').run(
      now,
      row.id,
    );
    return {
      sessionId: row.id,
      csrf: row.csrf_token,
      admin: {
        id: row.admin_id,
        username: row.username,
        role: row.role,
      },
    };
  });
}

export function logoutAdminSession(store, session) {
  if (!session) return;
  store.withDb((db) => {
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(session.sessionId);
    recordAudit(db, {
      actorId: session.admin.id,
      action: 'ADMIN_LOGOUT',
      entityType: 'AdminSessions',
      entityId: session.sessionId,
      metadata: { username: session.admin.username },
    });
  });
}

export function requireRole(session, allowedRoles = ['admin']) {
  if (!session || !session.admin) {
    throw new CampusError(
      401,
      'Iniciá sesión administrativa para realizar esta operación.',
    );
  }
  if (!allowedRoles.includes(session.admin.role)) {
    throw new CampusError(
      403,
      'Permisos insuficientes para realizar esta operación administrativa.',
    );
  }
  return session.admin;
}
