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
  if (/^MJ[0-9A-F]{32}$/.test(normalized)) return normalized;
  if (/^PJ[0-9A-F]{40}$/.test(normalized)) return normalized;
  return null;
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
  const norm = normalize_code(code);
  const fingerprint = digest(norm || 'invalid');
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
      let access = db
        .prepare(
          `SELECT c.*, u.active AS account_active FROM access_codes c
           JOIN users u ON u.username = c.username WHERE fingerprint = ?`,
        )
        .get(fingerprint);

      if (!access && norm && norm.startsWith('PJ')) {
        let lic = null;
        try {
          lic =
            db.prepare('SELECT * FROM licenses WHERE code = ?').get(code) ||
            db
              .prepare(
                'SELECT * FROM licenses WHERE replace(replace(code, "-", ""), " ", "") = ?',
              )
              .get(norm);
        } catch {}

        if (lic) {
          if (lic.status === 'revoked') {
            db.prepare('INSERT INTO failures VALUES(?, ?, ?)').run(
              address,
              fingerprint,
              now,
            );
            failure = new CampusError(
              403,
              'La licencia ingresada ha sido revocada por administración.',
            );
            return;
          }
          const username = `estudiante_${(lic.code_prefix || norm.slice(0, 10)).replace(/[^A-Za-z0-9]/g, '')}`;
          const activatedAt = lic.activated_at || new Date().toISOString();
          const instId =
            lic.installation_id ||
            `inst_${crypto.randomBytes(8).toString('hex')}`;
          if (lic.status === 'available') {
            db.prepare(
              "UPDATE licenses SET status = 'activated', activated_at = ?, installation_id = ? WHERE id = ?",
            ).run(activatedAt, instId, lic.id);
            try {
              db.prepare(
                'INSERT INTO license_activations (id, license_id, installation_id, activated_at, ip_address) VALUES (?, ?, ?, ?, ?)',
              ).run(
                `act_${crypto.randomBytes(8).toString('hex')}`,
                lic.id,
                instId,
                activatedAt,
                address || '127.0.0.1',
              );
            } catch {}
          }
          db.prepare(
            "INSERT INTO users (username, salt, password, active) VALUES (?, '', '', 1) ON CONFLICT(username) DO NOTHING",
          ).run(username);
          db.prepare(
            'INSERT INTO access_codes (fingerprint, username, active, expires) VALUES (?, ?, 1, NULL) ON CONFLICT(fingerprint) DO UPDATE SET active = 1, expires = NULL',
          ).run(fingerprint, username);

          access = { username, active: 1, account_active: 1, expires: null };
        }
      }

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
