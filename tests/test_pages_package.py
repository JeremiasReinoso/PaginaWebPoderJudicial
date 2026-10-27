"""Verify the GitHub Pages artifact and paths under a repository prefix."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, unquote
import sys, tempfile, unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from package_pages import build_public

class References(HTMLParser):
    def __init__(self):super().__init__();self.refs=[];self.fields=[];self.ids=[]
    def handle_starttag(self,tag,attributes):
        attrs=dict(attributes)
        if 'id' in attrs:self.ids.append(attrs['id'])
        if tag=='input':self.fields.append(attrs.get('name'))
        for key in ('href','src'):
            if key in attrs:self.refs.append(attrs[key])

class PagesPackage(unittest.TestCase):
    def test_public_artifact_excludes_backend_and_private_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=build_public(Path(tmp)/'site')
            self.assertTrue((root/'.nojekyll').is_file())
            self.assertFalse((root/'server').exists());self.assertFalse((root/'tests').exists());self.assertFalse((root/'scripts').exists())
            self.assertFalse((root/'backend').exists());self.assertFalse((root/'campus').exists())
            for p in root.rglob('*'):
                if p.is_file():
                    self.assertNotIn(p.suffix.lower(),('.py','.sqlite3','.pdf','.txt','.ps1'))
    def test_links_work_under_github_repository_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=build_public(Path(tmp)/'site');parsed={}
            for file in root.rglob('*.html'):
                page=References();page.feed(file.read_text(encoding='utf-8'));parsed[file]=page
                self.assertEqual(page.fields,['code'],file.name)
            for file,page in parsed.items():
                url='https://example.github.io/mi-repositorio/'+file.relative_to(root).as_posix()
                for reference in page.refs:
                    result=urlsplit(urljoin(url,reference))
                    if result.netloc!='example.github.io':continue
                    self.assertTrue(result.path.startswith('/mi-repositorio/'),(file,reference))
                    target=root/unquote(result.path.removeprefix('/mi-repositorio/'))
                    self.assertTrue(target.is_file(),(file,reference))
                    if result.fragment and target in parsed:self.assertIn(result.fragment,parsed[target].ids)
    def test_config_has_no_enabled_backend_or_embedded_access_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=build_public(Path(tmp)/'site')
            config=(root/'js/config.js').read_text(encoding='utf-8')
            self.assertIn("campusUrl: ''",config)
            self.assertNotIn('localStorage',(root/'js/modules/ui.js').read_text(encoding='utf-8'))
            self.assertFalse(any('codigo-' in p.name for p in root.rglob('*')))
if __name__=='__main__':unittest.main(verbosity=2)
