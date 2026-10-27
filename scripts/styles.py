"""Flatten local stylesheet imports while preserving source order and URL bases."""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import os
import re

IMPORT = re.compile(r'''@import\s+url\(['"]([^'"]+)['"]\)\s*;''')
URL = re.compile(r'''url\(\s*(['"]?)([^)'"\s]+)\1\s*\)''')


def bundle_styles(folder, entry='main.css'):
    folder = Path(folder).resolve()

    def expand(path, ancestors):
        if path.is_symlink():
            raise ValueError('No se compilan enlaces simbólicos.')
        path = path.resolve()
        if not path.is_relative_to(folder) or path in ancestors or path.is_symlink():
            raise ValueError('Importación de estilos fuera de la carpeta o circular.')
        source = path.read_text(encoding='utf-8')
        parts, offset = [], 0
        for match in IMPORT.finditer(source):
            parts.append(rewrite_urls(source[offset:match.start()], path.parent))
            parts.append(expand(path.parent / match.group(1), ancestors | {path}))
            offset = match.end()
        parts.append(rewrite_urls(source[offset:], path.parent))
        return '\n'.join(parts)

    def rewrite_urls(source, parent):
        def rewrite(match):
            value = match.group(2)
            split = urlsplit(value)
            if split.scheme or split.netloc or value.startswith(('/', '#')):
                return match.group()
            relative = Path(os.path.relpath(parent / split.path, folder)).as_posix()
            result = urlunsplit(('', '', relative, split.query, split.fragment))
            return f'url("{result}")'
        return URL.sub(rewrite, source)

    return expand(folder / entry, set())
