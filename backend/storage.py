"""SQLite persistence and backwards-compatible schema initialization."""
from contextlib import contextmanager
from pathlib import Path
import secrets
import sqlite3
import time
from access import digest, normalize_code, new_code
from config import IDLE, LIFETIME

class Store:

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password TEXT NOT NULL,active INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS access_codes(fingerprint TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,active INTEGER NOT NULL,expires REAL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT NOT NULL,username TEXT,created REAL NOT NULL,touched REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS failures(address TEXT,username TEXT,at REAL);
            CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,username TEXT NOT NULL,mode TEXT NOT NULL,questions TEXT NOT NULL,started REAL NOT NULL,submitted REAL,score INTEGER,total INTEGER,result TEXT);
            CREATE TABLE IF NOT EXISTS text_rotation(username TEXT NOT NULL,mode TEXT NOT NULL,remaining TEXT NOT NULL,last TEXT,PRIMARY KEY(username,mode));
                        """)
            if 'content' not in {row['name'] for row in db.execute('PRAGMA table_info(attempts)')}:
                db.execute('ALTER TABLE attempts ADD COLUMN content TEXT')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def create_code(self, principal, code=None, expires=None):
        code = code or new_code()
        normalized = normalize_code(code)
        if not normalized:
            raise ValueError('Formato de código inválido.')
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO users VALUES(?,?,?,1)', (principal, 'retired', 'retired'))
            db.execute('INSERT INTO access_codes VALUES(?,?,1,?)', (digest(normalized), principal, expires))
            db.execute('DELETE FROM sessions WHERE username=?', (principal,))
        return code

    def new_session(self, username=None, old=None):
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(32)
        now = time.time()
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE created<? OR touched<?', (now - LIFETIME, now - IDLE))
            if old:
                db.execute('DELETE FROM sessions WHERE token=?', (old,))
            db.execute('INSERT INTO sessions VALUES(?,?,?,?,?)', (digest(token), csrf, username, now, now))
        return (token, csrf)
