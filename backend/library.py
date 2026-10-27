"""Read teaching content from private runtime storage, never the static checkout."""
from pathlib import Path
from functools import lru_cache
import json

MODULE_IDS = {'1','2','3','4','5','general'}

def load_library(state):
    folder=Path(state)/'library'
    path=folder/'library.json'
    if not path.is_file() or path.is_symlink():raise FileNotFoundError()
    stamp=path.stat()
    return _read_library(str(path.resolve()),stamp.st_mtime_ns,stamp.st_size)


@lru_cache(maxsize=8)
def _read_library(filename,modified,size):
    """Bounded server-memory cache. A changed source file invalidates the key."""
    data=json.loads(Path(filename).read_text(encoding='utf-8'))
    if {item['id'] for item in data['modules']} != MODULE_IDS:raise ValueError('Catálogo incompleto.')
    return data

def catalog(data):
    return {
        'title':'Biblioteca de estudio', 'note':data['note'], 'edition':data['edition'],
        'sources':[{key:value for key,value in source.items() if key in ('id','title','pages','originalName')} for source in data['sources']],
        'modules':[{key:value for key,value in item.items() if key in ('id','title','intro','sourceIds')} | {'sections':len(item['summary'])} for item in data['modules']]
    }

def get_module(data,identifier):
    return next((item for item in data['modules'] if item['id']==identifier),None)

def book_path(state,identifier):
    if identifier not in {'1','2','3','4','5'}:return None
    path=Path(state)/'library'/'documents'/f'module-{identifier}.pdf'
    if not path.is_file() or path.is_symlink():return None
    return path
