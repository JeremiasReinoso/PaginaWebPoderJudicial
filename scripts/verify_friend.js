/** Smoke-test the delivered ZIP using Node.js and fresh data. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip.js';
import { DEFAULT_STATE } from '../backend/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function isRelativeTo(targetPath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export async function verify(stateDir = DEFAULT_STATE) {
  const checks = path.join(String(stateDir), 'verificaciones');
  fs.mkdirSync(checks, { recursive: true });
  const destination = fs.mkdtempSync(path.join(checks, 'amigo-'));
  assert.ok(isRelativeTo(destination, checks));

  const zipPath = path.join(ROOT, 'output/MetodoJudicial-Para-Amigo.zip');
  const entries = readZip(zipPath);
  for (const entry of entries) {
    const outPath = path.resolve(destination, entry.name);
    assert.ok(isRelativeTo(outPath, destination));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.data);
  }

  const bundle = path.join(destination, 'MetodoJudicial-Prueba');
  const db = new DatabaseSync(path.join(bundle, 'private/campus.sqlite3'));
  try {
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM access_codes').get().c,
      1,
    );
    for (const table of ['attempts', 'sessions', 'failures']) {
      assert.equal(
        db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c,
        0,
      );
    }
  } finally {
    db.close();
  }

  const credText = fs.readFileSync(
    path.join(bundle, 'codigo-amigo.txt'),
    'utf8',
  );
  const codeMatch = credText.match(/MJ-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}/);
  assert.ok(codeMatch);
  const code = codeMatch[0];

  const launcherScript = fs.existsSync(path.join(bundle, 'iniciar.js'))
    ? 'iniciar.js'
    : path.join(ROOT, 'scripts/share_launcher.js');

  const child = spawn(
    process.execPath,
    [launcherScript, '--port', '0', '--no-browser'],
    {
      cwd: bundle,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  try {
    const firstLine = await new Promise((resolve, reject) => {
      let buffer = '';
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        const nl = buffer.indexOf('\n');
        if (nl !== -1) {
          child.stdout.off('data', onData);
          resolve(buffer.slice(0, nl));
        }
      };
      child.stdout.on('data', onData);
      child.on('error', reject);
      setTimeout(() => reject(new Error(`Timeout waiting for server: ${buffer}`)), 10000);
    });

    const match = firstLine.match(/http:\/\/127\.0\.0\.1:\d+/);
    assert.ok(match, `Unexpected output: ${firstLine}`);
    const origin = match[0];
    let cookie = '';

    async function request(reqPath, body = undefined, csrf = undefined) {
      const headers = { Origin: origin };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const res = await fetch(`${origin}${reqPath}`, {
        method: body !== undefined ? 'POST' : 'GET',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        cookie = setCookie.split(';')[0];
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.startsWith('application/json')
        ? JSON.parse(buf.toString('utf8'))
        : buf;
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.code = res.status;
        throw err;
      }
      return data;
    }

    const homeBuf = await request('/');
    assert.ok(homeBuf.toString('utf8').includes('<html'));
    await assert.rejects(
      () => request('/api/library'),
      (err) => err.code === 401,
    );

    const guest = await request('/api/session');
    const session = await request('/api/login', { code }, guest.csrf);
    const csrf = session.csrf;
    assert.equal((await request('/api/library')).modules.length, 6);
    const pdfBuf = await request('/api/library/books/1.pdf');
    assert.ok(pdfBuf.subarray(0, 4).toString('ascii') === '%PDF');
    assert.deepEqual((await request('/api/dashboard')).results, []);

    const reading = await request('/api/exams/start', { mode: 'reading' }, csrf);
    assert.ok(reading.wordCount >= 350 && reading.questions.length === 4);
    const answers = Object.fromEntries(
      reading.questions.map((q) => [q.id, 0]),
    );
    const examRes = await request(
      '/api/exams/submit',
      { attempt: reading.attempt, answers },
      csrf,
    );
    assert.equal(examRes.total, 4);

    const typing = await request('/api/typing/start', {}, csrf);
    const typingRes = await request(
      '/api/typing/submit',
      { attempt: typing.attempt, text: typing.text },
      csrf,
    );
    assert.equal(typingRes.accuracy, 100);
    assert.ok(
      (await request('/campus/app.js'))
        .toString('utf8')
        .includes('initializeCampus'),
    );
    assert.ok(
      (await request('/campus/api.js')).toString('utf8').includes('fetch'),
    );
    console.log(
      'ZIP verificado: runtime Node.js, ingreso, biblioteca, PDF, lectura, mecanografía y módulos frontend.',
    );
  } finally {
    child.kill();
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  await verify();
}
