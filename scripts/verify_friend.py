"""Smoke-test the delivered ZIP using its own portable interpreter and fresh data."""
from pathlib import Path
from zipfile import ZipFile
from http.cookiejar import CookieJar
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
import json
import re
import sqlite3
import subprocess
import tempfile
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
from config import DEFAULT_STATE


def verify():
    checks = DEFAULT_STATE / 'verificaciones'
    checks.mkdir(parents=True, exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix='amigo-', dir=checks)).resolve()
    assert destination.is_relative_to(checks.resolve())
    with ZipFile(ROOT / 'output/MetodoJudicial-Para-Amigo.zip') as archive:
        assert all((destination / name).resolve().is_relative_to(destination) for name in archive.namelist())
        archive.extractall(destination)
    bundle = destination / 'MetodoJudicial-Prueba'
    with sqlite3.connect(bundle / 'private/campus.sqlite3') as db:
        assert db.execute('SELECT COUNT(*) FROM access_codes').fetchone()[0] == 1
        for table in ('attempts', 'sessions', 'failures'):
            assert db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] == 0
    code = re.search(r'MJ-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}',
                     (bundle / 'codigo-amigo.txt').read_text(encoding='utf-8')).group()
    python = bundle / 'runtime/python.exe'
    subprocess.run([str(python), '-I', '-B', '-c', 'import sqlite3, http.server, ssl; print("Runtime OK")'], check=True, timeout=20)
    process = subprocess.Popen([str(python), '-I', '-B', 'iniciar.py', '--port', '0', '--no-browser'],
                               cwd=bundle, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        first_line = process.stdout.readline()
        match = re.search(r'http://127\.0\.0\.1:\d+', first_line)
        if not match:
            raise RuntimeError(first_line + process.communicate(timeout=10)[0])
        origin = match.group()
        opener = build_opener(HTTPCookieProcessor(CookieJar()))

        def request(path, body=None, csrf=None):
            headers = {'Origin': origin}
            if body is not None:
                headers.update({'Content-Type': 'application/json', 'X-CSRF-Token': csrf})
            raw = json.dumps(body).encode() if body is not None else None
            response = opener.open(Request(origin + path, data=raw, headers=headers), timeout=15)
            data = response.read()
            return json.loads(data) if response.headers.get_content_type() == 'application/json' else data

        assert b'<html' in request('/')
        try:
            request('/api/library')
            raise AssertionError('Biblioteca pública sin sesión')
        except HTTPError as error:
            assert error.code == 401
        guest = request('/api/session')
        session = request('/api/login', {'code': code}, guest['csrf'])
        csrf = session['csrf']
        assert len(request('/api/library')['modules']) == 6
        assert request('/api/library/books/1.pdf').startswith(b'%PDF')
        assert request('/api/dashboard')['results'] == []
        reading = request('/api/exams/start', {'mode': 'reading'}, csrf)
        assert reading['wordCount'] >= 350 and len(reading['questions']) == 4
        result = request('/api/exams/submit', {'attempt': reading['attempt'],
                         'answers': {q['id']: 0 for q in reading['questions']}}, csrf)
        assert result['total'] == 4
        typing = request('/api/typing/start', {}, csrf)
        result = request('/api/typing/submit', {'attempt': typing['attempt'], 'text': typing['text']}, csrf)
        assert result['accuracy'] == 100
        assert b'initializeCampus' in request('/campus/app.js')
        assert b'fetch' in request('/campus/api.js')
        print('ZIP verificado: runtime portátil, ingreso, biblioteca, PDF, lectura, mecanografía y módulos frontend.')
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == '__main__':
    verify()
