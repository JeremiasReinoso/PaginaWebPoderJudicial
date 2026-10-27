"""Loopback HTTP transport: validation, routing and security response headers."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from urllib.parse import urlsplit, unquote
import hmac, json, mimetypes, re
from config import ROOT, FRONTEND, PUBLIC, COOKIE, LIFETIME, PUBLIC_PAGES
from storage import Store
from access import digest, find_session, authenticate, logout
from practices import dashboard, typing_preview, start_practice, submit_practice
from library import load_library, catalog, get_module, book_path
from errors import CampusError

class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, store):
        super().__init__(('127.0.0.1', port), Handler)
        self.store = store
        self.origin = f'http://127.0.0.1:{self.server_port}'
        self.authority = f'127.0.0.1:{self.server_port}'

class Handler(BaseHTTPRequestHandler):
    server_version = 'MetodoJudicialLocal'
    sys_version = ''

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def response_headers(self, status, length, kind, cookie=None, location=None):
        self.send_response(status)
        headers = {
            'Content-Type': kind,
            'Content-Length': str(length),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy': (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self'; object-src 'none'; base-uri 'none'; "
                "frame-ancestors 'none'; form-action 'self'"
            ),
        }
        for k, v in headers.items():
            self.send_header(k, v)
        if cookie is not None:
            self.send_header('Set-Cookie', f'{COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={(LIFETIME if cookie else 0)}')
        if location:
            self.send_header('Location', location)
        self.end_headers()

    def respond(self, status, body=b'', kind='application/json; charset=utf-8', cookie=None, location=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        if isinstance(body, str):
            body = body.encode()
        self.response_headers(status, len(body), kind, cookie, location)
        if self.command != 'HEAD':
            self.wfile.write(body)

    def error(self, status, message):
        self.respond(status, {'error': message})

    def valid_host(self):
        if self.headers.get('Host') != self.server.authority:
            self.error(403, 'Host no autorizado. Usá la dirección 127.0.0.1 del acceso local.')
            return False
        return True

    def authorized(self, s):
        if not s or not s['username']:
            self.error(401, 'Ingresá con un código habilitado para acceder.')
            return False
        return True

    def file(self, path):
        with path.open('rb') as source:
            kind = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            self.response_headers(200, path.stat().st_size, kind)
            if self.command != 'HEAD':
                while block := source.read(64 * 1024):
                    self.wfile.write(block)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.valid_host():
            return
        path = unquote(urlsplit(self.path).path)
        if '\\' in path or '\x00' in path or any((part in ('.', '..') or part.startswith('.') for part in path.split('/') if part)):
            return self.error(404, 'Recurso no disponible.')
        if path == '/ingreso':
            return self.file(FRONTEND / 'access.html')
        if path == '/api/session':
            s = self.session()
            if s:
                return self.respond(200, {'authenticated': bool(s['username']), 'csrf': s['csrf']})
            token, csrf = self.server.store.new_session()
            return self.respond(200, {'authenticated': False, 'csrf': csrf}, cookie=token)
        if path.startswith('/api/') or path == '/campus' or path.startswith('/campus/'):
            s = self.session()
            if (path in ('/campus', '/campus/') and (not s or not s['username'])
                    and 'text/html' in self.headers.get('Accept', '')):
                return self.respond(303, b'', kind='text/html; charset=utf-8', location='/ingreso')
            if not self.authorized(s):
                return
            if path in ('/campus', '/campus/'):
                return self.file(FRONTEND / 'campus/index.html')
            if path.startswith('/campus/'):
                candidate = (FRONTEND / path.lstrip('/')).resolve()
                if (candidate.is_relative_to(FRONTEND / 'campus')
                        and candidate.suffix in ('.js', '.css') and candidate.is_file()):
                    return self.file(candidate)
            if path == '/api/library' or path.startswith('/api/library/'):
                try:
                    data = load_library(self.server.store.path.parent)
                except (OSError, ValueError, KeyError, TypeError):
                    return self.error(404, 'La biblioteca todavía no está cargada en este servidor.')
                if path == '/api/library':
                    return self.respond(200, catalog(data))
                match = re.fullmatch('/api/library/modules/(1|2|3|4|5|general)', path)
                if match:
                    item = get_module(data, match.group(1))
                    if item:
                        return self.respond(200, {'module': item, 'note': data['note'], 'sources': catalog(data)['sources']})
                match = re.fullmatch('/api/library/books/([1-5])\\.pdf', path)
                if match:
                    book = book_path(self.server.store.path.parent, match.group(1))
                    if book:
                        return self.file(book)
                return self.error(404, 'Recurso de biblioteca no disponible.')
            if path == '/api/dashboard':
                return self.respond(200, dashboard(self.server.store, s['username']))
            if path == '/api/typing':
                return self.respond(200, typing_preview())
            return self.error(404, 'Recurso no disponible.')
        if path in PUBLIC_PAGES:
            return self.file(PUBLIC / ('index.html' if path == '/' else path.lstrip('/')))
        if path.startswith(('/css/', '/js/', '/assets/img/')):
            candidate = (PUBLIC / path.lstrip('/')).resolve()
            if candidate.is_relative_to(PUBLIC) and candidate.suffix.lower() in ('.css', '.js', '.svg', '.webp', '.png', '.jpg', '.woff2') and candidate.is_file():
                return self.file(candidate)
        self.error(404, 'Recurso no disponible.')

    def session(self):
        try:
            jar = SimpleCookie()
            jar.load(self.headers.get('Cookie', ''))
            token = jar[COOKIE].value if COOKIE in jar else ''
        except Exception:
            token = ''
        return find_session(self.server.store, token)

    def do_POST(self):
        if not self.valid_host():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 20000:
                return self.error(413, 'Solicitud fuera de límite.')
        except ValueError:
            return self.error(400, 'Solicitud inválida.')
        # Consume only the bounded body before closing a rejected request. Leaving
        # unread bytes can reset the connection on Windows and hide the 403.
        raw = self.rfile.read(length)
        if self.headers.get('Origin') != self.server.origin:
            return self.error(403, 'Origen no permitido.')
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.error(415, 'Se requiere JSON.')
        try:
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            return self.error(400, 'Solicitud inválida.')
        session = self.session()
        if not session:
            return self.error(401, 'La sesión venció. Volvé a ingresar.')
        supplied_csrf = self.headers.get('X-CSRF-Token', '').encode('utf-8')
        if not hmac.compare_digest(supplied_csrf, session['csrf'].encode('utf-8')):
            return self.error(403, 'Validación de solicitud fallida.')
        try:
            return self.route_post(urlsplit(self.path).path, body, session)
        except CampusError as failure:
            return self.error(failure.status, failure.message)

    def route_post(self, path, body, session):
        store = self.server.store
        if path == '/api/login':
            principal = authenticate(store, body.get('code'), self.client_address[0])
            token, csrf = store.new_session(principal, session['token'])
            return self.respond(200, {'authenticated': True, 'csrf': csrf}, cookie=token)
        if not self.authorized(session):
            return
        principal = session['username']
        if path == '/api/logout':
            logout(store, session)
            return self.respond(200, {'ok': True}, cookie='')
        if path in ('/api/exams/start', '/api/typing/start'):
            mode = 'typing' if path == '/api/typing/start' else body.get('mode')
            return self.respond(200, start_practice(store, principal, mode))
        if path in ('/api/exams/submit', '/api/typing/submit'):
            result = submit_practice(store, principal, body, typing=path == '/api/typing/submit')
            return self.respond(200, result)
        return self.error(404, 'Recurso no disponible.')


if __name__ == '__main__':
    from cli import main
    main()
