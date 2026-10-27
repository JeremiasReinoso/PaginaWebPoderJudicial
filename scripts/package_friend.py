"""Build a private, isolated Windows preview. Never publish its output to Pages."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import json
import secrets
import shutil
import sys
import tempfile
import time
from package_pages import build_public

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
from config import DEFAULT_STATE
from storage import Store
from access import digest, normalize_code
from library import load_library


def prepare_access(state):
    path = state / 'entrega-amigo.json'
    store = Store(state / 'campus.sqlite3')
    if path.exists():
        delivery = json.loads(path.read_text(encoding='utf-8'))
        normalized = normalize_code(delivery['code'])
        if not normalized:
            raise ValueError('El archivo de entrega contiene un código inválido.')
        with store.db() as db:
            row = db.execute('''
                SELECT c.active, c.expires, c.username, u.active AS account_active
                FROM access_codes c JOIN users u ON u.username = c.username
                WHERE c.fingerprint = ?
            ''', (digest(normalized),)).fetchone()
        if (not row or row['active'] != 1 or row['account_active'] != 1
                or row['username'] != delivery['principal']
                or (row['expires'] is not None and row['expires'] <= time.time())):
            raise ValueError('El acceso fue revocado, venció o no corresponde a esta entrega.')
        delivery['expires'] = row['expires']
        return delivery
    principal = 'amigo_' + secrets.token_hex(4)
    code = store.create_code(principal)
    delivery = {'principal': principal, 'code': code}
    path.write_text(json.dumps(delivery), encoding='utf-8')
    return delivery


def copy_runtime(source, target):
    required = ['python.exe', 'python3.dll', 'python312.dll',
                'vcruntime140.dll', 'vcruntime140_1.dll', 'LICENSE.txt']
    if not all((source / name).is_file() for name in required):
        raise ValueError('Se requiere una distribución Windows completa de Python 3.12.')
    target.mkdir()
    for name in required:
        shutil.copy2(source / name, target / name)
    shutil.copytree(source / 'DLLs', target / 'DLLs', ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(source / 'Lib', target / 'Lib', ignore=shutil.ignore_patterns(
        'site-packages', '__pycache__', 'test', 'tests', 'tkinter',
        'idlelib', 'ensurepip', 'venv', 'turtledemo',
    ))


def build_friend(state, runtime=None):
    state = Path(state).resolve()
    load_library(state)  # Fail before issuing a code if the promised material is absent.
    delivery = prepare_access(state)
    output = ROOT / 'output'
    output.mkdir(exist_ok=True)
    builds = state / 'builds'
    builds.mkdir(exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='amigo-', dir=builds)).resolve()
    if not stage.is_relative_to(builds.resolve()):
        raise ValueError('Destino fuera de la carpeta privada de compilación.')
    bundle = stage / 'MetodoJudicial-Prueba'
    bundle.mkdir()
    ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.gitkeep')
    shutil.copytree(ROOT / 'backend', bundle / 'app/backend', ignore=ignore)
    shutil.copytree(ROOT / 'frontend/campus', bundle / 'app/frontend/campus', ignore=ignore)
    shutil.copy2(ROOT / 'frontend/access.html', bundle / 'app/frontend/access.html')
    build_public(bundle / 'app/frontend/public')
    private = bundle / 'private'
    shutil.copytree(state / 'library', private / 'library')
    isolated = Store(private / 'campus.sqlite3')
    isolated.create_code(delivery['principal'], delivery['code'], expires=delivery.get('expires'))
    shutil.copy2(ROOT / 'scripts/share_launcher.py', bundle / 'iniciar.py')
    credential = f"Código de acceso: {delivery['code']}\nNo se solicita usuario ni contraseña adicional.\n"
    (bundle / 'codigo-amigo.txt').write_text(credential, encoding='utf-8')
    (output / 'credencial-amigo.txt').write_text(credential, encoding='utf-8')
    if runtime:
        copy_runtime(Path(runtime), bundle / 'runtime')
    launcher = r'''@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\python.exe" (
  "runtime\python.exe" -I -B iniciar.py
) else (
  py -3 iniciar.py
)
pause
'''
    (bundle / 'INICIAR.cmd').write_bytes(launcher.replace('\n', '\r\n').encode('ascii'))
    (bundle / 'LEEME.txt').write_text('''MÉTODO JUDICIAL · PRUEBA PRIVADA

1. Extraé TODO el ZIP en una carpeta de tu computadora.
2. En Windows 64 bits, abrí INICIAR.cmd. La versión portátil incluye Python.
3. Se abrirá el navegador. Pegá el código de codigo-amigo.txt.
4. Probá Biblioteca, exámenes, comprensión lectora, mecanografía y resultados.
5. Dejá la ventana de consola abierta mientras usás la página. Cerrala al terminar.

No abrir los HTML con doble clic: necesitan el servidor para el campus.
Si el puerto habitual está ocupado, se elegirá otro; usá la dirección de la consola.
Los resultados de esta copia se guardan solo en su carpeta private.
No incluye resultados, sesiones ni códigos de otros usuarios.

CONTENIDO: cinco módulos con PDF, resumen, mapa, cuadro y esquema, y un repaso
general. Exámenes de demostración: 4 preguntas por módulo y 20 en el integrador.
Lectura: 4 preguntas por texto. Lectura y mecanografía: textos largos aleatorios.
No hay cobros ni publicación en Internet. El examen completo 20/50 está pendiente.

Este ZIP contiene materiales privados y un código. Compartilo por un canal privado
con la persona que va a probarlo. NO subir este ZIP a GitHub ni a GitHub Pages.
La copia completa permite acceder a sus archivos desde el disco: es una entrega
de prueba a una persona de confianza, no un sistema de protección comercial.

Código fuente: app/frontend y app/backend. Los datos privados están separados.
El intérprete portátil conserva su licencia en runtime/LICENSE.txt.
''', encoding='utf-8')
    archive = output / 'MetodoJudicial-Para-Amigo.zip'
    with ZipFile(archive, 'w', ZIP_DEFLATED) as zip_file:
        for path in bundle.rglob('*'):
            if path.is_file():
                zip_file.write(path, path.relative_to(stage).as_posix())
    return archive, bundle


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--runtime', type=Path)
    args = parser.parse_args()
    archive, _ = build_friend(args.state, args.runtime)
    print(f'Prueba privada: {archive}. Credencial separada en output/credencial-amigo.txt.')
