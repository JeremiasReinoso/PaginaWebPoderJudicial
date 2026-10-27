/** Loopback HTTP transport: validation, routing and security response headers. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
  FRONTEND,
  PUBLIC,
  COOKIE,
  LIFETIME,
  PUBLIC_PAGES,
} from './config.js';
import { Store } from './storage.js';
import { digest, find_session, authenticate, logout } from './access.js';
import {
  dashboard,
  typing_preview,
  start_practice,
  submit_practice,
} from './practices.js';
import { load_library, catalog, get_module, book_path } from './library.js';
import { CampusError } from './errors.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

function isRelativeTo(targetPath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isRegularFile(filePath) {
  try {
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink()) return false;
    return lstat.isFile();
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) cookies[key] = val;
  }
  return cookies;
}

export class Server {
  constructor(port, store) {
    this.requestedPort = port;
    this.store = store;
    this.server_port = port;
    this.origin = `http://127.0.0.1:${port}`;
    this.authority = `127.0.0.1:${port}`;
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          this.error(req, res, 500, 'Error interno.');
        } else {
          res.end();
        }
      });
    });
    this.httpServer.timeout = 10000;
  }

  listen() {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.httpServer.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.httpServer.removeListener('error', onError);
        const addr = this.httpServer.address();
        this.server_port = addr.port;
        this.origin = `http://127.0.0.1:${this.server_port}`;
        this.authority = `127.0.0.1:${this.server_port}`;
        resolve(this);
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);
      this.httpServer.listen(this.requestedPort, '127.0.0.1');
    });
  }

  close() {
    return new Promise((resolve) => {
      this.httpServer.close(() => resolve());
    });
  }

  response_headers(res, status, length, kind, cookie = null, location = null) {
    const headers = {
      'Content-Type': kind,
      'Content-Length': String(length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self'; object-src 'none'; base-uri 'none'; " +
        "frame-ancestors 'none'; form-action 'self'",
    };
    if (cookie !== null && cookie !== undefined) {
      headers['Set-Cookie'] =
        `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookie ? LIFETIME : 0}`;
    }
    if (location) {
      headers.Location = location;
    }
    res.writeHead(status, headers);
  }

  respond(
    req,
    res,
    status,
    body = Buffer.alloc(0),
    kind = 'application/json; charset=utf-8',
    cookie = null,
    location = null,
  ) {
    let buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (typeof body === 'string') {
      buffer = Buffer.from(body, 'utf8');
    } else {
      buffer = Buffer.from(JSON.stringify(body), 'utf8');
    }
    this.response_headers(res, status, buffer.length, kind, cookie, location);
    if (req.method !== 'HEAD') {
      res.end(buffer);
    } else {
      res.end();
    }
  }

  error(req, res, status, message) {
    this.respond(req, res, status, { error: message });
  }

  valid_host(req, res) {
    if (req.headers.host !== this.authority) {
      this.error(
        req,
        res,
        403,
        'Host no autorizado. Usá la dirección 127.0.0.1 del acceso local.',
      );
      return false;
    }
    return true;
  }

  authorized(req, res, s) {
    if (!s || !s.username) {
      this.error(req, res, 401, 'Ingresá con un código habilitado para acceder.');
      return false;
    }
    return true;
  }

  file(req, res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const kind = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    this.response_headers(res, 200, stat.size, kind);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  session(req) {
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[COOKIE] || '';
      return find_session(this.store, token);
    } catch {
      return find_session(this.store, '');
    }
  }

  async handleRequest(req, res) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return this.do_GET(req, res);
    }
    if (req.method === 'POST') {
      return this.do_POST(req, res);
    }
    return this.error(req, res, 405, 'Método no permitido.');
  }

  do_GET(req, res) {
    if (!this.valid_host(req, res)) return;
    const rawPathname = (req.url || '/').split('?')[0].split('#')[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(rawPathname);
    } catch {
      return this.error(req, res, 404, 'Recurso no disponible.');
    }
    if (
      decodedPath.includes('\\') ||
      decodedPath.includes('\x00') ||
      decodedPath
        .split('/')
        .filter(Boolean)
        .some((part) => part === '.' || part === '..' || part.startsWith('.'))
    ) {
      return this.error(req, res, 404, 'Recurso no disponible.');
    }
    if (decodedPath === '/ingreso' || decodedPath === '/access.html') {
      return this.file(req, res, path.join(FRONTEND, 'access.html'));
    }
    if (decodedPath === '/api/session') {
      const s = this.session(req);
      if (s) {
        return this.respond(req, res, 200, {
          authenticated: Boolean(s.username),
          csrf: s.csrf,
        });
      }
      const [token, csrf] = this.store.new_session();
      return this.respond(
        req,
        res,
        200,
        { authenticated: false, csrf },
        'application/json; charset=utf-8',
        token,
      );
    }
    if (
      decodedPath.startsWith('/api/') ||
      decodedPath === '/campus' ||
      decodedPath.startsWith('/campus/')
    ) {
      const s = this.session(req);
      if (
        (decodedPath === '/campus' ||
          decodedPath === '/campus/' ||
          decodedPath === '/campus/index.html') &&
        (!s || !s.username) &&
        (req.headers.accept || '').includes('text/html')
      ) {
        return this.respond(
          req,
          res,
          303,
          Buffer.alloc(0),
          'text/html; charset=utf-8',
          null,
          '/ingreso',
        );
      }
      if (!this.authorized(req, res, s)) return;
      if (
        decodedPath === '/campus' ||
        decodedPath === '/campus/' ||
        decodedPath === '/campus/index.html'
      ) {
        return this.file(req, res, path.join(FRONTEND, 'campus/index.html'));
      }
      if (decodedPath.startsWith('/campus/')) {
        const candidate = path.resolve(
          FRONTEND,
          decodedPath.replace(/^\/+/, ''),
        );
        if (
          isRelativeTo(candidate, path.join(FRONTEND, 'campus')) &&
          ['.js', '.css'].includes(path.extname(candidate)) &&
          isRegularFile(candidate)
        ) {
          return this.file(req, res, candidate);
        }
      }
      if (
        decodedPath === '/api/library' ||
        decodedPath.startsWith('/api/library/')
      ) {
        let data;
        try {
          data = load_library(path.dirname(this.store.path));
        } catch {
          return this.error(
            req,
            res,
            404,
            'La biblioteca todavía no está cargada en este servidor.',
          );
        }
        if (decodedPath === '/api/library') {
          return this.respond(req, res, 200, catalog(data));
        }
        const modMatch = decodedPath.match(
          /^\/api\/library\/modules\/(1|2|3|4|5|general)$/,
        );
        if (modMatch) {
          const item = get_module(data, modMatch[1]);
          if (item) {
            return this.respond(req, res, 200, {
              module: item,
              note: data.note,
              sources: catalog(data).sources,
            });
          }
        }
        const bookMatch = decodedPath.match(
          /^\/api\/library\/books\/([1-5])\.pdf$/,
        );
        if (bookMatch) {
          const book = book_path(path.dirname(this.store.path), bookMatch[1]);
          if (book) {
            return this.file(req, res, book);
          }
        }
        return this.error(
          req,
          res,
          404,
          'Recurso de biblioteca no disponible.',
        );
      }
      if (decodedPath === '/api/dashboard') {
        return this.respond(req, res, 200, dashboard(this.store, s.username));
      }
      if (decodedPath === '/api/typing') {
        return this.respond(req, res, 200, typing_preview());
      }
      return this.error(req, res, 404, 'Recurso no disponible.');
    }
    if (PUBLIC_PAGES.has(decodedPath)) {
      return this.file(
        req,
        res,
        path.join(
          PUBLIC,
          decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, ''),
        ),
      );
    }
    if (
      decodedPath.startsWith('/css/') ||
      decodedPath.startsWith('/js/') ||
      decodedPath.startsWith('/assets/img/')
    ) {
      const candidate = path.resolve(PUBLIC, decodedPath.replace(/^\/+/, ''));
      if (
        isRelativeTo(candidate, PUBLIC) &&
        ['.css', '.js', '.svg', '.webp', '.png', '.jpg', '.woff2'].includes(
          path.extname(candidate).toLowerCase(),
        ) &&
        isRegularFile(candidate)
      ) {
        return this.file(req, res, candidate);
      }
    }
    return this.error(req, res, 404, 'Recurso no disponible.');
  }

  async do_POST(req, res) {
    if (!this.valid_host(req, res)) return;
    const rawLen = req.headers['content-length'];
    if (rawLen === undefined || !/^\d+$/.test(String(rawLen).trim())) {
      return this.error(req, res, 400, 'Solicitud inválida.');
    }
    const length = Number.parseInt(String(rawLen).trim(), 10);
    if (!(length > 0 && length <= 20000)) {
      return this.error(req, res, 413, 'Solicitud fuera de límite.');
    }
    // Consume only the bounded body before closing a rejected request.
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
      received += chunk.length;
      if (received <= length) {
        chunks.push(chunk);
      }
    }
    const raw = Buffer.concat(chunks, Math.min(received, length));
    if (req.headers.origin !== this.origin) {
      return this.error(req, res, 403, 'Origen no permitido.');
    }
    const contentType = (req.headers['content-type'] || '').split(';')[0];
    if (contentType !== 'application/json') {
      return this.error(req, res, 415, 'Se requiere JSON.');
    }
    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new Error('Not a dict');
      }
    } catch {
      return this.error(req, res, 400, 'Solicitud inválida.');
    }
    const session = this.session(req);
    if (!session) {
      return this.error(req, res, 401, 'La sesión venció. Volvé a ingresar.');
    }
    const suppliedCsrf = Buffer.from(
      String(req.headers['x-csrf-token'] || ''),
      'utf8',
    );
    const expectedCsrf = Buffer.from(String(session.csrf), 'utf8');
    if (
      suppliedCsrf.length !== expectedCsrf.length ||
      !crypto.timingSafeEqual(suppliedCsrf, expectedCsrf)
    ) {
      return this.error(req, res, 403, 'Validación de solicitud fallida.');
    }
    const pathname = (req.url || '/').split('?')[0].split('#')[0];
    try {
      return this.route_post(req, res, pathname, body, session);
    } catch (failure) {
      if (failure instanceof CampusError) {
        return this.error(req, res, failure.status, failure.message);
      }
      throw failure;
    }
  }

  route_post(req, res, pathname, body, session) {
    const store = this.store;
    if (pathname === '/api/login') {
      const address = req.socket?.remoteAddress || '127.0.0.1';
      const principal = authenticate(store, body.code, address);
      const [token, csrf] = store.new_session(principal, session.token);
      return this.respond(
        req,
        res,
        200,
        { authenticated: true, csrf },
        'application/json; charset=utf-8',
        token,
      );
    }
    if (!this.authorized(req, res, session)) return;
    const principal = session.username;
    if (pathname === '/api/logout') {
      logout(store, session);
      return this.respond(
        req,
        res,
        200,
        { ok: true },
        'application/json; charset=utf-8',
        '',
      );
    }
    if (pathname === '/api/exams/start' || pathname === '/api/typing/start') {
      const mode = pathname === '/api/typing/start' ? 'typing' : body.mode;
      return this.respond(
        req,
        res,
        200,
        start_practice(store, principal, mode),
      );
    }
    if (pathname === '/api/exams/submit' || pathname === '/api/typing/submit') {
      const result = submit_practice(store, principal, body, {
        typing: pathname === '/api/typing/submit',
      });
      return this.respond(req, res, 200, result);
    }
    return this.error(req, res, 404, 'Recurso no disponible.');
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { main } = await import('./cli.js');
  await main();
}
