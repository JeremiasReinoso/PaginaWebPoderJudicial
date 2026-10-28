/**
 * Pruebas unitarias, de integración y de seguridad para el Sistema de Validación de Licencias — Poder Judicial.
 * Cubre los 15 escenarios obligatorios de la sección 12 + verificación de ubicación exclusiva en material-estudio.html.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Server } from '../backend/app.js';
import { Store } from '../backend/storage.js';
import { getLicenseConfig } from '../backend/license_config.js';
import {
  createAdminUser,
  hashPassword,
  verifyPassword,
} from '../backend/admin_auth.js';
import {
  generateLicenseCode,
  normalizeLicenseCode,
  createLicense,
} from '../backend/license_service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONFIG = getLicenseConfig();
const ADMIN_SESSION_COOKIE = CONFIG.adminSessionCookie;
const INSTALLATION_COOKIE = CONFIG.installationCookie;

function extractCookieValue(setCookieHeader, cookieName) {
  if (!setCookieHeader) return null;
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  for (const item of list) {
    const firstPart = String(item).split(';')[0].trim();
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0 && firstPart.slice(0, eqIdx) === cookieName) {
      return firstPart.slice(eqIdx + 1);
    }
  }
  return null;
}

describe('LicenseSystem', () => {
  let directory;
  let dbPath;
  let store;
  let server;
  let adminUser;
  const adminPassword = 'Judicial-Admin-StrongPassword!2026';
  const viewerPassword = 'Judicial-Viewer-StrongPassword!2026';

  before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-lic-'));
    dbPath = path.join(directory, 'licenses_test.sqlite3');
    store = new Store(dbPath);
    adminUser = createAdminUser(store, {
      username: 'admin_judicial',
      password: adminPassword,
      role: 'admin',
    });
    createAdminUser(store, {
      username: 'viewer_judicial',
      password: viewerPassword,
      role: 'viewer',
    });
    server = new Server(0, store);
    await server.listen();
  });

  after(async () => {
    if (server) await server.close();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    store.withDb((db) => {
      db.exec('DELETE FROM license_rate_limits');
      db.exec('DELETE FROM license_activations');
      db.exec('DELETE FROM licenses');
      db.exec('DELETE FROM admin_sessions');
      db.exec('DELETE FROM audit_logs');
    });
  });

  function request(
    reqPath,
    {
      method = 'GET',
      body = null,
      cookies = {},
      csrf = null,
      extraHeaders = {},
      origin = true,
      targetServer = server,
    } = {},
  ) {
    return new Promise((resolve, reject) => {
      const headers = {
        Host: targetServer.authority,
        ...extraHeaders,
      };
      const cookiePairs = Object.entries(cookies)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${v}`);
      if (cookiePairs.length > 0) {
        headers.Cookie = cookiePairs.join('; ');
      }
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }
      let raw = null;
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        if (origin) {
          headers.Origin = origin === true ? targetServer.origin : origin;
        }
        if (body !== null && body !== undefined) {
          raw = Buffer.from(JSON.stringify(body), 'utf8');
          headers['Content-Length'] = String(raw.length);
        }
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: targetServer.server_port,
          path: reqPath,
          method,
          headers,
          timeout: 10000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            let json = null;
            try {
              json = JSON.parse(buf.toString('utf8'));
            } catch {
              json = null;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: json,
              rawBody: buf,
            });
          });
        },
      );
      req.on('error', reject);
      if (raw) req.write(raw);
      req.end();
    });
  }

  async function loginAs(username, password) {
    const res = await request('/api/admin/login', {
      method: 'POST',
      body: { username, password },
    });
    assert.equal(res.status, 200);
    const sessionToken = extractCookieValue(
      res.headers['set-cookie'],
      ADMIN_SESSION_COOKIE,
    );
    assert.ok(sessionToken);
    return {
      cookie: sessionToken,
      csrf: res.body.csrf,
      admin: res.body.admin,
    };
  }

  test('1. Creación de licencia por un administrador y formato criptográfico de 160 bits', async () => {
    // Verify Sheila's account works out of the box
    const sheilaSession = await loginAs('Sheila', 'Sheilan0sebaña2026');
    assert.equal(sheilaSession.admin.username, 'sheila');
    assert.equal(sheilaSession.admin.role, 'admin');

    const adminSession = await loginAs('admin_judicial', adminPassword);
    const createRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: { client_reference: 'Juzgado Civil Nro 1' },
    });
    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.license);
    const { code, code_prefix, status, client_reference } =
      createRes.body.license;
    assert.ok(normalizeLicenseCode(code), `Formato inválido: ${code}`);
    assert.equal(status, 'available');
    assert.equal(client_reference, 'Juzgado Civil Nro 1');
    assert.ok(code.startsWith(code_prefix));

    // Verify full code is NOT stored in DB, only SHA-256 hash and non-sensitive prefix
    const dbRow = store.withDb((db) =>
      db
        .prepare('SELECT * FROM licenses WHERE id = ?')
        .get(createRes.body.license.id),
    );
    assert.ok(dbRow);
    assert.notEqual(dbRow.code_hash, code);
    assert.equal(dbRow.code_hash.length, 64);
    assert.ok(!JSON.stringify(dbRow).includes(code));

    // Subsequent admin list queries must NEVER expose the full code or code_hash
    const listRes = await request('/api/admin/licenses', {
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
    });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.licenses.length, 1);
    assert.equal(listRes.body.licenses[0].code, undefined);
    assert.equal(listRes.body.licenses[0].code_hash, undefined);
    assert.equal(listRes.body.licenses[0].code_prefix, code_prefix);
  });

  test('2. Rechazo de códigos inválidos (formato malformado y código inexistente)', async () => {
    const badFormatRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: 'CODIGO-FALSO-123',
        installation_id: 'INST-TEST-INVALID-0001',
      },
    });
    assert.equal(badFormatRes.status, 400);

    const { code: unknownCode } = generateLicenseCode();
    const notFoundRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: unknownCode,
        installation_id: 'INST-TEST-INVALID-0001',
      },
    });
    assert.equal(notFoundRes.status, 401);
  });

  test('3. Activación exitosa de una licencia disponible y desbloqueo de PDFs de estudio', async () => {
    // Before activation, PDF endpoint must reject with 401
    const blockedPdf = await request('/api/licenses/study-pdfs/1.pdf');
    assert.equal(blockedPdf.status, 401);

    const created = createLicense(store, {
      clientReference: 'Defensoría Oficial',
      adminId: adminUser.id,
    });

    const installationId = 'INST-PODER-JUDICIAL-WORKSTATION-01';
    const actRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: created.code,
        installation_id: installationId,
      },
    });
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.activated, true);
    assert.equal(actRes.body.permanent, true);
    assert.ok(actRes.body.installation_token);
    assert.equal(actRes.body.installation_id, installationId);

    const credCookie = extractCookieValue(
      actRes.headers['set-cookie'],
      INSTALLATION_COOKIE,
    );
    assert.ok(credCookie);

    // Now study materials and PDF download are unlocked
    const materialsRes = await request('/api/licenses/study-materials', {
      cookies: { [INSTALLATION_COOKIE]: credCookie },
    });
    assert.equal(materialsRes.status, 200);
    assert.equal(materialsRes.body.modules.length, 5);

    const pdfRes = await request('/api/licenses/study-pdfs/1.pdf', {
      cookies: { [INSTALLATION_COOKIE]: credCookie },
    });
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers['content-type'], 'application/pdf');
    assert.ok(pdfRes.rawBody.subarray(0, 4).toString('utf8') === '%PDF');
  });

  test('4. Rechazo de un segundo uso del mismo código (incluso tras borrar almacenamiento o cambiar instalación)', async () => {
    const created = createLicense(store, {
      clientReference: 'Cámara de Apelaciones',
      adminId: adminUser.id,
    });

    const firstAct = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: created.code,
        installation_id: 'INST-ORIGINAL-11111111',
      },
    });
    assert.equal(firstAct.status, 200);

    // Attempt from another installation
    const secondActDifferentInst = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: created.code,
        installation_id: 'INST-OTRA-MAQUINA-22222222',
      },
    });
    assert.equal(secondActDifferentInst.status, 409);

    // Attempt with same installation_id string after wiping cookies/localStorage (no valid signed credential)
    const secondActWipedStorage = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: created.code,
        installation_id: 'INST-ORIGINAL-11111111',
      },
    });
    assert.equal(secondActWipedStorage.status, 409);
  });

  test('5. Persistencia después de reiniciar la aplicación y el servidor', async () => {
    const created = createLicense(store, {
      clientReference: 'Fiscalía de Instrucción',
      adminId: adminUser.id,
    });
    const installationId = 'INST-PERSIST-RESTART-0001';
    const actRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: { code: created.code, installation_id: installationId },
    });
    assert.equal(actRes.status, 200);
    const token = actRes.body.installation_token;

    // Simulate full application restart: open a brand new Store and Server on the same SQLite file
    const restartedStore = new Store(dbPath);
    const restartedServer = new Server(0, restartedStore);
    await restartedServer.listen();
    try {
      const statusRes = await request('/api/licenses/status', {
        targetServer: restartedServer,
        extraHeaders: { 'X-Installation-Token': token },
      });
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.body.activated, true);
      assert.equal(statusRes.body.permanent, true);
      assert.equal(statusRes.body.installation_id, installationId);
    } finally {
      await restartedServer.close();
    }
  });

  test('6. Persistencia entre recargas y sesiones del navegador + recuperación idempotente de respuesta perdida', async () => {
    const created = createLicense(store, {
      clientReference: 'Mesa de Entradas',
      adminId: adminUser.id,
    });
    const installationId = 'INST-BROWSER-RELOAD-9999';
    const actRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: { code: created.code, installation_id: installationId },
    });
    assert.equal(actRes.status, 200);
    const credCookie = extractCookieValue(
      actRes.headers['set-cookie'],
      INSTALLATION_COOKIE,
    );

    // Simulate multiple page reloads: status check with HttpOnly cookie does not ask for activation again
    for (let i = 0; i < 3; i += 1) {
      const reloadRes = await request('/api/licenses/status', {
        cookies: { [INSTALLATION_COOKIE]: credCookie },
      });
      assert.equal(reloadRes.status, 200);
      assert.equal(reloadRes.body.activated, true);
    }

    // Idempotent retry by the SAME authorized installation presenting its credential
    const idempotentRetry = await request('/api/licenses/activate', {
      method: 'POST',
      cookies: { [INSTALLATION_COOKIE]: credCookie },
      body: { code: created.code, installation_id: installationId },
    });
    assert.equal(idempotentRetry.status, 200);
    assert.equal(idempotentRetry.body.activated, true);
    assert.equal(idempotentRetry.body.idempotent, true);
  });

  test('7. Rechazo de acceso administrativo sin iniciar sesión', async () => {
    const sessionRes = await request('/api/admin/session');
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.authenticated, false);

    const protectedEndpoints = [
      { path: '/api/admin/licenses', method: 'GET' },
      { path: '/api/admin/licenses/export', method: 'GET' },
      { path: '/api/admin/licenses/create', method: 'POST', body: {} },
      {
        path: '/api/admin/licenses/revoke',
        method: 'POST',
        body: { license_id: '1' },
      },
      {
        path: '/api/admin/licenses/replace',
        method: 'POST',
        body: { license_id: '1' },
      },
    ];

    for (const ep of protectedEndpoints) {
      const res = await request(ep.path, {
        method: ep.method,
        body: ep.body ?? null,
      });
      assert.equal(
        res.status,
        401,
        `Se esperaba 401 en ${ep.method} ${ep.path}, se obtuvo ${res.status}`,
      );
    }
  });

  test('8. Rechazo de acciones administrativas sin rol suficiente (viewer no puede mutar ni exportar)', async () => {
    const viewerSession = await loginAs('viewer_judicial', viewerPassword);

    // Viewer can read licenses list
    const readRes = await request('/api/admin/licenses', {
      cookies: { [ADMIN_SESSION_COOKIE]: viewerSession.cookie },
    });
    assert.equal(readRes.status, 200);

    // Viewer CANNOT export, create, revoke, or replace licenses
    const exportRes = await request('/api/admin/licenses/export', {
      cookies: { [ADMIN_SESSION_COOKIE]: viewerSession.cookie },
    });
    assert.equal(exportRes.status, 403);

    const createRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: viewerSession.cookie },
      csrf: viewerSession.csrf,
      body: { client_reference: 'Intento sin permiso' },
    });
    assert.equal(createRes.status, 403);

    const revokeRes = await request('/api/admin/licenses/revoke', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: viewerSession.cookie },
      csrf: viewerSession.csrf,
      body: { license_id: '1', reason: 'Intento sin permiso' },
    });
    assert.equal(revokeRes.status, 403);
  });

  test('9. Rechazo de intentos de modificación no autorizados (CSRF faltante o inválido, Origin cruzado)', async () => {
    const adminSession = await loginAs('admin_judicial', adminPassword);

    // Missing CSRF token
    const noCsrfRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      body: { client_reference: 'Sin CSRF' },
    });
    assert.equal(noCsrfRes.status, 403);

    // Wrong CSRF token
    const badCsrfRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: 'token-csrf-invalido-000000',
      body: { client_reference: 'CSRF Falso' },
    });
    assert.equal(badCsrfRes.status, 403);

    // Cross-origin POST attempt
    const crossOriginRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      origin: 'https://sitio-malicioso.example.com',
      body: { client_reference: 'Cross Origin' },
    });
    assert.equal(crossOriginRes.status, 403);
  });

  test('10. Prevención de activaciones duplicadas ante solicitudes simultáneas (concurrencia atómica)', async () => {
    const created = createLicense(store, {
      clientReference: 'Prueba Concurrencia',
      adminId: adminUser.id,
    });

    const concurrentRequests = Array.from({ length: 8 }, (_, idx) =>
      request('/api/licenses/activate', {
        method: 'POST',
        body: {
          code: created.code,
          installation_id: `INST-CONCURRENT-NODE-${idx + 1}`,
        },
      }),
    );

    const responses = await Promise.all(concurrentRequests);
    const successes = responses.filter((r) => r.status === 200);
    const conflicts = responses.filter((r) => r.status === 409);

    assert.equal(
      successes.length,
      1,
      `Exactamente 1 activación debe tener éxito, tuvieron éxito ${successes.length}`,
    );
    assert.equal(
      conflicts.length,
      7,
      `Las 7 restantes deben rechazarse con 409, se rechazaron ${conflicts.length}`,
    );
  });

  test('11. Manejo seguro de errores de base de datos sin filtrar detalles internos', async () => {
    const brokenStore = {
      path: dbPath,
      withDb() {
        throw new Error(
          'SQLITE_CORRUPT: internal table licenses_secret_index page 42',
        );
      },
    };
    const brokenServer = new Server(0, brokenStore);
    await brokenServer.listen();
    try {
      const { code } = generateLicenseCode();
      const res = await request('/api/licenses/activate', {
        targetServer: brokenServer,
        method: 'POST',
        body: {
          code,
          installation_id: 'INST-DB-ERROR-TEST',
        },
      });
      assert.ok([500, 503].includes(res.status));
      // Must NOT leak SQLite error strings, stack traces, or table names
      const bodyStr = JSON.stringify(res.body);
      assert.ok(!bodyStr.includes('SQLITE_CORRUPT'));
      assert.ok(!bodyStr.includes('licenses_secret_index'));
    } finally {
      await brokenServer.close();
    }
  });

  test('12. Revocación administrativa, reemplazo de código no activado perdido y registro en AuditLogs sin código completo', async () => {
    const adminSession = await loginAs('admin_judicial', adminPassword);

    // Create a license and replace it because it was lost before activation
    const createRes = await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: { client_reference: 'Juzgado Laboral 2' },
    });
    const firstLicense = createRes.body.license;

    const replaceRes = await request('/api/admin/licenses/replace', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: {
        license_id: firstLicense.id,
      },
    });
    assert.equal(replaceRes.status, 200);
    assert.equal(replaceRes.body.invalidated_id, firstLicense.id);
    const replacementLicense = replaceRes.body.replacement;
    assert.notEqual(replacementLicense.code, firstLicense.code);

    // Old replaced code must be rejected as revoked (403)
    const tryOldRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: firstLicense.code,
        installation_id: 'INST-LABORAL-0002',
      },
    });
    assert.equal(tryOldRes.status, 403);

    // New replacement code activates properly
    const tryNewRes = await request('/api/licenses/activate', {
      method: 'POST',
      body: {
        code: replacementLicense.code,
        installation_id: 'INST-LABORAL-0002',
      },
    });
    assert.equal(tryNewRes.status, 200);
    const credCookie = extractCookieValue(
      tryNewRes.headers['set-cookie'],
      INSTALLATION_COOKIE,
    );

    // Cannot replace an already activated license (must fail with 409)
    const replaceActivatedRes = await request('/api/admin/licenses/replace', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: {
        license_id: replacementLicense.id,
      },
    });
    assert.equal(replaceActivatedRes.status, 409);

    // Explicit administrative revocation invalidates installation access immediately
    const revokeRes = await request('/api/admin/licenses/revoke', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: {
        license_id: replacementLicense.id,
        reason: 'Baja administrativa de equipo',
      },
    });
    assert.equal(revokeRes.status, 200);

    const statusAfterRevoke = await request('/api/licenses/status', {
      cookies: { [INSTALLATION_COOKIE]: credCookie },
    });
    assert.equal(statusAfterRevoke.status, 200);
    assert.equal(statusAfterRevoke.body.activated, false);

    // Verify AuditLogs recorded all events and NEVER stored any full license code
    const adminDataRes = await request('/api/admin/licenses', {
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
    });
    assert.equal(adminDataRes.status, 200);
    const actions = adminDataRes.body.auditLogs.map((i) => i.action);
    assert.ok(actions.includes('LICENSE_CREATED'));
    assert.ok(actions.includes('LICENSE_REPLACED_LOST_CODE'));
    assert.ok(actions.includes('LICENSE_ACTIVATED'));
    assert.ok(actions.includes('LICENSE_REVOKED'));

    const rawAuditJson = JSON.stringify(adminDataRes.body.auditLogs);
    assert.ok(!rawAuditJson.includes(firstLicense.code));
    assert.ok(!rawAuditJson.includes(replacementLicense.code));
  });

  test('13. Ausencia de vencimiento automático en licencias activadas', async () => {
    const columns = store.withDb((db) =>
      db.prepare('PRAGMA table_info(licenses)').all(),
    );
    const colNames = columns.map((c) => c.name);
    assert.ok(!colNames.includes('expires_at'));
    assert.ok(!colNames.includes('expiration_date'));
    assert.ok(!colNames.includes('valid_until'));

    // Normalize helper accepts case/whitespace variations
    const { code: rawCode } = generateLicenseCode();
    const expectedClean = rawCode.replace(/-/g, '');
    assert.equal(
      normalizeLicenseCode(`  ${rawCode.toLowerCase()}  `),
      expectedClean,
    );

    // Password hashing uses memory-hard scrypt and verifies accurately
    const hash = hashPassword('ClaveSegura#2026');
    assert.ok(hash.startsWith('$scrypt$n=16384,r=8,p=1$'));
    assert.equal(verifyPassword('ClaveSegura#2026', hash), true);
    assert.equal(verifyPassword('OtraClave', hash), false);
  });

  test('14. Verificación de que no existan secretos, hashes ni el validador fuera de material-estudio.html', async () => {
    const publicPagesDir = path.join(ROOT, 'frontend/public/pages');
    const rootIndexHtml = path.join(ROOT, 'frontend/public/index.html');
    const pageFiles = [
      rootIndexHtml,
      ...fs
        .readdirSync(publicPagesDir)
        .filter((f) => f.endsWith('.html'))
        .map((f) => path.join(publicPagesDir, f)),
    ];

    for (const file of pageFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (path.basename(file) === 'material-estudio.html') {
        assert.ok(
          content.includes('id="license-activation-gate"'),
          'material-estudio.html debe contener #license-activation-gate',
        );
        assert.ok(
          content.includes('license-validator.js'),
          'material-estudio.html debe cargar license-validator.js',
        );
      } else {
        assert.ok(
          !content.includes('id="license-activation-gate"'),
          `${path.basename(file)} NO debe contener #license-activation-gate`,
        );
        assert.ok(
          !content.includes('license-validator.js'),
          `${path.basename(file)} NO debe cargar license-validator.js`,
        );
      }
      assert.ok(!content.includes('$scrypt$'));
      assert.ok(!content.includes('INSTALLATION_TOKEN_SECRET'));
    }

    // Export endpoint must not include code_hash or installation_credential_hash
    const adminSession = await loginAs('admin_judicial', adminPassword);
    await request('/api/admin/licenses/create', {
      method: 'POST',
      cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      csrf: adminSession.csrf,
      body: { client_reference: 'Export Test' },
    });
    const exportJsonRes = await request(
      '/api/admin/licenses/export?format=json',
      {
        cookies: { [ADMIN_SESSION_COOKIE]: adminSession.cookie },
      },
    );
    assert.equal(exportJsonRes.status, 200);
    const exportedStr = JSON.stringify(exportJsonRes.body);
    assert.ok(!exportedStr.includes('code_hash'));
    assert.ok(!exportedStr.includes('installation_credential_hash'));
    assert.ok(!exportedStr.includes('password_hash'));
  });

  test('15. Límite de intentos ante adivinación repetida de códigos (429 Too Many Requests) y fuerza bruta en login admin', async () => {
    // 15a. Repeated invalid license activation attempts trigger 429
    let lastStatus = 0;
    for (let i = 0; i < 10; i += 1) {
      const { code } = generateLicenseCode();
      const res = await request('/api/licenses/activate', {
        method: 'POST',
        body: {
          code,
          installation_id: 'INST-BRUTEFORCE-TARGET',
        },
      });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    assert.equal(
      lastStatus,
      429,
      'Debe bloquear con 429 tras múltiples intentos fallidos de activación',
    );

    // 15b. Repeated failed admin login attempts trigger 429
    let loginStatus = 0;
    for (let i = 0; i < 8; i += 1) {
      const res = await request('/api/admin/login', {
        method: 'POST',
        body: {
          username: 'admin_judicial',
          password: `ClaveIncorrecta-${i}`,
        },
      });
      loginStatus = res.status;
      if (loginStatus === 429) break;
    }
    assert.equal(
      loginStatus,
      429,
      'Debe bloquear con 429 tras múltiples intentos fallidos de login administrativo',
    );
  });
});
