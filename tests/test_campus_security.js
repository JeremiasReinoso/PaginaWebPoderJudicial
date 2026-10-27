/** Authorization boundary tests against an isolated loopback test server. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from '../backend/app.js';
import { Store } from '../backend/storage.js';
import { digest } from '../backend/access.js';
import { COOKIE } from '../backend/config.js';
import { QUESTIONS as EXAM_QUESTIONS } from '../backend/demo_content.js';
import { TEXTS, READING_QUESTIONS } from '../backend/practice_texts.js';

const QUESTIONS = { ...EXAM_QUESTIONS, ...READING_QUESTIONS };

describe('CampusSecurity', () => {
  let directory;
  let store;
  let server;
  const codes = {
    alice: `MJ-${'A1'.repeat(16)}`,
    bob: `MJ-${'B2'.repeat(16)}`,
  };

  before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sec-'));
    store = new Store(path.join(directory, 'test.sqlite3'));
    store.create_code('alice', codes.alice);
    store.create_code('bob', codes.bob);
    server = new Server(0, store);
    await server.listen();
  });

  after(async () => {
    if (server) await server.close();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    store.withDb((db) => {
      for (const table of [
        'sessions',
        'failures',
        'attempts',
        'text_rotation',
      ]) {
        db.exec(`DELETE FROM ${table}`);
      }
      db.exec('UPDATE users SET active = 1');
      db.exec('UPDATE access_codes SET active = 1, expires = NULL');
    });
  });

  function request(
    reqPath,
    method = 'GET',
    body = null,
    cookie = null,
    csrf = null,
    origin = true,
    host = null,
    accept = null,
  ) {
    return new Promise((resolve, reject) => {
      const headers = { Host: host || server.authority };
      if (accept) headers.Accept = accept;
      if (cookie) headers.Cookie = cookie;
      if (csrf) headers['X-CSRF-Token'] = csrf;
      let raw = null;
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        if (origin) {
          headers.Origin = origin === true ? server.origin : origin;
        }
        if (body !== null && body !== undefined) {
          raw = Buffer.from(JSON.stringify(body), 'utf8');
          headers['Content-Length'] = String(raw.length);
        }
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.server_port,
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
            const received = {};
            for (const [k, v] of Object.entries(res.headers)) {
              const titleKey = k
                .split('-')
                .map((p) =>
                  p === 'csrf' || p === 'xss'
                    ? p.toUpperCase()
                    : p.charAt(0).toUpperCase() + p.slice(1),
                )
                .join('-');
              received[titleKey] = Array.isArray(v) ? v.join('; ') : v;
            }
            let data = buf;
            if (
              (received['Content-Type'] || '').startsWith('application/json') &&
              buf.length > 0
            ) {
              data = JSON.parse(buf.toString('utf8'));
            }
            resolve([res.statusCode, data, received]);
          });
        },
      );
      req.on('error', reject);
      if (raw) req.write(raw);
      req.end();
    });
  }

  async function guest() {
    const [status, data, headers] = await request('/api/session');
    assert.equal(status, 200);
    return [headers['Set-Cookie'].split(';')[0], data.csrf];
  }

  async function login(user = 'alice', code = null) {
    const [cookie, csrf] = await guest();
    const [status, data, headers] = await request(
      '/api/login',
      'POST',
      { code: code || codes[user] },
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    return [headers['Set-Cookie'].split(';')[0], data.csrf];
  }

  async function start(cookie, csrf, mode = 'module-1') {
    const [status, data] = await request(
      '/api/exams/start',
      'POST',
      { mode },
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    return data;
  }

  function libraryFixture() {
    const folder = path.join(path.dirname(store.path), 'library');
    fs.mkdirSync(path.join(folder, 'documents'), { recursive: true });
    const data = {
      note: 'Fixture independiente',
      edition: 'Prueba',
      sources: [
        {
          id: 1,
          title: 'Fuente de prueba',
          pages: 2,
          originalName: 'prueba.pdf',
          sha256: 'private-metadata',
        },
      ],
      modules: ['1', '2', '3', '4', '5', 'general'].map((i) => ({
        id: i,
        title: 'Ficha de prueba',
        intro: 'Introducción',
        sourceIds: [1],
        summary: [
          {
            title: 'Tema',
            paragraphs: ['Contenido de prueba'],
            references: [{ source: 1, from: 2, to: 2 }],
          },
        ],
        conceptMap: { root: 'Raíz', branches: [] },
        comparison: { columns: ['Concepto'], rows: [['Prueba']] },
        outline: [],
        notes: [],
      })),
    };
    fs.writeFileSync(
      path.join(folder, 'library.json'),
      JSON.stringify(data),
      'utf8',
    );
    fs.writeFileSync(
      path.join(folder, 'documents/module-1.pdf'),
      Buffer.from('%PDF-1.4\nPrivate fixture'),
    );
  }

  test('test_public_site_and_headers', async () => {
    const [status, , headers] = await request('/');
    assert.equal(status, 200);
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.ok(
      headers['Content-Security-Policy'].includes("frame-ancestors 'none'"),
    );
  });

  test('test_private_pages_and_apis_deny_without_session', async () => {
    for (const p of [
      '/campus',
      '/campus/',
      '/campus/app.js',
      '/campus/library.js',
      '/campus/styles.css',
      '/api/dashboard',
      '/api/typing',
      '/api/library',
      '/api/library/modules/1',
      '/api/library/modules/general',
      '/api/library/books/1.pdf',
    ]) {
      assert.equal((await request(p))[0], 401, p);
    }
  });

  test('test_library_catalog_details_and_private_book', async () => {
    libraryFixture();
    const [cookie] = await login();
    const [status, data, headers] = await request(
      '/api/library',
      'GET',
      null,
      cookie,
    );
    assert.equal(status, 200);
    assert.equal(data.modules.length, 6);
    assert.ok(!('sha256' in data.sources[0]));
    assert.ok(!('summary' in data.modules[0]));
    assert.equal(headers['Cache-Control'], 'no-store');
    for (const identifier of ['1', '2', '3', '4', '5', 'general']) {
      const [mStatus, mData] = await request(
        `/api/library/modules/${identifier}`,
        'GET',
        null,
        cookie,
      );
      assert.equal(mStatus, 200);
      assert.equal(mData.module.id, identifier);
      assert.ok('conceptMap' in mData.module);
    }
    const [bStatus, body, bHeaders] = await request(
      '/api/library/books/1.pdf',
      'GET',
      null,
      cookie,
    );
    assert.equal(bStatus, 200);
    assert.ok(body.subarray(0, 4).toString('ascii') === '%PDF');
    assert.equal(bHeaders['Content-Type'], 'application/pdf');
  });

  test('test_library_rejects_unknown_and_traversal_paths', async () => {
    libraryFixture();
    const [cookie] = await login();
    for (const p of [
      '/api/library/modules/6',
      '/api/library/modules/01',
      '/api/library/books/general.pdf',
      '/api/library/books/6.pdf',
      '/api/library/books/../library.json',
      '/library/library.json',
      '/server/library.py',
    ]) {
      assert.equal((await request(p, 'GET', null, cookie))[0], 404, p);
    }
  });

  test('test_library_head_and_revocation_enforce_session', async () => {
    libraryFixture();
    const [cookie] = await login();
    assert.equal((await request('/api/library/books/1.pdf', 'HEAD'))[0], 401);
    assert.equal(
      (await request('/api/library/books/1.pdf', 'HEAD', null, cookie))[0],
      200,
    );
    store.withDb((db) => {
      db.prepare('UPDATE access_codes SET active = 0 WHERE username = ?').run(
        'alice',
      );
    });
    for (const p of [
      '/api/library',
      '/api/library/modules/general',
      '/api/library/books/1.pdf',
    ]) {
      assert.equal((await request(p, 'GET', null, cookie))[0], 401, p);
    }
  });

  test('test_head_does_not_bypass_authentication', async () => {
    assert.equal((await request('/campus', 'HEAD'))[0], 401);
  });

  test('test_browser_without_session_returns_to_login_but_api_stays_private', async () => {
    const [status, , headers] = await request(
      '/campus',
      'GET',
      null,
      null,
      null,
      true,
      null,
      'text/html',
    );
    assert.equal(status, 303);
    assert.equal(headers.Location, '/ingreso');
    assert.equal(
      (
        await request(
          '/api/library',
          'GET',
          null,
          null,
          null,
          true,
          null,
          'text/html',
        )
      )[0],
      401,
    );
  });

  test('test_anonymous_and_forged_cookies_denied', async () => {
    const [cookie] = await guest();
    for (const val of [cookie, `${COOKIE}=forged-token`]) {
      assert.equal((await request('/api/dashboard', 'GET', null, val))[0], 401);
    }
  });

  test('test_private_source_and_files_not_served', async () => {
    for (const p of [
      '/backend/app.js',
      '/frontend/campus/index.html',
      '/server/app.py',
      '/server/demo_content.py',
      '/server/campus/index.html',
      '/.env',
      '/.git/config',
      '/README.md',
      '/assets/docs/pdfs-estudio/test.pdf',
      '/css/../../server/app.py',
      '/css/%2e%2e/%2e%2e/server/app.py',
      '/assets/img/..%5c..%5cserver/app.py',
    ]) {
      assert.equal((await request(p))[0], 404, p);
    }
  });

  test('test_bad_host_denied', async () => {
    assert.equal(
      (await request('/', 'GET', null, null, null, true, 'attacker.invalid'))[0],
      403,
    );
  });

  test('test_login_and_cookie_flags', async () => {
    const [cookie, csrf] = await guest();
    const [status, , headers] = await request(
      '/api/login',
      'POST',
      { code: codes.alice },
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    assert.ok(headers['Set-Cookie'].includes('HttpOnly'));
    assert.ok(headers['Set-Cookie'].includes('SameSite=Strict'));
  });

  test('test_login_rotates_session', async () => {
    const [old, csrf] = await guest();
    const [status, , headers] = await request(
      '/api/login',
      'POST',
      { code: codes.alice },
      old,
      csrf,
    );
    assert.equal(status, 200);
    assert.notEqual(old, headers['Set-Cookie'].split(';')[0]);
    assert.equal((await request('/api/dashboard', 'GET', null, old))[0], 401);
  });

  test('test_wrong_code_and_sql_injection_denied', async () => {
    const [cookie, csrf] = await guest();
    for (const code of [`MJ-${'FF'.repeat(16)}`, "' OR 1=1 --"]) {
      assert.equal(
        (await request('/api/login', 'POST', { code }, cookie, csrf))[0],
        401,
      );
    }
  });

  test('test_brute_force_limit', async () => {
    const [cookie, csrf] = await guest();
    for (let i = 0; i < 6; i += 1) {
      assert.equal(
        (
          await request(
            '/api/login',
            'POST',
            { code: `MJ-${'FF'.repeat(16)}` },
            cookie,
            csrf,
          )
        )[0],
        401,
      );
    }
    assert.equal(
      (
        await request(
          '/api/login',
          'POST',
          { code: codes.alice },
          cookie,
          csrf,
        )
      )[0],
      429,
    );
  });

  test('test_cross_origin_and_missing_csrf_denied', async () => {
    const [cookie, csrf] = await login();
    assert.equal(
      (
        await request(
          '/api/exams/start',
          'POST',
          { mode: 'module-1' },
          cookie,
          null,
        )
      )[0],
      403,
    );
    assert.equal(
      (
        await request(
          '/api/exams/start',
          'POST',
          { mode: 'module-1' },
          cookie,
          csrf,
          'http://attacker.invalid',
        )
      )[0],
      403,
    );
    assert.equal(
      (
        await request(
          '/api/exams/start',
          'POST',
          { mode: 'module-1' },
          cookie,
          csrf,
          false,
        )
      )[0],
      403,
    );
  });

  test('test_expired_and_revoked_access_denied', async () => {
    let [cookie] = await login();
    store.withDb((db) => {
      db.prepare('UPDATE sessions SET touched = ?').run(
        Date.now() / 1000 - 1900,
      );
    });
    assert.equal((await request('/api/dashboard', 'GET', null, cookie))[0], 401);
    [cookie] = await login();
    store.withDb((db) => {
      db.prepare('UPDATE users SET active = 0 WHERE username = ?').run('alice');
    });
    assert.equal((await request('/campus', 'GET', null, cookie))[0], 401);
  });

  test('test_logout_invalidates_cookie_on_server', async () => {
    const [cookie, csrf] = await login();
    assert.equal(
      (await request('/api/logout', 'POST', {}, cookie, csrf))[0],
      200,
    );
    assert.equal((await request('/api/dashboard', 'GET', null, cookie))[0], 401);
  });

  test('test_question_counts_and_no_answer_key', async () => {
    const [cookie, csrf] = await login();
    for (const [mode, count] of [
      ['module-1', 4],
      ['module-5', 4],
      ['final', 20],
      ['reading', 4],
    ]) {
      const data = await start(cookie, csrf, mode);
      assert.equal(data.questions.length, count);
      assert.ok(
        data.questions.every(
          (q) => !('correct' in q) && !('explanation' in q),
        ),
      );
    }
  });

  test('test_server_marks_and_does_not_accept_client_score', async () => {
    const [cookie, csrf] = await login();
    const data = await start(cookie, csrf);
    const answers = Object.fromEntries(
      data.questions.map((q) => [q.id, QUESTIONS[q.id].correct]),
    );
    const [status, result] = await request(
      '/api/exams/submit',
      'POST',
      { attempt: data.attempt, answers, score: 0, username: 'bob' },
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    assert.equal(result.score, 4);
    assert.equal(result.passed, true);
    const [dStatus, dash] = await request(
      '/api/dashboard',
      'GET',
      null,
      cookie,
    );
    assert.equal(dStatus, 200);
    assert.ok(dash.achievements.includes('module-1'));
    assert.equal(
      (
        await request(
          '/api/exams/submit',
          'POST',
          { attempt: data.attempt, answers },
          cookie,
          csrf,
        )
      )[0],
      409,
    );
  });

  test('test_other_user_cannot_submit_attempt', async () => {
    const [cookie, csrf] = await login();
    const data = await start(cookie, csrf);
    const [other, otherCsrf] = await login('bob');
    assert.equal(
      (
        await request(
          '/api/exams/submit',
          'POST',
          { attempt: data.attempt, answers: {} },
          other,
          otherCsrf,
        )
      )[0],
      404,
    );
  });

  test('test_partial_and_invalid_answers_denied', async () => {
    const [cookie, csrf] = await login();
    const data = await start(cookie, csrf);
    assert.equal(
      (
        await request(
          '/api/exams/submit',
          'POST',
          { attempt: data.attempt, answers: {} },
          cookie,
          csrf,
        )
      )[0],
      400,
    );
    assert.equal(
      (
        await request(
          '/api/exams/start',
          'POST',
          { mode: [] },
          cookie,
          csrf,
        )
      )[0],
      400,
    );
  });

  test('test_typing_uses_server_time_and_does_not_store_transcription', async () => {
    const [cookie, csrf] = await login();
    const [status, data] = await request(
      '/api/typing/start',
      'POST',
      {},
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    const [sStatus, result] = await request(
      '/api/typing/submit',
      'POST',
      { attempt: data.attempt, text: data.text, seconds: 9999 },
      cookie,
      csrf,
    );
    assert.equal(sStatus, 200);
    assert.equal(result.accuracy, 100);
    assert.ok(result.seconds < 9999);
    const row = store.withDb((db) =>
      db
        .prepare('SELECT result FROM attempts WHERE id = ?')
        .get(data.attempt),
    );
    assert.ok(!row.result.includes(data.text));
  });

  test('test_text_rotation_has_no_repeats_and_survives_new_session', async () => {
    let [cookie, csrf] = await login();
    for (const mode of ['reading', 'typing']) {
      const seen = [];
      for (let i = 0; i < TEXTS.length * 2; i += 1) {
        if (i === 2) [cookie, csrf] = await login();
        const data =
          mode === 'reading'
            ? await start(cookie, csrf, 'reading')
            : (await request('/api/typing/start', 'POST', {}, cookie, csrf))[1];
        if (seen.length > 0) {
          assert.notEqual(seen[seen.length - 1], data.textId);
        }
        seen.push(data.textId);
        const text = mode === 'reading' ? data.passage : data.text;
        const wordCount = text.trim().split(/\s+/).length;
        assert.ok(wordCount >= 350);
        assert.equal(data.wordCount, wordCount);
      }
      assert.equal(new Set(seen.slice(0, TEXTS.length)).size, TEXTS.length);
      assert.equal(new Set(seen.slice(TEXTS.length)).size, TEXTS.length);
    }
  });

  test('test_reading_questions_match_selected_text_and_are_corrected', async () => {
    const [cookie, csrf] = await login();
    for (let i = 0; i < TEXTS.length; i += 1) {
      const data = await start(cookie, csrf, 'reading');
      const source = TEXTS.find((t) => t.id === data.textId);
      assert.equal(data.passage, source.text);
      assert.deepEqual(
        new Set(data.questions.map((q) => q.id)),
        new Set(source.questionIds),
      );
      const answers = Object.fromEntries(
        data.questions.map((q) => [q.id, QUESTIONS[q.id].correct]),
      );
      const [status, result] = await request(
        '/api/exams/submit',
        'POST',
        { attempt: data.attempt, answers },
        cookie,
        csrf,
      );
      assert.equal(status, 200);
      assert.equal(result.percent, 100);
    }
  });

  test('test_typing_correction_uses_assigned_text_and_rejects_replaced_attempt', async () => {
    const [cookie, csrf] = await login();
    const [, old] = await request('/api/typing/start', 'POST', {}, cookie, csrf);
    const [, current] = await request(
      '/api/typing/start',
      'POST',
      {},
      cookie,
      csrf,
    );
    assert.equal(
      (
        await request(
          '/api/typing/submit',
          'POST',
          { attempt: old.attempt, text: old.text },
          cookie,
          csrf,
        )
      )[0],
      404,
    );
    const [status, result] = await request(
      '/api/typing/submit',
      'POST',
      { attempt: current.attempt, text: old.text, source: old.text },
      cookie,
      csrf,
    );
    assert.equal(status, 200);
    assert.ok(result.accuracy < 100);
    assert.equal(result.completed, false);
  });

  test('test_history_is_scoped_to_user', async () => {
    const [alice, csrf] = await login();
    const data = await start(alice, csrf);
    const answers = Object.fromEntries(data.questions.map((q) => [q.id, 0]));
    await request(
      '/api/exams/submit',
      'POST',
      { attempt: data.attempt, answers },
      alice,
      csrf,
    );
    const [bob] = await login('bob');
    const [, dash] = await request('/api/dashboard', 'GET', null, bob);
    assert.deepEqual(dash.results, []);
  });

  test('test_achievements_survive_more_than_one_hundred_recent_practices', async () => {
    store.withDb((db) => {
      db.prepare(
        'INSERT INTO attempts(id,username,mode,questions,started,submitted,score,total) VALUES(?,?,?,?,?,?,?,?)',
      ).run('earned', 'alice', 'module-1', '[]', 1, 2, 3, 4);
      const stmt = db.prepare(
        'INSERT INTO attempts(id,username,mode,questions,started,submitted,score,total) VALUES(?,?,?,?,?,?,?,?)',
      );
      for (let i = 0; i < 105; i += 1) {
        stmt.run(`recent-${i}`, 'alice', 'typing', '[]', 10 + i, 11 + i, 1, 10);
      }
    });
    const [cookie] = await login();
    const [, dash] = await request('/api/dashboard', 'GET', null, cookie);
    assert.ok(dash.achievements.includes('module-1'));
    assert.equal(dash.results.length, 20);
  });

  test('test_non_ascii_csrf_is_rejected_without_crashing', async () => {
    const [cookie] = await login();
    assert.equal(
      (
        await request(
          '/api/exams/start',
          'POST',
          { mode: 'module-1' },
          cookie,
          'ñ',
        )
      )[0],
      403,
    );
  });

  test('test_legacy_password_login_is_removed', async () => {
    const [cookie, csrf] = await guest();
    assert.equal(
      (
        await request(
          '/api/login',
          'POST',
          { username: 'alice', password: 'test-only-alice' },
          cookie,
          csrf,
        )
      )[0],
      400,
    );
  });

  test('test_revoked_code_invalidates_live_session', async () => {
    const [cookie] = await login();
    store.withDb((db) => {
      db.prepare('UPDATE access_codes SET active = 0 WHERE username = ?').run(
        'alice',
      );
    });
    assert.equal((await request('/api/dashboard', 'GET', null, cookie))[0], 401);
    const [guestCookie, token] = await guest();
    assert.equal(
      (
        await request(
          '/api/login',
          'POST',
          { code: codes.alice },
          guestCookie,
          token,
        )
      )[0],
      401,
    );
  });

  test('test_expired_code_cannot_login', async () => {
    store.withDb((db) => {
      db.prepare('UPDATE access_codes SET expires = ? WHERE username = ?').run(
        Date.now() / 1000 - 1,
        'alice',
      );
    });
    const [cookie, csrf] = await guest();
    assert.equal(
      (
        await request(
          '/api/login',
          'POST',
          { code: codes.alice },
          cookie,
          csrf,
        )
      )[0],
      401,
    );
  });

  test('test_code_is_not_an_authentication_query_parameter', async () => {
    assert.equal(
      (await request(`/api/dashboard?code=${codes.alice}`))[0],
      401,
    );
  });

  test('test_only_code_fingerprint_is_stored', () => {
    const row = store.withDb((db) =>
      db
        .prepare('SELECT fingerprint FROM access_codes WHERE username = ?')
        .get('alice'),
    );
    assert.equal(row.fingerprint, digest(`MJ${'A1'.repeat(16)}`));
    assert.notEqual(row.fingerprint, codes.alice);
  });
});
