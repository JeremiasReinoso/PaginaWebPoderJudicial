import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

describe('ArchitectureBoundaries', () => {
  test('test_domain_has_no_transport_or_persistence_dependencies', () => {
    const source = fs.readFileSync(path.join(ROOT, 'backend/domain.js'), 'utf8');
    const imports = [
      ...source.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    const forbidden = new Set([
      'node:sqlite',
      'sqlite3',
      'node:http',
      'http',
      './app.js',
      './storage.js',
      './access.js',
      './practices.js',
    ]);
    for (const imp of imports) {
      assert.ok(!forbidden.has(imp), `Forbidden import in domain.js: ${imp}`);
    }
  });

  test('test_frontend_contains_no_server_or_private_data', () => {
    for (const filePath of walkFiles(path.join(ROOT, 'frontend'))) {
      const ext = path.extname(filePath);
      assert.ok(!['.py', '.sqlite3', '.pdf'].includes(ext), filePath);
      assert.notEqual(path.basename(filePath), 'library.json');
    }
  });

  test('test_campus_module_imports_resolve_without_global_navigation', () => {
    const folder = path.join(ROOT, 'frontend/campus');
    for (const entry of fs.readdirSync(folder)) {
      if (!entry.endsWith('.js')) continue;
      const filePath = path.join(folder, entry);
      const source = fs.readFileSync(filePath, 'utf8');
      assert.ok(!source.includes('window.showCampusSection'), filePath);
      const refs = [
        ...source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+)['"]/g),
      ].map((m) => m[1]);
      for (const reference of refs) {
        const target = path.resolve(folder, reference);
        assert.ok(
          fs.existsSync(target) && fs.statSync(target).isFile(),
          `${filePath} -> ${reference}`,
        );
      }
    }
  });
});
