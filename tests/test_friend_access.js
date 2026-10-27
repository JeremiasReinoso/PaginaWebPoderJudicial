import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepare_access } from '../scripts/package_friend.js';
import { Store } from '../backend/storage.js';
import { ValueError } from '../backend/domain.js';

describe('FriendAccess', () => {
  test('test_delivery_preserves_expiry_and_rejects_expired_code', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-friend-'));
    try {
      prepare_access(temp);
      const expiry = Date.now() / 1000 + 3600;
      const store = new Store(path.join(temp, 'campus.sqlite3'));
      store.withDb((db) => {
        db.prepare('UPDATE access_codes SET expires = ?').run(expiry);
      });
      assert.equal(prepare_access(temp).expires, expiry);
      store.withDb((db) => {
        db.prepare('UPDATE access_codes SET expires = ?').run(
          Date.now() / 1000 - 1,
        );
      });
      assert.throws(() => prepare_access(temp), ValueError);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('test_delivery_does_not_reactivate_disabled_account', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-friend-'));
    try {
      prepare_access(temp);
      const store = new Store(path.join(temp, 'campus.sqlite3'));
      store.withDb((db) => {
        db.prepare('UPDATE users SET active = 0').run();
      });
      assert.throws(() => prepare_access(temp), ValueError);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
