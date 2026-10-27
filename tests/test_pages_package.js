/** Verify the GitHub Pages artifact and paths under a repository prefix. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { build_public } from '../scripts/package_pages.js';

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function parseHtmlReferences(html) {
  const refs = [];
  const fields = [];
  const ids = [];
  const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const tagMatch of html.matchAll(tagRegex)) {
    const tag = tagMatch[1].toLowerCase();
    const attrString = tagMatch[2];
    const attrs = {};
    for (const attrMatch of attrString.matchAll(attrRegex)) {
      const key = attrMatch[1].toLowerCase();
      const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      attrs[key] = val;
    }
    if ('id' in attrs) ids.push(attrs.id);
    if (tag === 'input') fields.push(attrs.name);
    for (const key of ['href', 'src']) {
      if (key in attrs) refs.push(attrs[key]);
    }
  }
  return { refs, fields, ids };
}

describe('PagesPackage', () => {
  test('test_public_artifact_excludes_backend_and_private_data', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-pages-'));
    try {
      const root = build_public(path.join(tmp, 'site'));
      assert.ok(fs.statSync(path.join(root, '.nojekyll')).isFile());
      for (const forbiddenDir of [
        'server',
        'tests',
        'scripts',
        'backend',
        'campus',
      ]) {
        assert.ok(!fs.existsSync(path.join(root, forbiddenDir)), forbiddenDir);
      }
      for (const p of walkFiles(root)) {
        const ext = path.extname(p).toLowerCase();
        assert.ok(
          !['.py', '.sqlite3', '.pdf', '.txt', '.ps1'].includes(ext),
          p,
        );
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('test_links_work_under_github_repository_prefix', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-links-'));
    try {
      const root = build_public(path.join(tmp, 'site'), {
        includeCampus: true,
      });
      const parsed = new Map();
      const htmlFiles = walkFiles(root).filter((f) => f.endsWith('.html'));
      for (const file of htmlFiles) {
        const page = parseHtmlReferences(fs.readFileSync(file, 'utf8'));
        parsed.set(file, page);
        if (!file.endsWith(path.join('campus', 'index.html'))) {
          if (file.endsWith(path.join('pages', 'material-estudio.html'))) {
            assert.deepEqual(
              page.fields,
              ['license_code', 'code'],
              path.basename(file),
            );
          } else {
            assert.deepEqual(page.fields, ['code'], path.basename(file));
          }
        }
      }
      for (const [file, page] of parsed.entries()) {
        const relFile = path.relative(root, file).split(path.sep).join('/');
        const baseUrl = `https://example.github.io/mi-repositorio/${relFile}`;
        for (const reference of page.refs) {
          const resolved = new URL(reference, baseUrl);
          if (resolved.host !== 'example.github.io') continue;
          assert.ok(
            resolved.pathname.startsWith('/mi-repositorio/'),
            `${file} -> ${reference}`,
          );
          const relTarget = decodeURIComponent(
            resolved.pathname.slice('/mi-repositorio/'.length),
          );
          const target = path.join(root, relTarget);
          assert.ok(
            fs.existsSync(target) && fs.statSync(target).isFile(),
            `${file} -> ${reference} (${target})`,
          );
          if (resolved.hash && parsed.has(target)) {
            const fragment = resolved.hash.slice(1);
            assert.ok(
              parsed.get(target).ids.includes(fragment),
              `${file} -> #${fragment}`,
            );
          }
        }
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('test_config_has_no_enabled_backend_or_embedded_access_code', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-cfg-'));
    try {
      const root = build_public(path.join(tmp, 'site'));
      const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
      assert.ok(config.includes("campusUrl: ''"));
      assert.ok(
        !fs
          .readFileSync(path.join(root, 'js/modules/ui.js'), 'utf8')
          .includes('localStorage'),
      );
      assert.ok(
        !walkFiles(root).some((p) => path.basename(p).includes('codigo-')),
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('test_browser_campus_engine_works_on_github_pages', async () => {
    const storeMap = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    };
    globalThis.location = {
      href: 'https://example.github.io/mi-repositorio/campus/index.html',
      pathname: '/mi-repositorio/campus/index.html',
    };
    const { clientApi, clientLogin } = await import(
      '../frontend/campus/client_backend.js'
    );
    const anon = await clientApi('/api/session');
    assert.equal(anon.authenticated, false);

    const loginRes = await clientLogin(
      'MJ-F6CA-96E5-C813-B7F7-6403-1FFE-80BB-717F',
    );
    assert.equal(loginRes.authenticated, true);

    const lib = await clientApi('/api/library');
    assert.equal(lib.modules.length, 6);

    const mod1 = await clientApi('/api/library/modules/1');
    assert.equal(mod1.module.id, '1');
    assert.ok(
      mod1.bookUrls[1].endsWith('/mi-repositorio/assets/pdfs-estudio/module-1.pdf'),
    );

    const exam = await clientApi('/api/exams/start', { mode: 'module-1' });
    assert.equal(exam.questions.length, 4);
    const answers = Object.fromEntries(exam.questions.map((q) => [q.id, 0]));
    const examResult = await clientApi('/api/exams/submit', {
      attempt: exam.attempt,
      answers,
    });
    assert.equal(examResult.total, 4);

    const typing = await clientApi('/api/typing/start', {});
    const typingResult = await clientApi('/api/typing/submit', {
      attempt: typing.attempt,
      text: typing.text,
    });
    assert.equal(typingResult.accuracy, 100);

    const dash = await clientApi('/api/dashboard');
    assert.equal(dash.results.length, 2);

    await clientApi('/api/logout', {});
    assert.equal((await clientApi('/api/session')).authenticated, false);
  });
});
