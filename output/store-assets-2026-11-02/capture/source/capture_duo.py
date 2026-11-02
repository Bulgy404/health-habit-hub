"""Capture a verified native Duo display; never resize an iPhone original."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import time
import urllib.parse
import urllib.request
from PIL import Image,ImageStat

OUT=Path(__file__).resolve().parents[1]
SCREENS=[('01-my-habits','/habits'),('02-habit-strength','/habits/walk'),('03-explore','/explore'),('04-share','/share'),('05-new-habit','/habits/new/behavior'),('06-recommendations','/recommend')]

def sim(*args):return subprocess.run(['xcrun','simctl',*args],capture_output=True,text=True,check=True).stdout.strip()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--display',required=True)
    parser.add_argument('--kind',choices=['outer','inner'],required=True)
    args=parser.parse_args()
    device=json.loads((OUT/'duo-device.json').read_text())
    udid=device['udid']
    expected={'outer':(1398,2034),'inner':(2007,2853)}[args.kind]
    manifest=json.loads((OUT/'capture-manifest.json').read_text())
    prefix='raw/duo-'+args.kind+'/'
    manifest['files']=[f for f in manifest['files'] if not f['path'].startswith(prefix)]
    captured=[]
    for lang in ('en','de'):
        folder=OUT/'raw'/('duo-'+args.kind)/lang
        folder.mkdir(parents=True,exist_ok=True)
        for name,path in SCREENS:
            query=urllib.parse.urlencode({'path':path,'lang':lang})
            with urllib.request.urlopen('http://127.0.0.1:9094/route?'+query,timeout=20) as response:assert json.load(response)['ok']
            time.sleep(.4)
            file=folder/(name+'.png')
            sim('io',udid,'screenshot','--display='+args.display,str(file))
            im=Image.open(file).convert('RGB')
            assert im.size in (expected,expected[::-1]),(im.size,expected)
            assert max(ImageStat.Stat(im).stddev)>8,'Display appears blank; do not use this capture'
            captured.append({'path':str(file.relative_to(OUT)),'device':'iPhone Duo','display':args.kind,'display_id':args.display,'orientation':'landscape' if im.width>im.height else 'portrait','runtime':device['runtime'],'build_toolchain':'Xcode 27.2 (27B52), iOS 27.2 SDK','locale':lang,'route':path,'width':im.width,'height':im.height,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
            print('Captured',str(file.relative_to(OUT)),im.size,flush=True)
    manifest['files'].extend(captured)
    kinds=sorted({f['display'] for f in manifest['files'] if f.get('device')=='iPhone Duo'})
    manifest['duo']={'device_udid':udid,'runtime':device['runtime'],'native_displays_captured':kinds,'capture_source':'Actual current app rendered on the iPhone Duo simulator; originals are not resized'}
    (OUT/'capture-manifest.json').write_text(json.dumps(manifest,indent=2))
    print('Verified native Duo',args.kind,'screens:',len(captured),flush=True)

if __name__=='__main__':main()
