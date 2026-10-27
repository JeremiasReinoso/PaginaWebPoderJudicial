from pathlib import Path
import json
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'backend'))
from package_friend import prepare_access
from storage import Store


class FriendAccess(unittest.TestCase):
    def test_delivery_preserves_expiry_and_rejects_expired_code(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            delivery = prepare_access(state)
            expiry = time.time() + 3600
            store = Store(state / 'campus.sqlite3')
            with store.db() as db:
                db.execute('UPDATE access_codes SET expires = ?', (expiry,))
            self.assertEqual(prepare_access(state)['expires'], expiry)
            with store.db() as db:
                db.execute('UPDATE access_codes SET expires = ?', (time.time() - 1,))
            with self.assertRaises(ValueError):
                prepare_access(state)

    def test_delivery_does_not_reactivate_disabled_account(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            prepare_access(state)
            with Store(state / 'campus.sqlite3').db() as db:
                db.execute('UPDATE users SET active = 0')
            with self.assertRaises(ValueError):
                prepare_access(state)


if __name__ == '__main__':
    unittest.main()
