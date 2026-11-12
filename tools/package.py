"""Build a small unsigned WGT, or sign it with an existing Tizen profile."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def package(output=None):
    app=ROOT/'app'
    manifest=ET.parse(app/'config.xml').getroot()
    ns={'w':'http://www.w3.org/ns/widgets','t':'http://tizen.org/ns/widgets'}
    if manifest.find('w:name',ns).text!='MovieBox':raise ValueError('Installed application must be named MovieBox')
    entry=manifest.find('w:content',ns).attrib['src']
    if not (app/entry).is_file():raise ValueError('Application entry point is missing')
    output=Path(output or ROOT/'dist'/f'MovieBox-TV-{manifest.attrib["version"]}-unsigned.wgt')
    output.parent.mkdir(parents=True,exist_ok=True)
    blocked={'.p12','.pfx','.pem','.key','.keystore','.jks','.log'}
    generated={'.manifest.tmp','author-signature.xml','signature1.xml'}
    files=sorted(p for p in app.rglob('*') if p.is_file() and p.name not in generated)
    for path in files:
        if path.suffix.lower() in blocked or any(part.startswith('.') for part in path.relative_to(app).parts):
            raise ValueError('Private/generated file in TV app payload')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            name=path.relative_to(app).as_posix()
            item=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));item.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(item,path.read_bytes())
    digest=hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.wgt.sha256').write_text(digest+'  '+output.name+'\n',encoding='utf-8')
    return {'path':str(output),'bytes':output.stat().st_size,'files':len(files),'sha256':digest,'signed':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output');parser.add_argument('--tizen');parser.add_argument('--profile')
    args=parser.parse_args();result=package(args.output)
    if args.profile:
        if not args.tizen:parser.error('--tizen is required with --profile')
        subprocess.run([args.tizen,'package','-t','wgt','-s',args.profile,'--',str(ROOT/'app')],check=True)
    print(json.dumps(result,indent=2))
