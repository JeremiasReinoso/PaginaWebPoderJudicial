"""Access-code and session operations. HTTP cookie parsing lives in transport."""
import hashlib
import re
import secrets
import time
from config import IDLE, LIFETIME
from errors import CampusError


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_code(code):
    normalized = re.sub(r'[-\s]', '', code).upper()
    return normalized if re.fullmatch(r'MJ[0-9A-F]{32}', normalized) else None


def new_code():
    value = secrets.token_hex(16).upper()
    return 'MJ-' + '-'.join(value[i:i + 4] for i in range(0, 32, 4))


def find_session(store, token):
    key, now = digest(token), time.time()
    with store.db() as db:
        row = db.execute('''
            SELECT s.*, u.active, c.active AS code_active, c.expires AS code_expires
            FROM sessions s
            LEFT JOIN users u ON u.username = s.username
            LEFT JOIN access_codes c ON c.username = s.username
            WHERE token = ?
        ''', (key,)).fetchone()
        if not row:
            return None
        expired = now - row['created'] > LIFETIME or now - row['touched'] > IDLE
        revoked = row['username'] and (
            row['active'] != 1 or row['code_active'] != 1
            or (row['code_expires'] is not None and now >= row['code_expires'])
        )
        if expired or revoked:
            db.execute('DELETE FROM sessions WHERE token = ?', (key,))
            return None
        db.execute('UPDATE sessions SET touched = ? WHERE token = ?', (now, key))
        return dict(row)


def authenticate(store, code, address):
    if not isinstance(code, str) or not 1 <= len(code) <= 128:
        raise CampusError(400, 'Ingresá tu código de acceso.')
    fingerprint = digest(normalize_code(code) or 'invalid')
    now, failure, principal = time.time(), None, None
    with store.db() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM failures WHERE at < ?', (now - 900,))
        count = db.execute(
            'SELECT COUNT(*) FROM failures WHERE address = ? OR username = ?',
            (address, fingerprint),
        ).fetchone()[0]
        if count >= 6:
            failure = CampusError(429, 'Demasiados intentos. Esperá 15 minutos.')
        else:
            access = db.execute('''
                SELECT c.*, u.active AS account_active FROM access_codes c
                JOIN users u ON u.username = c.username WHERE fingerprint = ?
            ''', (fingerprint,)).fetchone()
            if (not access or access['active'] != 1 or access['account_active'] != 1
                    or (access['expires'] is not None and now >= access['expires'])):
                db.execute('INSERT INTO failures VALUES(?,?,?)', (address, fingerprint, now))
                failure = CampusError(401, 'Código incorrecto, vencido o no habilitado.')
            else:
                principal = access['username']
                db.execute('DELETE FROM failures WHERE address = ? OR username = ?', (address, fingerprint))
    # Commit failed-attempt evidence before returning the expected rejection.
    if failure:
        raise failure
    return principal


def logout(store, session):
    with store.db() as db:
        db.execute('DELETE FROM sessions WHERE token = ?', (session['token'],))
