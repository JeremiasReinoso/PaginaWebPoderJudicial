/** License validation domain service: single-use codes, atomic activation, permanence, and audit. */
import crypto from 'node:crypto';
import { CampusError } from './errors.js';
import { sha256Hex, recordAudit } from './admin_auth.js';

export const LICENSE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  ACTIVATED: 'activated',
  REVOKED: 'revoked',
});

/**
 * Generates a high-entropy (160-bit) license code formatted as:
 * PJ-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (40 hex chars = 160 bits)
 */
export function generateLicenseCode() {
  const hex = crypto.randomBytes(20).toString('hex').toUpperCase();
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  const code = `PJ-${groups.join('-')}`;
  const prefix = `PJ-${groups[0]}-${groups[1]}`;
  return { code, prefix };
}

export function normalizeLicenseCode(rawCode) {
  if (typeof rawCode !== 'string') return null;
  const cleaned = rawCode.replace(/[-\s]/g, '').toUpperCase();
  if (!/^PJ[0-9A-F]{40}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function signInstallationToken(installationId, credential, secret) {
  const payload = `${installationId}.${credential}`;
  const signature = crypto
    .createHmac('sha256', String(secret))
    .update(payload, 'utf8')
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySignedInstallationToken(token, secret) {
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [installationId, credential, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', String(secret))
    .update(`${installationId}.${credential}`, 'utf8')
    .digest('base64url');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  return { installationId, credential };
}

/**
 * Creates a new single-use license. The plaintext code is returned ONLY once.
 */
export function createLicense(
  store,
  { adminId, clientReference = null },
) {
  if (!adminId || typeof adminId !== 'string') {
    throw new CampusError(401, 'Se requiere un administrador autorizado.');
  }
  const cleanRef =
    clientReference && typeof clientReference === 'string'
      ? clientReference.trim().slice(0, 120) || null
      : null;

  const { code, prefix } = generateLicenseCode();
  const normalized = normalizeLicenseCode(code);
  const codeHash = sha256Hex(normalized);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    store.withDb((db) => {
      db.exec('BEGIN IMMEDIATE');
      db.prepare(
        `INSERT INTO licenses(id, code_hash, code_prefix, client_reference, status, created_at, created_by)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        codeHash,
        prefix,
        cleanRef,
        LICENSE_STATUS.AVAILABLE,
        createdAt,
        adminId,
      );

      recordAudit(db, {
        actorId: adminId,
        action: 'LICENSE_CREATED',
        entityType: 'Licenses',
        entityId: id,
        metadata: {
          code_prefix: prefix,
          client_reference: cleanRef,
        },
      });
    });
  } catch (err) {
    if (err instanceof CampusError) throw err;
    throw new CampusError(
      500,
      'No se pudo registrar la licencia en la base de datos.',
    );
  }

  return {
    id,
    code, // Displayed once during creation/delivery
    code_prefix: prefix,
    client_reference: cleanRef,
    status: LICENSE_STATUS.AVAILABLE,
    created_at: createdAt,
    created_by: adminId,
  };
}

/**
 * Atomically activates a single-use license and associates it permanently with an installation.
 * Supports idempotent recovery ONLY if the same installation presents its valid cryptographic credential.
 */
export function activateLicense(
  store,
  {
    code,
    installationId = null,
    existingCredential = null,
    ipAddress = '127.0.0.1',
  },
  config = {},
) {
  const windowSec = config.rateLimitWindowSeconds || 900;
  const maxAttempts = config.maxActivationAttempts || 6;
  const secret = config.installationSecret || 'default-secret';

  if (typeof code !== 'string' || !code.trim()) {
    throw new CampusError(400, 'Ingresá un código de licencia válido.');
  }

  const requestedInstallationId =
    typeof installationId === 'string' &&
    /^[a-zA-Z0-9_-]{8,80}$/.test(installationId.trim())
      ? installationId.trim()
      : `inst_${crypto.randomBytes(16).toString('hex')}`;

  const normalized = normalizeLicenseCode(code);
  const now = Date.now() / 1000;
  const nowIso = new Date().toISOString();
  let failureError = null;
  let activationResponse = null;

  try {
    store.withDb((db) => {
      db.exec('BEGIN IMMEDIATE');
      db.prepare(
        'DELETE FROM license_rate_limits WHERE attempted_at < ?',
      ).run(now - windowSec);

      const attemptsCount = db
        .prepare(
          `SELECT COUNT(*) AS count FROM license_rate_limits
           WHERE scope = 'license_activation' AND (identifier = ? OR identifier = ?)`,
        )
        .get(ipAddress, requestedInstallationId).count;

      if (attemptsCount >= maxAttempts) {
        recordAudit(db, {
          actorId: null,
          action: 'LICENSE_ACTIVATION_RATE_LIMITED',
          entityType: 'Licenses',
          entityId: null,
          metadata: { installation_id: requestedInstallationId },
        });
        failureError = new CampusError(
          429,
          'Demasiados intentos fallidos de activación. Esperá 15 minutos.',
        );
        return;
      }

      if (!normalized) {
        db.prepare(
          'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
        ).run('license_activation', ipAddress, now);
        db.prepare(
          `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
           VALUES(?, NULL, ?, ?, 'rejected_invalid_format', ?)`,
        ).run(
          crypto.randomUUID(),
          requestedInstallationId,
          nowIso,
          JSON.stringify({ reason: 'invalid_format' }),
        );
        failureError = new CampusError(
          400,
          'El formato del código de licencia no es válido.',
        );
        return;
      }

      const codeHash = sha256Hex(normalized);
      const license = db
        .prepare('SELECT * FROM licenses WHERE code_hash = ?')
        .get(codeHash);

      if (!license) {
        db.prepare(
          'INSERT INTO license_rate_limits(scope, identifier, attempted_at) VALUES(?, ?, ?)',
        ).run('license_activation', ipAddress, now);
        db.prepare(
          `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
           VALUES(?, NULL, ?, ?, 'rejected_not_found', ?)`,
        ).run(
          crypto.randomUUID(),
          requestedInstallationId,
          nowIso,
          JSON.stringify({ reason: 'unknown_code' }),
        );
        recordAudit(db, {
          actorId: null,
          action: 'LICENSE_ACTIVATION_INVALID_CODE',
          entityType: 'Licenses',
          entityId: null,
          metadata: { installation_id: requestedInstallationId },
        });
        failureError = new CampusError(
          401,
          'El código de licencia ingresado no es válido.',
        );
        return;
      }

      if (license.status === LICENSE_STATUS.REVOKED) {
        db.prepare(
          `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
           VALUES(?, ?, ?, ?, 'rejected_revoked', ?)`,
        ).run(
          crypto.randomUUID(),
          license.id,
          requestedInstallationId,
          nowIso,
          JSON.stringify({ code_prefix: license.code_prefix }),
        );
        recordAudit(db, {
          actorId: null,
          action: 'LICENSE_ACTIVATION_REJECTED_REVOKED',
          entityType: 'Licenses',
          entityId: license.id,
          metadata: {
            code_prefix: license.code_prefix,
            installation_id: requestedInstallationId,
          },
        });
        failureError = new CampusError(
          403,
          'Esta licencia fue revocada y no puede utilizarse.',
        );
        return;
      }

      if (license.status === LICENSE_STATUS.ACTIVATED) {
        // Check if this is an idempotent retry from the exact same authorized installation
        // holding the valid server-issued installation credential.
        const parsedCred = verifySignedInstallationToken(
          existingCredential,
          secret,
        );
        const isSameAuthorizedInstallation =
          parsedCred &&
          parsedCred.installationId === license.installation_id &&
          license.installation_credential_hash &&
          sha256Hex(parsedCred.credential) ===
            license.installation_credential_hash;

        if (isSameAuthorizedInstallation) {
          db.prepare(
            `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
             VALUES(?, ?, ?, ?, 'idempotent_recovery', ?)`,
          ).run(
            crypto.randomUUID(),
            license.id,
            license.installation_id,
            nowIso,
            JSON.stringify({ code_prefix: license.code_prefix }),
          );
          activationResponse = {
            activated: true,
            permanent: true,
            idempotent: true,
            license_id: license.id,
            code_prefix: license.code_prefix,
            installation_id: license.installation_id,
            activated_at: license.activated_at,
            installation_token: existingCredential,
          };
          return;
        }

        // Reject any second use or attempt to reuse a consumed code
        db.prepare(
          `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
           VALUES(?, ?, ?, ?, 'rejected_already_used', ?)`,
        ).run(
          crypto.randomUUID(),
          license.id,
          requestedInstallationId,
          nowIso,
          JSON.stringify({ code_prefix: license.code_prefix }),
        );
        recordAudit(db, {
          actorId: null,
          action: 'LICENSE_ACTIVATION_REJECTED_DUPLICATE',
          entityType: 'Licenses',
          entityId: license.id,
          metadata: {
            code_prefix: license.code_prefix,
            attempted_installation_id: requestedInstallationId,
          },
        });
        failureError = new CampusError(
          409,
          'Este código de licencia ya fue utilizado y no puede volver a activarse.',
        );
        return;
      }

      // Ensure installation_id is not already bound to another active license
      const existingInst = db
        .prepare(
          'SELECT id FROM licenses WHERE installation_id = ? AND id != ?',
        )
        .get(requestedInstallationId, license.id);
      const finalInstallationId = existingInst
        ? `inst_${crypto.randomBytes(16).toString('hex')}`
        : requestedInstallationId;

      const rawCredential = crypto.randomBytes(32).toString('base64url');
      const credentialHash = sha256Hex(rawCredential);

      const updateResult = db
        .prepare(
          `UPDATE licenses
           SET status = 'activated',
               activated_at = ?,
               installation_id = ?,
               installation_credential_hash = ?
           WHERE id = ? AND status = 'available'`,
        )
        .run(nowIso, finalInstallationId, credentialHash, license.id);

      if (updateResult.changes !== 1) {
        failureError = new CampusError(
          409,
          'Este código de licencia ya fue utilizado y no puede volver a activarse.',
        );
        return;
      }

      db.prepare(
        `INSERT INTO license_activations(id, license_id, installation_id, activated_at, activation_result, metadata)
         VALUES(?, ?, ?, ?, 'activated', ?)`,
      ).run(
        crypto.randomUUID(),
        license.id,
        finalInstallationId,
        nowIso,
        JSON.stringify({ code_prefix: license.code_prefix }),
      );

      recordAudit(db, {
        actorId: null,
        action: 'LICENSE_ACTIVATED',
        entityType: 'Licenses',
        entityId: license.id,
        metadata: {
          code_prefix: license.code_prefix,
          installation_id: finalInstallationId,
        },
      });

      const signedToken = signInstallationToken(
        finalInstallationId,
        rawCredential,
        secret,
      );

      activationResponse = {
        activated: true,
        permanent: true,
        idempotent: false,
        license_id: license.id,
        code_prefix: license.code_prefix,
        installation_id: finalInstallationId,
        activated_at: nowIso,
        installation_token: signedToken,
      };
    });
  } catch (err) {
    if (err instanceof CampusError) throw err;
    throw new CampusError(
      500,
      'Error de persistencia al procesar la activación de la licencia.',
    );
  }

  if (failureError) throw failureError;
  return activationResponse;
}

/**
 * Verifies in the database whether the installation credential corresponds to an active, non-revoked license.
 * Never trusts localStorage alone; requires the signed cryptographic credential matching the database hash.
 */
export function verifyInstallationStatus(
  store,
  installationToken,
  config = {},
) {
  const secret = config.installationSecret || 'default-secret';
  const parsed = verifySignedInstallationToken(installationToken, secret);
  if (!parsed) {
    return { activated: false };
  }

  try {
    return store.withDb((db) => {
      const license = db
        .prepare(
          `SELECT id, code_prefix, client_reference, status, activated_at, installation_id, installation_credential_hash
           FROM licenses
           WHERE installation_id = ?`,
        )
        .get(parsed.installationId);

      if (
        !license ||
        license.status !== LICENSE_STATUS.ACTIVATED ||
        !license.installation_credential_hash
      ) {
        return { activated: false };
      }

      const candidateHash = Buffer.from(
        sha256Hex(parsed.credential),
        'utf8',
      );
      const storedHash = Buffer.from(
        license.installation_credential_hash,
        'utf8',
      );
      if (
        candidateHash.length !== storedHash.length ||
        !crypto.timingSafeEqual(candidateHash, storedHash)
      ) {
        return { activated: false };
      }

      return {
        activated: true,
        permanent: true,
        license_id: license.id,
        code_prefix: license.code_prefix,
        installation_id: license.installation_id,
        activated_at: license.activated_at,
      };
    });
  } catch {
    throw new CampusError(
      503,
      'El servicio de validación de licencias no está disponible temporalmente.',
    );
  }
}

/**
 * Explicitly revokes a license (available or activated) and records an audit log entry.
 */
export function revokeLicense(
  store,
  { licenseId, adminId, reason = 'Revocación administrativa explícita' },
) {
  if (!licenseId || typeof licenseId !== 'string') {
    throw new CampusError(400, 'Identificador de licencia inválido.');
  }
  const nowIso = new Date().toISOString();

  return store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    const license = db
      .prepare('SELECT * FROM licenses WHERE id = ?')
      .get(licenseId);
    if (!license) {
      throw new CampusError(404, 'Licencia no encontrada.');
    }
    if (license.status === LICENSE_STATUS.REVOKED) {
      throw new CampusError(409, 'La licencia ya se encuentra revocada.');
    }

    db.prepare(
      `UPDATE licenses
       SET status = 'revoked',
           revoked_at = ?,
           revoked_by = ?,
           installation_credential_hash = NULL
       WHERE id = ?`,
    ).run(nowIso, adminId, licenseId);

    recordAudit(db, {
      actorId: adminId,
      action: 'LICENSE_REVOKED',
      entityType: 'Licenses',
      entityId: licenseId,
      metadata: {
        previous_status: license.status,
        code_prefix: license.code_prefix,
        reason: String(reason).slice(0, 200),
      },
    });

    return {
      id: licenseId,
      code_prefix: license.code_prefix,
      status: LICENSE_STATUS.REVOKED,
      revoked_at: nowIso,
      revoked_by: adminId,
    };
  });
}

/**
 * Explicit administrative procedure when an unactivated ('available') license code is lost:
 * invalidates (revokes) the lost license and generates a replacement in an atomic transaction.
 * Activated licenses CANNOT be replaced or reset to available.
 */
export function replaceLostUnusedLicense(store, { licenseId, adminId }) {
  if (!licenseId || typeof licenseId !== 'string') {
    throw new CampusError(400, 'Identificador de licencia inválido.');
  }
  const nowIso = new Date().toISOString();
  const { code, prefix } = generateLicenseCode();
  const normalized = normalizeLicenseCode(code);
  const codeHash = sha256Hex(normalized);
  const newId = crypto.randomUUID();

  return store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    const oldLicense = db
      .prepare('SELECT * FROM licenses WHERE id = ?')
      .get(licenseId);
    if (!oldLicense) {
      throw new CampusError(404, 'Licencia no encontrada.');
    }
    if (oldLicense.status !== LICENSE_STATUS.AVAILABLE) {
      throw new CampusError(
        409,
        'Solo se puede reemplazar un código que aún no haya sido activado ni revocado.',
      );
    }

    db.prepare(
      `UPDATE licenses
       SET status = 'revoked', revoked_at = ?, revoked_by = ?
       WHERE id = ? AND status = 'available'`,
    ).run(nowIso, adminId, licenseId);

    db.prepare(
      `INSERT INTO licenses(id, code_hash, code_prefix, client_reference, status, created_at, created_by)
       VALUES(?, ?, ?, ?, 'available', ?, ?)`,
    ).run(
      newId,
      codeHash,
      prefix,
      oldLicense.client_reference,
      nowIso,
      adminId,
    );

    recordAudit(db, {
      actorId: adminId,
      action: 'LICENSE_REPLACED_LOST_CODE',
      entityType: 'Licenses',
      entityId: newId,
      metadata: {
        invalidated_license_id: licenseId,
        old_prefix: oldLicense.code_prefix,
        new_prefix: prefix,
        client_reference: oldLicense.client_reference,
      },
    });

    return {
      invalidated_id: licenseId,
      replacement: {
        id: newId,
        code, // Shown once
        code_prefix: prefix,
        client_reference: oldLicense.client_reference,
        status: LICENSE_STATUS.AVAILABLE,
        created_at: nowIso,
      },
    };
  });
}

/**
 * Lists and filters licenses, statistics, and audit history without exposing sensitive hashes.
 */
export function queryLicensesAdmin(
  store,
  { status = '', search = '', limit = 100 } = {},
) {
  return store.withDb((db) => {
    const conditions = [];
    const params = [];

    if (
      status &&
      [
        LICENSE_STATUS.AVAILABLE,
        LICENSE_STATUS.ACTIVATED,
        LICENSE_STATUS.REVOKED,
      ].includes(status)
    ) {
      conditions.push('l.status = ?');
      params.push(status);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const pattern = `%${search.trim()}%`;
      conditions.push(
        '(l.code_prefix LIKE ? OR l.client_reference LIKE ? OR l.installation_id LIKE ?)',
      );
      params.push(pattern, pattern, pattern);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

    const rows = db
      .prepare(
        `SELECT l.id, l.code_prefix, l.client_reference, l.status,
                l.created_at, l.activated_at, l.installation_id,
                l.created_by, u.username AS created_by_username,
                l.revoked_at, l.revoked_by
         FROM licenses l
         LEFT JOIN admin_users u ON u.id = l.created_by
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ?`,
      )
      .all(...params, safeLimit);

    const statsRows = db
      .prepare(
        'SELECT status, COUNT(*) AS count FROM licenses GROUP BY status',
      )
      .all();
    const stats = {
      total: 0,
      available: 0,
      activated: 0,
      revoked: 0,
    };
    for (const r of statsRows) {
      stats[r.status] = r.count;
      stats.total += r.count;
    }

    const auditLogs = db
      .prepare(
        `SELECT a.id, a.actor_id, u.username AS actor_username, a.action,
                a.entity_type, a.entity_id, a.timestamp, a.metadata
         FROM audit_logs a
         LEFT JOIN admin_users u ON u.id = a.actor_id
         ORDER BY a.timestamp DESC
         LIMIT 50`,
      )
      .all()
      .map((row) => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
      }));

    const activations = db
      .prepare(
        `SELECT id, license_id, installation_id, activated_at, activation_result, metadata
         FROM license_activations
         ORDER BY activated_at DESC
         LIMIT 50`,
      )
      .all()
      .map((row) => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
      }));

    return {
      stats,
      licenses: rows.map((r) => ({ ...r })),
      auditLogs,
      activations,
    };
  });
}

/**
 * Exports administrative license listing without password hashes, code hashes, secrets, or tokens.
 */
export function exportLicensesReport(store, format = 'json') {
  const { licenses } = queryLicensesAdmin(store, { limit: 500 });
  const sanitized = licenses.map((l) => ({
    id: l.id,
    code_prefix: l.code_prefix,
    client_reference: l.client_reference || '',
    status: l.status,
    created_at: l.created_at,
    activated_at: l.activated_at || '',
    installation_id: l.installation_id || '',
    created_by_username: l.created_by_username || '',
    revoked_at: l.revoked_at || '',
  }));

  if (format === 'csv') {
    const headers = [
      'id',
      'code_prefix',
      'client_reference',
      'status',
      'created_at',
      'activated_at',
      'installation_id',
      'created_by_username',
      'revoked_at',
    ];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...sanitized.map((row) =>
        headers.map((h) => escapeCsv(row[h])).join(','),
      ),
    ];
    return lines.join('\n');
  }

  return sanitized;
}
