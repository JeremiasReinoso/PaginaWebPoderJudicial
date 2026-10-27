/** Read teaching content from private runtime storage, never the static checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { ValueError } from './domain.js';

export const MODULE_IDS = new Set(['1', '2', '3', '4', '5', 'general']);

const cache = new Map();

export function _read_library(filename, modified, size) {
  /** Bounded server-memory cache. A changed source file invalidates the key. */
  const key = `${filename}::${modified}::${size}`;
  if (cache.has(key)) {
    const existing = cache.get(key);
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const ids = new Set((data.modules || []).map((item) => item.id));
  if (
    ids.size !== MODULE_IDS.size ||
    [...MODULE_IDS].some((id) => !ids.has(id))
  ) {
    throw new ValueError('Catálogo incompleto.');
  }
  if (cache.size >= 8) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, data);
  return data;
}

_read_library.cache_clear = () => cache.clear();

export function load_library(state) {
  const folder = path.join(String(state), 'library');
  const filePath = path.join(folder, 'library.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('FileNotFoundError');
  }
  const lstat = fs.lstatSync(filePath);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    throw new Error('FileNotFoundError');
  }
  const stat = fs.statSync(filePath, { bigint: true });
  return _read_library(
    path.resolve(filePath),
    String(stat.mtimeNs),
    String(stat.size),
  );
}

export function catalog(data) {
  return {
    title: 'Biblioteca de estudio',
    note: data.note,
    edition: data.edition,
    sources: data.sources.map((source) => {
      const out = {};
      for (const key of ['id', 'title', 'pages', 'originalName']) {
        if (key in source) out[key] = source[key];
      }
      return out;
    }),
    modules: data.modules.map((item) => {
      const out = {};
      for (const key of ['id', 'title', 'intro', 'sourceIds']) {
        if (key in item) out[key] = item[key];
      }
      out.sections = item.summary.length;
      return out;
    }),
  };
}

export function get_module(data, identifier) {
  return data.modules.find((item) => item.id === identifier) || null;
}

export function book_path(state, identifier) {
  if (!['1', '2', '3', '4', '5'].includes(identifier)) return null;
  const filePath = path.join(
    String(state),
    'library',
    'documents',
    `module-${identifier}.pdf`,
  );
  if (!fs.existsSync(filePath)) return null;
  const lstat = fs.lstatSync(filePath);
  if (lstat.isSymbolicLink() || !lstat.isFile()) return null;
  return filePath;
}
