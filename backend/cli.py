"""Local bootstrap and administrative code commands."""
from pathlib import Path
import argparse, re, time
from config import ROOT, DEFAULT_STATE
from storage import Store

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--init', action='store_true')
    parser.add_argument('--create-code', metavar='ETIQUETA')
    parser.add_argument('--revoke-code', metavar='ETIQUETA')
    parser.add_argument('--days', type=int, help='Duración opcional del código; sin valor, no vence automáticamente.')
    args = parser.parse_args()
    state = args.state.resolve()
    if state.is_relative_to(ROOT):
        raise SystemExit('Guardá el estado fuera de la carpeta pública.')
    store = Store(state / 'campus.sqlite3')
    if args.revoke_code:
        with store.db() as db:
            db.execute('UPDATE access_codes SET active=0 WHERE username=?', (args.revoke_code,))
            db.execute('DELETE FROM sessions WHERE username=?', (args.revoke_code,))
        print('Código deshabilitado y sesiones revocadas.')
        return
    if args.init or args.create_code:
        principal = 'prueba' if args.init else args.create_code
        if not re.fullmatch('[a-zA-Z0-9_-]{1,60}', principal):
            raise SystemExit('Usá una etiqueta interna de hasta 60 letras, números o guiones.')
        if args.days is not None and args.days <= 0:
            raise SystemExit('La duración debe ser positiva.')
        with store.db() as db:
            existing = db.execute('SELECT username FROM access_codes WHERE username=?', (principal,)).fetchone()
        access_path = state / f'codigo-{principal}.txt'
        if not existing:
            code = store.create_code(principal, expires=time.time() + args.days * 86400 if args.days else None)
            access_path.write_text(f'URL: http://127.0.0.1:{args.port}/ingreso\nCódigo: {code}\nEtiqueta interna: {principal}\nSolo prueba local. No subir este archivo a GitHub.\n', encoding='utf-8')
            access_path.chmod(384)
        elif args.create_code:
            raise SystemExit('La etiqueta ya tiene un código. Usá una etiqueta nueva; no se reemplaza automáticamente.')
        print(f'Acceso por código preparado. Archivo privado: {access_path}')
        return
    from app import Server
    server = Server(args.port, store)
    print(f'Campus de prueba local: {server.origin}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
