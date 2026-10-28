/** Loopback HTTP transport: validation, routing, license middleware, and security response headers. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
  FRONTEND,
  PUBLIC,
  COOKIE,
  LIFETIME,
  PUBLIC_PAGES,
} from './config.js';
import { getLicenseConfig } from './license_config.js';
import { Store } from './storage.js';
import { digest, find_session, authenticate, logout } from './access.js';
import {
  dashboard,
  typing_preview,
  start_practice,
  submit_practice,
} from './practices.js';
import { load_library, catalog, get_module, book_path } from './library.js';
import {
  authenticateAdmin,
  findAdminSession,
  logoutAdminSession,
  requireRole,
} from './admin_auth.js';
import {
  createLicense,
  activateLicense,
  verifyInstallationStatus,
  revokeLicense,
  replaceLostUnusedLicense,
  queryLicensesAdmin,
  exportLicensesReport,
} from './license_service.js';
import { CampusError } from './errors.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

const WORKSPACE_PDF_MAP = {
  1: 'Concurso-Ingreso-2026-SCJM-Modulo-1-Organizacion-del-Estado-Material-de-Estudio.pdf',
  2: 'Concurso-Ingreso-2026-SCJM-Modulo-2-El-Poder-Judicial-de-Mendoza-Material-de-Estudio.pdf',
  3: 'Concurso-Ingreso-2026-SCJM-Modulo-3-Derechos-Humanos-Material-de-Estudio.pdf',
  4: 'Concurso-Ingreso-2026-SCJM-Modulo-4-Violencia-de-Genero-Material-de-Estudio.pdf',
  5: 'Concurso-Ingreso-2026-SCJM-Modulo-5-Atencion-para-un-Servicio-de-Justicia-Material-de-Estudio-1.pdf',
};

const STUDY_MODULES_METADATA = [
  {
    id: 1,
    title: 'Módulo 01 · Organización del Estado',
    pages: 39,
    description:
      'El Estado, el Derecho y las bases de la organización constitucional.',
  },
  {
    id: 2,
    title: 'Módulo 02 · El Poder Judicial de Mendoza',
    pages: 113,
    description:
      'Los fueros jurisdiccionales y el funcionamiento de la justicia mendocina.',
  },
  {
    id: 3,
    title: 'Módulo 03 · Derechos Humanos',
    pages: 23,
    description:
      'La dignidad de las personas y la cultura de derechos humanos en la justicia.',
  },
  {
    id: 4,
    title: 'Módulo 04 · Violencia de Género',
    pages: 10,
    description:
      'Perspectiva de género, conceptos elementales y marco normativo.',
  },
  {
    id: 5,
    title: 'Módulo 05 · Atención para un Servicio de Justicia',
    pages: 32,
    description:
      'Un servicio judicial centrado en la ciudadanía y el trato digno.',
  },
];

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

function verifyCsrf(suppliedHeader, expectedToken) {
  if (!suppliedHeader || !expectedToken) return false;
  return String(suppliedHeader) === String(expectedToken);
}

export class Server {
  constructor(port, store, licenseConfigOverrides = {}) {
    this.requestedPort = port;
    this.store = store;
    this.licenseConfig = getLicenseConfig(licenseConfigOverrides);
    this.server_port = port;
    this.origin = `http://127.0.0.1:${port}`;
    this.authority = `127.0.0.1:${port}`;
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        if (!res.headersSent) {
          if (err instanceof CampusError) {
            this.error(req, res, err.status, err.message);
          } else {
            this.error(req, res, 500, 'Error interno del servidor.');
          }
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

  response_headers(
    res,
    status,
    length,
    kind,
    cookie = null,
    location = null,
    extraCookie = null,
  ) {
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
    const cookiesToSet = [];
    if (cookie !== null && cookie !== undefined) {
      cookiesToSet.push(
        `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookie ? LIFETIME : 0}`,
      );
    }
    if (extraCookie) {
      cookiesToSet.push(extraCookie);
    }
    if (cookiesToSet.length === 1) {
      headers['Set-Cookie'] = cookiesToSet[0];
    } else if (cookiesToSet.length > 1) {
      headers['Set-Cookie'] = cookiesToSet;
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
    extraCookie = null,
  ) {
    let buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (typeof body === 'string') {
      buffer = Buffer.from(body, 'utf8');
    } else {
      buffer = Buffer.from(JSON.stringify(body), 'utf8');
    }
    this.response_headers(
      res,
      status,
      buffer.length,
      kind,
      cookie,
      location,
      extraCookie,
    );
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

  adminSession(req) {
    try {
      const cookies = parseCookies(req.headers.cookie || '');
      const token = cookies[this.licenseConfig.adminSessionCookie] || '';
      return findAdminSession(this.store, token, this.licenseConfig);
    } catch {
      return null;
    }
  }

  extractInstallationToken(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieToken = cookies[this.licenseConfig.installationCookie];
    const headerToken = req.headers['x-installation-token'];
    return (
      (typeof headerToken === 'string' && headerToken.trim()) ||
      cookieToken ||
      ''
    );
  }

  /**
   * Middleware that protects licensed study endpoints on the backend.
   */
  requireActivatedLicense(req, res) {
    const token = this.extractInstallationToken(req);
    const status = verifyInstallationStatus(
      this.store,
      token,
      this.licenseConfig,
    );
    if (!status.activated) {
      this.error(
        req,
        res,
        401,
        'Se requiere una licencia activa y verificada en el servidor para acceder al material de estudio.',
      );
      return null;
    }
    return status;
  }

  resolveStudyPdfPath(identifier) {
    const stateBook = book_path(path.dirname(this.store.path), identifier);
    if (stateBook) return stateBook;
    const filename = WORKSPACE_PDF_MAP[identifier];
    if (!filename) return null;
    const workspaceBook = path.join(ROOT, 'assets ', 'pdfs-estudio', filename);
    if (isRegularFile(workspaceBook)) return workspaceBook;
    return null;
  }

  async handleRequest(req, res) {
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        return this.do_GET(req, res);
      }
      if (req.method === 'POST') {
        return await this.do_POST(req, res);
      }
      return this.error(req, res, 405, 'Método no permitido.');
    } catch (failure) {
      if (failure instanceof CampusError) {
        return this.error(req, res, failure.status, failure.message);
      }
      return this.error(
        req,
        res,
        503,
        'Servicio temporalmente no disponible. Intentá nuevamente.',
      );
    }
  }

  do_GET(req, res) {
    if (!this.valid_host(req, res)) return;
    const parsedUrl = new URL(req.url || '/', this.origin);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(parsedUrl.pathname);
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

    // --- License System Public & Protected Endpoints ---
    if (decodedPath === '/api/licenses/status') {
      const token = this.extractInstallationToken(req);
      const status = verifyInstallationStatus(
        this.store,
        token,
        this.licenseConfig,
      );
      return this.respond(req, res, 200, status);
    }

    if (decodedPath === '/api/licenses/study-materials') {
      const licenseStatus = this.requireActivatedLicense(req, res);
      if (!licenseStatus) return;
      return this.respond(req, res, 200, {
        license: {
          code_prefix: licenseStatus.code_prefix,
          installation_id: licenseStatus.installation_id,
          activated_at: licenseStatus.activated_at,
          permanent: true,
        },
        modules: STUDY_MODULES_METADATA.map((m) => ({
          ...m,
          pdfUrl: `/api/licenses/study-pdfs/${m.id}.pdf`,
        })),
      });
    }

    const studyPdfMatch = decodedPath.match(
      /^\/api\/licenses\/study-pdfs\/([1-5])\.pdf$/,
    );
    if (studyPdfMatch) {
      const licenseStatus = this.requireActivatedLicense(req, res);
      if (!licenseStatus) return;
      const pdfFile = this.resolveStudyPdfPath(studyPdfMatch[1]);
      if (!pdfFile) {
        return this.error(
          req,
          res,
          404,
          'Documento PDF de estudio no encontrado en el servidor.',
        );
      }
      return this.file(req, res, pdfFile);
    }

    // --- Administrative Panel UI & Admin API Endpoints ---
    const adminPath = this.licenseConfig.adminPanelPath;
    if (
      decodedPath === adminPath ||
      decodedPath === `${adminPath}/` ||
      decodedPath === '/admin' ||
      decodedPath === '/admin/' ||
      decodedPath === '/admin/index.html'
    ) {
      const adminHtml = path.join(FRONTEND, 'admin/index.html');
      if (isRegularFile(adminHtml)) {
        return this.file(req, res, adminHtml);
      }
    }
    if (
      decodedPath === '/admin.css' ||
      decodedPath === '/admin/admin.css' ||
      decodedPath === `${adminPath}/admin.css`
    ) {
      const cssFile = path.join(FRONTEND, 'admin/admin.css');
      if (isRegularFile(cssFile)) return this.file(req, res, cssFile);
    }
    if (
      decodedPath === '/admin.js' ||
      decodedPath === '/admin/admin.js' ||
      decodedPath === `${adminPath}/admin.js`
    ) {
      const jsFile = path.join(FRONTEND, 'admin/admin.js');
      if (isRegularFile(jsFile)) return this.file(req, res, jsFile);
    }
    if (decodedPath.startsWith('/admin-assets/')) {
      const rel = decodedPath.slice('/admin-assets/'.length);
      const candidate = path.resolve(FRONTEND, 'admin', rel);
      if (
        isRelativeTo(candidate, path.join(FRONTEND, 'admin')) &&
        ['.js', '.css'].includes(path.extname(candidate)) &&
        isRegularFile(candidate)
      ) {
        return this.file(req, res, candidate);
      }
      return this.error(req, res, 404, 'Recurso no disponible.');
    }

    if (decodedPath === '/api/admin/session') {
      const adminSess = this.adminSession(req);
      if (!adminSess) {
        return this.respond(req, res, 200, { authenticated: false });
      }
      return this.respond(req, res, 200, {
        authenticated: true,
        csrf: adminSess.csrf,
        admin: adminSess.admin,
      });
    }

    if (decodedPath.startsWith('/api/admin/')) {
      const adminSess = this.adminSession(req);
      if (decodedPath === '/api/admin/licenses') {
        requireRole(adminSess, ['admin', 'auditor', 'viewer']);
        const statusFilter = parsedUrl.searchParams.get('status') || '';
        const searchFilter = parsedUrl.searchParams.get('search') || '';
        const data = queryLicensesAdmin(this.store, {
          status: statusFilter,
          search: searchFilter,
        });
        return this.respond(req, res, 200, data);
      }
      if (decodedPath === '/api/admin/licenses/export') {
        requireRole(adminSess, ['admin', 'auditor']);
        const format =
          parsedUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';
        const report = exportLicensesReport(this.store, format);
        if (format === 'csv') {
          return this.respond(
            req,
            res,
            200,
            report,
            'text/csv; charset=utf-8',
          );
        }
        return this.respond(req, res, 200, { licenses: report });
      }
      return this.error(req, res, 404, 'Ruta administrativa no encontrada.');
    }

    // --- Existing Campus & Public Routes ---
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

    const pathname = (req.url || '/').split('?')[0].split('#')[0];

    try {
      if (
        pathname === '/api/licenses/activate' ||
        pathname.startsWith('/api/admin/')
      ) {
        return this.route_license_and_admin_post(req, res, pathname, body);
      }

      const session = this.session(req);
      if (!session) {
        return this.error(req, res, 401, 'La sesión venció. Volvé a ingresar.');
      }
      if (!verifyCsrf(req.headers['x-csrf-token'], session.csrf)) {
        return this.error(req, res, 403, 'Validación de solicitud fallida.');
      }
      return this.route_post(req, res, pathname, body, session);
    } catch (failure) {
      if (failure instanceof CampusError) {
        return this.error(req, res, failure.status, failure.message);
      }
      throw failure;
    }
  }

  route_license_and_admin_post(req, res, pathname, body) {
    const ipAddress = req.socket?.remoteAddress || '127.0.0.1';
    const secureFlag = this.licenseConfig.isProduction ? '; Secure' : '';

    if (pathname === '/api/licenses/activate') {
      const existingCredential = this.extractInstallationToken(req);
      const activation = activateLicense(
        this.store,
        {
          code: body.code,
          installationId: body.installation_id || null,
          existingCredential,
          ipAddress,
        },
        this.licenseConfig,
      );
      const instCookie = `${this.licenseConfig.installationCookie}=${activation.installation_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000${secureFlag}`;
      return this.respond(
        req,
        res,
        200,
        activation,
        'application/json; charset=utf-8',
        null,
        null,
        instCookie,
      );
    }

    if (pathname === '/api/admin/login') {
      const sessionData = authenticateAdmin(
        this.store,
        {
          username: body.username,
          password: body.password,
          ipAddress,
        },
        this.licenseConfig,
      );
      const adminCookie = `${this.licenseConfig.adminSessionCookie}=${sessionData.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${this.licenseConfig.adminSessionMaxSeconds}${secureFlag}`;
      return this.respond(
        req,
        res,
        200,
        {
          authenticated: true,
          csrf: sessionData.csrf,
          admin: sessionData.admin,
        },
        'application/json; charset=utf-8',
        null,
        null,
        adminCookie,
      );
    }

    const adminSess = this.adminSession(req);
    if (!adminSess) {
      return this.error(
        req,
        res,
        401,
        'Iniciá sesión administrativa para realizar esta operación.',
      );
    }
    if (!verifyCsrf(req.headers['x-csrf-token'], adminSess.csrf)) {
      return this.error(req, res, 403, 'Validación CSRF administrativa fallida.');
    }

    if (pathname === '/api/admin/logout') {
      logoutAdminSession(this.store, adminSess);
      const clearCookie = `${this.licenseConfig.adminSessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`;
      return this.respond(
        req,
        res,
        200,
        { ok: true },
        'application/json; charset=utf-8',
        null,
        null,
        clearCookie,
      );
    }

    if (pathname === '/api/admin/licenses/create') {
      const admin = requireRole(adminSess, ['admin']);
      const created = createLicense(this.store, {
        adminId: admin.id,
        clientReference: body.client_reference || null,
      });
      return this.respond(req, res, 201, { license: created });
    }

    if (pathname === '/api/admin/licenses/revoke') {
      const admin = requireRole(adminSess, ['admin']);
      const revoked = revokeLicense(this.store, {
        licenseId: body.license_id,
        adminId: admin.id,
        reason: body.reason || 'Revocación desde el panel administrativo',
      });
      return this.respond(req, res, 200, { license: revoked });
    }

    if (pathname === '/api/admin/licenses/replace') {
      const admin = requireRole(adminSess, ['admin']);
      const replaced = replaceLostUnusedLicense(this.store, {
        licenseId: body.license_id,
        adminId: admin.id,
      });
      return this.respond(req, res, 200, replaced);
    }

    return this.error(req, res, 404, 'Ruta administrativa no disponible.');
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
  import('./cli.js').then(({ main }) => main());
}
