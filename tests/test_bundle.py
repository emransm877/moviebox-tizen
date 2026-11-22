"""Review boundary for the unsigned widget and its actual installation helper."""
import hashlib
import importlib.util
import io
import shutil
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from build_bundle import build_bundle
import package as widget_package


class BundleTests(unittest.TestCase):
    def test_bundle_contains_matching_widget_helper_and_checksums(self):
        with tempfile.TemporaryDirectory() as folder:
            result = build_bundle(folder)
            with zipfile.ZipFile(result['path']) as archive:
                names = archive.namelist()
                self.assertEqual(len(names), 7)
                self.assertIn('Install-MovieBoxTV.cmd', names)
                widget_name = f"MovieBox-TV-{result['version']}-unsigned.wgt"
                self.assertEqual(hashlib.sha256(archive.read(widget_name)).hexdigest(), result['widget_sha256'])
                self.assertIn(result['widget_sha256'], archive.read('Install-MovieBoxTV.ps1').decode('utf-8'))
                self.assertIn(result['widget_sha256'], archive.read(widget_name + '.sha256').decode('utf-8'))
                self.assertFalse(any(name.lower().endswith(('.p12', '.key', '.pfx')) for name in names))
            self.assertIn(result['sha256'], Path(result['path'] + '.sha256').read_text())

    def test_changed_payload_cannot_silently_ship_with_old_reviewed_helper(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch('build_bundle.package', return_value={'sha256': '0' * 64}):
                with self.assertRaisesRegex(ValueError, 'Reviewed installer hash differs'):
                    build_bundle(folder)

    def test_output_is_reproducible(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            self.assertEqual(build_bundle(first)['sha256'], build_bundle(second)['sha256'])

    def test_lf_and_crlf_checkouts_match_reviewed_digest_and_preserve_binary(self):
        digests=[]
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)
            for style in ('lf','crlf'):
                checkout=base/style
                shutil.copytree(ROOT/'app',checkout/'app')
                binaries={}
                for path in (checkout/'app').rglob('*'):
                    if not path.is_file():continue
                    if path.suffix.lower() in widget_package.TEXT_SUFFIXES:
                        text=path.read_bytes().decode('utf-8').replace('\r\n','\n').replace('\r','\n')
                        path.write_bytes((text if style=='lf' else text.replace('\n','\r\n')).encode('utf-8'))
                    else:binaries[path.relative_to(checkout/'app').as_posix()]=path.read_bytes()
                with patch('package.ROOT',checkout):
                    result=build_bundle(base/(style+'-output'))
                digests.append(result['widget_sha256'])
                with zipfile.ZipFile(result['path']) as bundle:
                    widget=bundle.read(f"MovieBox-TV-{result['version']}-unsigned.wgt")
                with zipfile.ZipFile(io.BytesIO(widget)) as archive:
                    for name,data in binaries.items():self.assertEqual(archive.read(name),data,name)
                    for name in archive.namelist():
                        if Path(name).suffix.lower() in widget_package.TEXT_SUFFIXES:
                            self.assertNotIn(b'\r',archive.read(name),name)
                self.assertTrue(binaries,'Exercise genuine binary payload files too')
            self.assertEqual(digests[0],digests[1])

    def test_invalid_utf8_text_is_rejected_instead_of_reencoded(self):
        with tempfile.TemporaryDirectory() as folder:
            checkout=Path(folder)
            shutil.copytree(ROOT/'app',checkout/'app')
            (checkout/'app/js/app.js').write_bytes(b'// invalid UTF-8\xff\r\n')
            with patch('package.ROOT',checkout):
                with self.assertRaisesRegex(ValueError,'TV text payload must be UTF-8: app.js'):
                    widget_package.package(checkout/'invalid.wgt')

    def test_recovery_cannot_accidentally_change_application_identity(self):
        manifest = ET.fromstring('<widget xmlns:t="http://tizen.org/ns/widgets" version="0.9.3"><t:application id="Other.App" package="Other"/></widget>')
        with tempfile.TemporaryDirectory() as folder, patch('build_bundle.ET.parse', return_value=ET.ElementTree(manifest)):
            with self.assertRaisesRegex(ValueError, 'Recovery identity'):
                build_bundle(folder)


if __name__ == '__main__':
    unittest.main()
