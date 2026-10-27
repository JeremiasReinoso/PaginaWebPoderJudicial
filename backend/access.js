/** Access-code and session operations. HTTP cookie parsing lives in transport. */
import crypto from 'node:crypto';
import { IDLE, LIFETIME } from './config.js';
import { CampusError } from './errors.js';

export function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function normalize_code(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return /^MJ[0-9A-F]{32}$/.test(normalized) ? normalized : null;
}

export function new_code() {
  const value = crypto.randomBytes(16).toString('hex').toUpperCase();
  const chunks = [];
  for (let i = 0; i < 32; i += 4) {
    chunks.push(value.slice(i, i + 4));
  }
  return `MJ-${chunks.join('-')}`;
}

export function find_session(store, token) {
  const key = digest(token || '');
  const now = Date.now() / 1000;
  return store.withDb((db) => {
    const row = db
      .prepare(
        `SELECT s.*, u.active, c.active AS code_active, c.expires AS code_expires
         FROM sessions s
         LEFT JOIN users u ON u.username = s.username
         LEFT JOIN access_codes c ON c.username = s.username
         WHERE token = ?`,
      )
      .get(key);
    if (!row) return null;
    const expired = now - row.created > LIFETIME || now - row.touched > IDLE;
    const revoked =
      Boolean(row.username) &&
      (row.active !== 1 ||
        row.code_active !== 1 ||
        (row.code_expires !== null &&
          row.code_expires !== undefined &&
          now >= row.code_expires));
    if (expired || revoked) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(key);
      return null;
    }
    db.prepare('UPDATE sessions SET touched = ? WHERE token = ?').run(now, key);
    return { ...row };
  });
}

export function authenticate(store, code, address) {
  if (typeof code !== 'string' || code.length < 1 || code.length > 128) {
    throw new CampusError(400, 'Ingresá tu código de acceso.');
  }
  const fingerprint = digest(normalize_code(code) || 'invalid');
  const now = Date.now() / 1000;
  let failure = null;
  let principal = null;
  store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM failures WHERE at < ?').run(now - 900);
    const countRow = db
      .prepare(
        'SELECT COUNT(*) AS count FROM failures WHERE address = ? OR username = ?',
      )
      .get(address, fingerprint);
    if (countRow.count >= 6) {
      failure = new CampusError(
        429,
        'Demasiados intentos. Esperá 15 minutos.',
      );
    } else {
      const access = db
        .prepare(
          `SELECT c.*, u.active AS account_active FROM access_codes c
           JOIN users u ON u.username = c.username WHERE fingerprint = ?`,
        )
        .get(fingerprint);
      if (
        !access ||
        access.active !== 1 ||
        access.account_active !== 1 ||
        (access.expires !== null &&
          access.expires !== undefined &&
          now >= access.expires)
      ) {
        db.prepare('INSERT INTO failures VALUES(?, ?, ?)').run(
          address,
          fingerprint,
          now,
        );
        failure = new CampusError(
          401,
          'Código incorrecto, vencido o no habilitado.',
        );
      } else {
        principal = access.username;
        db.prepare(
          'DELETE FROM failures WHERE address = ? OR username = ?',
        ).run(address, fingerprint);
      }
    }
  });
  // Commit failed-attempt evidence before returning the expected rejection.
  if (failure) throw failure;
  return principal;
}

export function logout(store, session) {
  store.withDb((db) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  });
}
