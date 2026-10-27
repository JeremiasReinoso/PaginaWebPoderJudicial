"""Portable local preview entry point, copied as iniciar.py in the private ZIP."""
from pathlib import Path
import argparse
import sys
import webbrowser


def main():
    if sys.version_info < (3, 10):
        raise SystemExit('Se necesita Python 3.10 o posterior.')
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root / 'app' / 'backend'))
    from app import Server
    from storage import Store
    state = root / 'private'
    if not (state / 'campus.sqlite3').is_file():
        raise SystemExit('Faltan archivos. Extraé TODO el ZIP antes de abrir INICIAR.cmd.')
    store = Store(state / 'campus.sqlite3')
    try:
        server = Server(args.port, store)
    except OSError:
        server = Server(0, store)
    print(f'Abrí: {server.origin}/ingreso', flush=True)
    print('El código está en codigo-amigo.txt. Dejá esta ventana abierta.', flush=True)
    if not args.no_browser:
        webbrowser.open(server.origin + '/ingreso')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
