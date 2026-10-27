from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT / 'scripts'))
from library import load_library, _read_library
from styles import bundle_styles
from package_pages import build_public
import package_pages


class Optimizations(unittest.TestCase):
    def test_library_cache_refreshes_when_source_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'library/library.json'
            path.parent.mkdir()
            data = {'modules': [{'id': x} for x in ['1', '2', '3', '4', '5', 'general']]}
            path.write_text(json.dumps(data), encoding='utf-8')
            first = load_library(temp)
            self.assertIs(first, load_library(temp))
            data['note'] = 'Nueva edición con contenido actualizado'
            path.write_text(json.dumps(data), encoding='utf-8')
            updated = load_library(temp)
            self.assertIsNot(first, updated)
            self.assertEqual(updated['note'], data['note'])
        _read_library.cache_clear()

    def test_styles_keep_order_and_relative_asset_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'sub').mkdir()
            (root / 'main.css').write_text("@import url('./sub/base.css');\nh1{color:blue}", encoding='utf-8')
            (root / 'sub/base.css').write_text('h1{color:red;background:url(../../img/test.svg)}', encoding='utf-8')
            css = bundle_styles(root)
            self.assertLess(css.index('color:red'), css.index('color:blue'))
            self.assertIn('../img/test.svg', css)
            self.assertNotIn('@import', css)
            (root / 'sub/base.css').write_text("@import url('../main.css');", encoding='utf-8')
            with self.assertRaises(ValueError):
                bundle_styles(root)

    def test_public_build_delivers_one_stylesheet(self):
        with tempfile.TemporaryDirectory() as temp:
            root = build_public(Path(temp) / 'site')
            self.assertEqual([p.relative_to(root).as_posix() for p in root.rglob('*.css')], ['css/main.css'])
            self.assertNotIn('@import', (root / 'css/main.css').read_text(encoding='utf-8'))
    def test_rebuild_replaces_complete_artifact_and_keeps_recoverable_previous(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            previous=root/'dist';previous.mkdir()
            (previous/'obsolete.txt').write_text('old build',encoding='utf-8')
            with patch.object(package_pages,'ROOT',root):
                result=package_pages.rebuild_public()
            self.assertTrue((result/'index.html').is_file())
            self.assertTrue((result/'css/main.css').is_file())
            self.assertFalse((result/'obsolete.txt').exists())
            saved=list((root/'output/pages-builds').glob('anterior-*/obsolete.txt'))
            self.assertEqual(len(saved),1)


if __name__ == '__main__':
    unittest.main()
