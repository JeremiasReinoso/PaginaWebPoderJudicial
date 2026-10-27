/** Flatten local stylesheet imports while preserving source order and URL bases. */
import fs from 'node:fs';
import path from 'node:path';
import { ValueError } from '../backend/domain.js';

const IMPORT_RE = /@import\s+url\(['"]([^'"]+)['"]\)\s*;/g;
const URL_RE = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g;

function isRelativeTo(targetPath, basePath) {
  const rel = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function bundle_styles(folder, entry = 'main.css') {
  const rootFolder = path.resolve(String(folder));

  function rewrite_urls(source, parentDir) {
    return source.replace(URL_RE, (fullMatch, _quote, value) => {
      if (
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ||
        value.startsWith('//') ||
        value.startsWith('/') ||
        value.startsWith('#')
      ) {
        return fullMatch;
      }
      let pathname = value;
      let suffix = '';
      const qIdx = pathname.indexOf('?');
      const hIdx = pathname.indexOf('#');
      const splitIdx =
        qIdx !== -1 && hIdx !== -1
          ? Math.min(qIdx, hIdx)
          : qIdx !== -1
            ? qIdx
            : hIdx;
      if (splitIdx !== -1) {
        suffix = pathname.slice(splitIdx);
        pathname = pathname.slice(0, splitIdx);
      }
      const resolvedAsset = path.resolve(parentDir, pathname);
      const relative = path
        .relative(rootFolder, resolvedAsset)
        .split(path.sep)
        .join('/');
      return `url("${relative}${suffix}")`;
    });
  }

  function expand(filePath, ancestors) {
    if (!fs.existsSync(filePath)) {
      throw new ValueError('Archivo de estilos no encontrado.');
    }
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      throw new ValueError('No se compilan enlaces simbólicos.');
    }
    const resolved = path.resolve(filePath);
    if (
      !isRelativeTo(resolved, rootFolder) ||
      ancestors.has(resolved) ||
      fs.lstatSync(resolved).isSymbolicLink()
    ) {
      throw new ValueError(
        'Importación de estilos fuera de la carpeta o circular.',
      );
    }
    const source = fs.readFileSync(resolved, 'utf8');
    const parts = [];
    let offset = 0;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(resolved);

    for (const match of source.matchAll(IMPORT_RE)) {
      const start = match.index;
      const end = start + match[0].length;
      parts.push(rewrite_urls(source.slice(offset, start), path.dirname(resolved)));
      const importedPath = path.join(path.dirname(resolved), match[1]);
      parts.push(expand(importedPath, nextAncestors));
      offset = end;
    }
    parts.push(rewrite_urls(source.slice(offset), path.dirname(resolved)));
    return parts.join('\n');
  }

  return expand(path.join(rootFolder, entry), new Set());
}
