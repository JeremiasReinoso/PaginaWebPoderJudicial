from pathlib import Path
import ast
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ArchitectureBoundaries(unittest.TestCase):
    def test_domain_has_no_transport_or_persistence_dependencies(self):
        tree = ast.parse((ROOT / 'backend/domain.py').read_text(encoding='utf-8'))
        imports = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        imports.update(node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom))
        self.assertTrue(imports.isdisjoint({'sqlite3', 'http', 'app', 'storage', 'access', 'practices'}))

    def test_frontend_contains_no_server_or_private_data(self):
        for path in (ROOT / 'frontend').rglob('*'):
            if path.is_file():
                self.assertNotIn(path.suffix, {'.py', '.sqlite3', '.pdf'})
                self.assertNotEqual(path.name, 'library.json')

    def test_campus_module_imports_resolve_without_global_navigation(self):
        folder = ROOT / 'frontend/campus'
        for path in folder.glob('*.js'):
            source = path.read_text(encoding='utf-8')
            self.assertNotIn('window.showCampusSection', source)
            for reference in re.findall(r"(?:from\s*|import\s*)['\"](\./[^'\"]+)['\"]", source):
                self.assertTrue((folder / reference).is_file(), (path, reference))


if __name__ == '__main__':
    unittest.main()
