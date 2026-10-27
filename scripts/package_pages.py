"""Package only allowlisted public files for GitHub Pages; Python standard library."""
from pathlib import Path
import shutil
import uuid
from styles import bundle_styles

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'frontend/public'
PAGES=['index.html',*('pages/'+name+'.html' for name in ['material-estudio','institucional','contacto','novedades','terminos','privacidad','fuentes'])]
DIRECTORIES=['css','js','assets/img']
SUFFIXES={'.css','.js','.svg','.webp','.png','.jpg','.jpeg','.woff2'}

def build_public(destination):
    destination=Path(destination).resolve()
    if destination==ROOT or destination.is_symlink():raise ValueError('Destino inválido.')
    if destination.exists():raise FileExistsError('El destino debe ser una carpeta nueva y vacía.')
    destination.mkdir(parents=True)
    for relative in PAGES:
        source=SOURCE/relative
        if source.is_symlink():raise ValueError('No se empaquetan enlaces simbólicos.')
        target=destination/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    for relative in DIRECTORIES:
        for source in (SOURCE/relative).rglob('*'):
            if source.is_symlink():raise ValueError('No se empaquetan enlaces simbólicos.')
            if not source.is_file() or source.suffix.lower() not in SUFFIXES:continue
            if source.suffix.lower()=='.css':continue
            target=destination/source.relative_to(SOURCE);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
    css=destination/'css/main.css';css.parent.mkdir(parents=True,exist_ok=True)
    css.write_text(bundle_styles(SOURCE/'css'),encoding='utf-8')
    (destination/'.nojekyll').touch()
    return destination

def rebuild_public():
    target=ROOT/'dist'
    if target.is_symlink() or target.resolve()!=ROOT.resolve()/'dist':raise SystemExit('Destino de compilación no seguro.')
    builds=ROOT/'output/pages-builds'
    builds.mkdir(parents=True,exist_ok=True)
    stage=builds/f'nuevo-{uuid.uuid4().hex}'
    build_public(stage)
    previous=None
    if target.exists():
        previous=builds/f'anterior-{uuid.uuid4().hex}'
        target.rename(previous)
    try:
        stage.rename(target)
    except OSError:
        if previous is not None:previous.rename(target)
        raise
    return target


if __name__=='__main__':
    target=rebuild_public()
    print(f'Paquete público generado: {target}. Backend, pruebas, bases y códigos excluidos.')
