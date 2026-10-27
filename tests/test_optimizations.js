import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { load_library, _read_library } from '../backend/library.js';
import { ValueError } from '../backend/domain.js';
import { bundle_styles } from '../scripts/styles.js';
import { build_public, rebuild_public } from '../scripts/package_pages.js';

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

describe('Optimizations', () => {
  test('test_library_cache_refreshes_when_source_changes', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-opt-'));
    try {
      const libPath = path.join(temp, 'library/library.json');
      fs.mkdirSync(path.dirname(libPath), { recursive: true });
      const data = {
        modules: ['1', '2', '3', '4', '5', 'general'].map((id) => ({ id })),
      };
      fs.writeFileSync(libPath, JSON.stringify(data), 'utf8');
      const first = load_library(temp);
      assert.strictEqual(first, load_library(temp));
      data.note = 'Nueva edición con contenido actualizado';
      fs.writeFileSync(libPath, JSON.stringify(data), 'utf8');
      const updated = load_library(temp);
      assert.notStrictEqual(first, updated);
      assert.equal(updated.note, data.note);
    } finally {
      _read_library.cache_clear();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('test_styles_keep_order_and_relative_asset_paths', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-css-'));
    try {
      fs.mkdirSync(path.join(temp, 'sub'), { recursive: true });
      fs.writeFileSync(
        path.join(temp, 'main.css'),
        "@import url('./sub/base.css');\nh1{color:blue}",
        'utf8',
      );
      fs.writeFileSync(
        path.join(temp, 'sub/base.css'),
        'h1{color:red;background:url(../../img/test.svg)}',
        'utf8',
      );
      const css = bundle_styles(temp);
      assert.ok(css.indexOf('color:red') < css.indexOf('color:blue'));
      assert.ok(css.includes('../img/test.svg'));
      assert.ok(!css.includes('@import'));
      fs.writeFileSync(
        path.join(temp, 'sub/base.css'),
        "@import url('../main.css');",
        'utf8',
      );
      assert.throws(() => bundle_styles(temp), ValueError);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('test_public_build_delivers_one_stylesheet', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-pub-'));
    try {
      const root = build_public(path.join(temp, 'site'));
      const cssFiles = walkFiles(root)
        .filter((p) => p.endsWith('.css'))
        .map((p) => path.relative(root, p).split(path.sep).join('/'));
      assert.deepEqual(cssFiles, ['css/main.css']);
      assert.ok(
        !fs.readFileSync(path.join(root, 'css/main.css'), 'utf8').includes('@import'),
      );
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('test_rebuild_replaces_complete_artifact_and_keeps_recoverable_previous', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-rebuild-'));
    try {
      const previous = path.join(temp, 'dist');
      fs.mkdirSync(previous, { recursive: true });
      fs.writeFileSync(path.join(previous, 'obsolete.txt'), 'old build', 'utf8');
      const result = rebuild_public({ root: temp, includeCampus: false });
      assert.ok(fs.statSync(path.join(result, 'index.html')).isFile());
      assert.ok(fs.statSync(path.join(result, 'css/main.css')).isFile());
      assert.ok(!fs.existsSync(path.join(result, 'obsolete.txt')));
      const buildsDir = path.join(temp, 'output/pages-builds');
      const saved = fs
        .readdirSync(buildsDir)
        .filter(
          (name) =>
            name.startsWith('anterior-') &&
            fs.existsSync(path.join(buildsDir, name, 'obsolete.txt')),
        );
      assert.equal(saved.length, 1);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
