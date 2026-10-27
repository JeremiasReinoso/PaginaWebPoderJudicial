/** Administrative authentication, memory-hard password hashing, sessions, RBAC, and audit logging. */
import crypto from 'node:crypto';
import { CampusError } from './errors.js';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEYLEN = 64;

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) {
    throw new CampusError(
      400,
      'La contraseña administrativa debe tener entre 10 y 256 caracteres.',
    );
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS)
    .toString('hex');
  return `$scrypt$n=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 5 || parts[1] !== 'scrypt') return false;
  const salt = parts[3];
  const expectedHex = parts[4];
  try {
    const derived = crypto.scryptSync(password, salt, KEYLEN, SCRYPT_PARAMS);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function recordAudit(db, { actorId = null, action, entityType, entityId = null, metadata = {} }) {
  db.prepare(
    `INSERT INTO audit_logs(id, actor_id, action, entity_type, entity_id, timestamp, metadata)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    actorId,
    action,
    entityType,
    entityId,
    new Date().toISOString(),
    JSON.stringify(metadata),
  );
}

export function createAdminUser(
  store,
  { username, password, role = 'admin', actorId = null },
) {
  if (
    typeof username !== 'string' ||
    !/^[a-zA-Z0-9_.-]{3,60}$/.test(username.trim())
  ) {
    throw new CampusError(
      400,
      'Nombre de usuario inválido (3 a 60 caracteres alfanuméricos).',
    );
  }
  if (!['admin', 'auditor', 'viewer'].includes(role)) {
    throw new CampusError(400, 'Rol administrativo inválido.');
  }
  const normalizedUsername = username.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    const existing = db
      .prepare('SELECT id FROM admin_users WHERE username = ?')
      .get(normalizedUsername);
    if (existing) {
      throw new CampusError(409, 'El usuario administrativo ya existe.');
    }
    db.prepare(
      `INSERT INTO admin_users(id, username, password_hash, role, created_at)
       VALUES(?, ?, ?, ?, ?)`,
    ).run(id, normalizedUsername, passwordHash, role, nowIso);
    recordAudit(db, {
      actorId: actorId || id,
      action: 'ADMIN_USER_CREATED',
      entityType: 'AdminUsers',
      entityId: id,
      metadata: { username: normalizedUsername, role },
    });
  });

  return { id, username: normalizedUsername, role, created_at: nowIso };
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

  const normalizedUsername = username.trim().toLowerCase();
  const now = Date.now() / 1000;
  const nowIso = new Date().toISOString();
  let failureError = null;
  let sessionData = null;

  store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    db.prepare(
      'DELETE FROM license_rate_limits WHERE attempted_at < ?',
    ).run(now - windowSec);

    const failCount = db
      .prepare(
        `SELECT COUNT(*) AS count FROM license_rate_limits
         WHERE scope = 'admin_login' AND (identifier = ? OR identifier = ?)`,
      )
      .get(ipAddress, normalizedUsername).count;

    if (failCount >= maxAttempts) {
      recordAudit(db, {
        actorId: null,
        action: 'ADMIN_LOGIN_RATE_LIMITED',
        entityType: 'AdminUsers',
        entityId: null,
        metadata: { username: normalizedUsername },
      });
      failureError = new CampusError(
        429,
        'Demasiados intentos de inicio de sesión. Esperá 15 minutos.',
      );
      return;
    }

    const user = db
      .prepare('SELECT * FROM admin_users WHERE username = ?')
      .get(normalizedUsername);

    const passwordValid = user
      ? verifyPassword(password, user.password_hash)
      : false;

    if (!user || !passwordValid || user.disabled_at) {
      db.prepare(
        'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
      ).run('admin_login', ipAddress, now);
      db.prepare(
        'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
      ).run('admin_login', normalizedUsername, now);
      recordAudit(db, {
        actorId: user ? user.id : null,
        action: 'ADMIN_LOGIN_FAILED',
        entityType: 'AdminUsers',
        entityId: user ? user.id : null,
        metadata: { username: normalizedUsername },
      });
      failureError = new CampusError(
        401,
        'Credenciales administrativas inválidas o cuenta deshabilitada.',
      );
      return;
    }

    db.prepare(
      `DELETE FROM license_rate_limits
       WHERE scope = 'admin_login' AND (identifier = ? OR identifier = ?)`,
    ).run(ipAddress, normalizedUsername);

    db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(
      nowIso,
      user.id,
    );

    // Clean expired admin sessions
    db.prepare(
      'DELETE FROM admin_sessions WHERE expires_at < ? OR touched_at < ?',
    ).run(now, now - idleSec);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    const sessionId = crypto.randomUUID();

    db.prepare(
      `INSERT INTO admin_sessions(id, token_hash, csrf_token, admin_id, created_at, touched_at, expires_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      sha256Hex(rawToken),
      csrfToken,
      user.id,
      now,
      now,
      now + maxSessionSec,
    );

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
        username: user.username,
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
  const tokenHash = sha256Hex(rawToken);
  const now = Date.now() / 1000;

  return store.withDb((db) => {
    const row = db
      .prepare(
        `SELECT s.*, u.username, u.role, u.disabled_at
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.admin_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash);
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
      tokenHash: row.token_hash,
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
    db.prepare(
      'UPDATE admin_sessions SET revoked_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), session.sessionId);
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(
      session.sessionId,
    );
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
