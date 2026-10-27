/** SQLite persistence and backwards-compatible schema initialization. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { digest, normalize_code, new_code } from './access.js';
import { IDLE, LIFETIME } from './config.js';
import { ValueError } from './domain.js';

export class Store {
  constructor(dbPath) {
    this.path = path.resolve(String(dbPath));
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    this.withDb((db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password TEXT NOT NULL,active INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS access_codes(fingerprint TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,active INTEGER NOT NULL,expires REAL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT NOT NULL,username TEXT,created REAL NOT NULL,touched REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS failures(address TEXT,username TEXT,at REAL);
        CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,username TEXT NOT NULL,mode TEXT NOT NULL,questions TEXT NOT NULL,started REAL NOT NULL,submitted REAL,score INTEGER,total INTEGER,result TEXT);
        CREATE TABLE IF NOT EXISTS text_rotation(username TEXT NOT NULL,mode TEXT NOT NULL,remaining TEXT NOT NULL,last TEXT,PRIMARY KEY(username,mode));
      `);
      const cols = db.prepare('PRAGMA table_info(attempts)').all();
      if (!cols.some((row) => row.name === 'content')) {
        db.exec('ALTER TABLE attempts ADD COLUMN content TEXT');
      }
    });
  }

  withDb(callback) {
    const db = new DatabaseSync(this.path, { timeout: 10000 });
    try {
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

  create_code(principal, code = null, expires = null) {
    const actualCode = code || new_code();
    const normalized = normalize_code(actualCode);
    if (!normalized) {
      throw new ValueError('Formato de código inválido.');
    }
    this.withDb((db) => {
      db.prepare('INSERT OR IGNORE INTO users VALUES(?, ?, ?, 1)').run(
        principal,
        'retired',
        'retired',
      );
      db.prepare('INSERT INTO access_codes VALUES(?, ?, 1, ?)').run(
        digest(normalized),
        principal,
        expires,
      );
      db.prepare('DELETE FROM sessions WHERE username = ?').run(principal);
    });
    return actualCode;
  }

  new_session(username = null, old = null) {
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(32).toString('base64url');
    const now = Date.now() / 1000;
    this.withDb((db) => {
      db.prepare('DELETE FROM sessions WHERE created < ? OR touched < ?').run(
        now - LIFETIME,
        now - IDLE,
      );
      if (old) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(old);
      }
      db.prepare('INSERT INTO sessions VALUES(?, ?, ?, ?, ?)').run(
        digest(token),
        csrf,
        username,
        now,
        now,
      );
    });
    return [token, csrf];
  }
}
