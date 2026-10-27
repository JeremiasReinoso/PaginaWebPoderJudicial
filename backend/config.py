"""Filesystem and local-session settings; no credentials in source control."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / 'frontend'
PUBLIC = FRONTEND / 'public'
DEFAULT_STATE = Path.home() / '.codex' / 'private' / 'MetodoJudicialPrueba'
COOKIE = 'mj_session'
IDLE = 30 * 60
LIFETIME = 2 * 60 * 60
PUBLIC_PAGES = {
    '/', '/index.html',
    *('/pages/' + name + '.html' for name in (
        'material-estudio', 'institucional', 'contacto', 'novedades',
        'terminos', 'privacidad', 'fuentes',
    )),
}
