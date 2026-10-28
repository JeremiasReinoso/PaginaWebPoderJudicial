/** Versioned database migrations and schema for Licenses, AdminUsers, LicenseActivations, and AuditLogs. */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS = [
  {
    version: 1,
    name: '001_create_license_validation_schema',
    up: `
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'auditor', 'viewer')),
        created_at TEXT NOT NULL,
        last_login_at TEXT,
        disabled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        csrf_token TEXT NOT NULL,
        admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        created_at REAL NOT NULL,
        touched_at REAL NOT NULL,
        expires_at REAL NOT NULL,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id TEXT PRIMARY KEY,
        code_hash TEXT UNIQUE NOT NULL,
        code_prefix TEXT NOT NULL,
        client_reference TEXT,
        status TEXT NOT NULL CHECK (status IN ('available', 'activated', 'revoked')),
        created_at TEXT NOT NULL,
        activated_at TEXT,
        installation_id TEXT UNIQUE,
        installation_credential_hash TEXT,
        created_by TEXT NOT NULL REFERENCES admin_users(id),
        revoked_at TEXT,
        revoked_by TEXT REFERENCES admin_users(id)
      );

      CREATE TABLE IF NOT EXISTS license_activations (
        id TEXT PRIMARY KEY,
        license_id TEXT REFERENCES licenses(id),
        installation_id TEXT NOT NULL,
        activated_at TEXT NOT NULL,
        activation_result TEXT NOT NULL,
        metadata TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT REFERENCES admin_users(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        timestamp TEXT NOT NULL,
        metadata TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS license_rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        identifier TEXT NOT NULL,
        attempted_at REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
      CREATE INDEX IF NOT EXISTS idx_licenses_prefix ON licenses(code_prefix);
      CREATE INDEX IF NOT EXISTS idx_licenses_installation ON licenses(installation_id);
      CREATE INDEX IF NOT EXISTS idx_activations_license ON license_activations(license_id);
      CREATE INDEX IF NOT EXISTS idx_activations_installation ON license_activations(installation_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON license_rate_limits(scope, identifier, attempted_at);
    `,
  },
  {
    version: 2,
    name: '002_seed_sheila_admin_user',
    up: `
      INSERT OR IGNORE INTO admin_users (id, username, password_hash, role, created_at)
      VALUES (
        'admin-sheila-2026',
        'sheila',
        '$scrypt$n=16384,r=8,p=1$f3df7ca6de33f7c4582e8f397c3d890b$3f7586893809d85166bcadf3b3a25c97db98625204e0f63e9ca33ce996d6ad836e657f31aead21fca61cd7a25f965f57e19c1b987a5218f00b0d0b7f6ae049d9',
        'admin',
        '2026-10-27T00:00:00.000Z'
      );
    `,
  },
];

export function runLicenseMigrations(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.up);
      db.prepare(
        'INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      if (db.isTransaction) {
        db.exec('ROLLBACK');
      }
      throw error;
    }
  }
}

export class LicenseDatabase {
  constructor(dbPath) {
    this.path = path.resolve(String(dbPath));
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    this.withDb((db) => {
      runLicenseMigrations(db);
    });
  }

  withDb(callback) {
    const db = new DatabaseSync(this.path, { timeout: 10000 });
    try {
      db.exec('PRAGMA foreign_keys = ON;');
      const result = callback(db);
      if (db.isTransaction) {
        db.exec('COMMIT');
      }
      return result;
    } catch (error) {
      if (db.isTransaction) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // ignore rollback error
        }
      }
      throw error;
    } finally {
      db.close();
    }
  }
}
