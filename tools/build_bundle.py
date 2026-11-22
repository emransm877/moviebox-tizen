"""Build the unsigned developer bundle; fail if its reviewed installer has drifted."""
import argparse
import hashlib
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

from package import package

ROOT = Path(__file__).resolve().parents[1]


def build_bundle(output_directory=None):
    output = Path(output_directory or ROOT / 'dist')
    manifest = ET.parse(ROOT / 'app/config.xml').getroot()
    version = manifest.attrib['version']
    application = manifest.find('{http://tizen.org/ns/widgets}application')
    if application is None or application.get('id') != 'MBoxTV2025.MovieBox' or application.get('package') != 'MBoxTV2025':
        raise ValueError('Recovery identity must remain MBoxTV2025.MovieBox / MBoxTV2025.')
    widget = output / f'MovieBox-TV-{version}-unsigned.wgt'
    result = package(widget)
    helper = (ROOT / 'tools/Install-MovieBoxTV.ps1').read_text(encoding='utf-8')
    expected = re.search(r"\$expectedHash = '([a-f0-9]{64})'", helper)
    if not expected or expected.group(1) != result['sha256']:
        raise ValueError('Reviewed installer hash differs from this source widget. Review the payload, then update the helper digest.')
    if f'MovieBox-TV-{version}-unsigned.wgt' not in helper:
        raise ValueError('Installer widget version differs from config.xml.')
    if "'was_execute', 'MBoxTV2025.MovieBox'" not in helper:
        raise ValueError('Installer launch identity differs from the reviewed application.')
    files = [
        (widget, widget.name),
        (widget.with_suffix('.wgt.sha256'), widget.name + '.sha256'),
        (ROOT / 'tools/Install-MovieBoxTV.ps1', 'Install-MovieBoxTV.ps1'),
        (ROOT / 'tools/Install-MovieBoxTV.cmd', 'Install-MovieBoxTV.cmd'),
        (ROOT / 'docs/INSTALL-TV.md', 'INSTALL-TV.md'),
        (ROOT / 'LICENSE', 'LICENSE'),
        (ROOT / 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'),
    ]
    bundle = output / f'MovieBox-TV-{version}-install-bundle.zip'
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source, name in files:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes())
    digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
    bundle.with_suffix('.zip.sha256').write_text(f'{digest}  {bundle.name}\n', encoding='utf-8')
    return {'path': str(bundle), 'sha256': digest, 'widget_sha256': result['sha256'], 'version': version}


if __name__ == '__main__':
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-directory')
    print(json.dumps(build_bundle(parser.parse_args().output_directory), indent=2))
