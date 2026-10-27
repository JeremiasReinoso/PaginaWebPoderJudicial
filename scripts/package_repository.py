"""Create a source ZIP for upload to a repository, excluding runtime/private files."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parent.parent
DIRECTORIES=['.github','frontend','backend','scripts','tests','docs']
ROOT_FILES=['README.md','.gitignore','.gitattributes']
SUFFIXES={'.py','.ps1','.js','.css','.html','.svg','.webp','.png','.jpg','.md','.yml','.yaml'}

def package():
    output=ROOT/'output/repositorio-github.zip';output.parent.mkdir(exist_ok=True)
    with ZipFile(output,'w',ZIP_DEFLATED) as archive:
        for name in ROOT_FILES:
            path=ROOT/name
            if path.is_file() and not path.is_symlink():archive.write(path,name)
        for directory in DIRECTORIES:
            for path in (ROOT/directory).rglob('*'):
                if not path.is_file() or path.is_symlink() or path.suffix.lower() not in SUFFIXES or '__pycache__' in path.parts:continue
                archive.write(path,path.relative_to(ROOT).as_posix())
    print(f'ZIP del repositorio: {output}. Sin códigos, bases, PDF ni archivos de ejecución local.')
if __name__=='__main__':package()
