"""Capture the current Flutter UI on dedicated Xcode simulators."""
from pathlib import Path
import hashlib
import json
import signal
import subprocess
import time
import urllib.parse
import urllib.request
from PIL import Image

HERE=Path(__file__).resolve().parent
OUT=HERE.parent
APP=Path('/private/tmp/hhh-store-capture-20261102/mobile/build/ios/iphonesimulator/Runner.app')
BUNDLE='de.felixreinsch.healthhabithub'
DEVICES=json.loads((OUT/'simulator-devices.json').read_text())
SCREENS=[('01-my-habits','/habits'),('02-habit-strength','/habits/walk'),('03-explore','/explore'),('04-share','/share'),('05-new-habit','/habits/new/behavior'),('06-recommendations','/recommend')]

def sim(*args,check=True):
    p=subprocess.run(['xcrun','simctl',*args],capture_output=True,text=True,check=check)
    return p.stdout.strip()

def route(path,lang):
    query=urllib.parse.urlencode({'path':path,'lang':lang})
    with urllib.request.urlopen('http://127.0.0.1:9094/route?'+query,timeout=15) as response:
        data=json.load(response)
        assert data['ok'],data

def ready():
    for _ in range(45):
        try:
            with urllib.request.urlopen('http://127.0.0.1:9094/health',timeout=1) as response:
                if json.load(response)['ok']:return
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('Capture controller did not start')

def record(device,lang):
    folder=OUT/'recordings'
    folder.mkdir(exist_ok=True)
    native=folder/f'iphone-native-{lang}.mov'
    route('/habits',lang)
    log=open(folder/f'recording-{lang}.log','w')
    proc=subprocess.Popen(['xcrun','simctl','io',device,'recordVideo','--codec=h264','--force',str(native)],stdout=log,stderr=log)
    try:
        for _ in range(50):
            log.flush()
            if 'Recording started' in (folder/f'recording-{lang}.log').read_text():break
            if proc.poll() is not None:raise RuntimeError('Native recording did not start')
            time.sleep(.1)
        else:raise RuntimeError('Native recording readiness timeout')
        start=time.monotonic()
        for i,path in enumerate(['/habits','/habits/walk','/explore','/share','/recommend']):
            if i:route(path,lang)
            remaining=start+(i+1)*5-time.monotonic()
            if remaining>0:time.sleep(remaining)
    finally:
        proc.send_signal(signal.SIGINT)
        proc.wait(timeout=30)
        log.close()
    final=folder/f'health-habit-hub-iphone-app-preview-{lang}-25s.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(native),'-an',
        '-vf','fps=fps=30:start_time=0,scale=886:1920:force_original_aspect_ratio=decrease,pad=886:1920:(ow-iw)/2:(oh-ih)/2:color=0xF4F5F2,tpad=stop_mode=clone:stop_duration=10',
        '-frames:v','750','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(final)],check=True)
    print('Recorded',final.name,flush=True)

manifest={'app':'Health Habit Hub','version':'1.3.1+7','capture_date':'2026-11-02',
    'source':'Current app widgets, themes, routes, and translations in an isolated simulator build',
    'data':'Fictional local fixture account; no real participant data or backend requests',
    'notification_prompts':'Disabled through capture-only provider override',
    'duo':'Pending full Xcode 27.1+ and Duo runtime/device; no Duo captures are represented',
    'files':[]}
last=None
for group,info in DEVICES.items():
    device=info['udid']
    if last:
        sim('terminate',last,BUNDLE,check=False)
        sim('shutdown',last,check=False)
    state=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','available','-j']))
    booted=any(d['udid']==device and d['state']=='Booted' for ds in state['devices'].values() for d in ds)
    if not booted:sim('boot',device)
    sim('bootstatus',device,'-b')
    sim('ui',device,'appearance','light')
    sim('status_bar',device,'override','--time','9:41','--dataNetwork','wifi','--wifiMode','active','--wifiBars','3','--batteryState','discharging','--batteryLevel','100')
    sim('terminate',device,BUNDLE,check=False)
    sim('install',device,str(APP))
    sim('launch',device,BUNDLE)
    ready()
    for lang in ('en','de'):
        folder=OUT/'raw'/group/lang
        folder.mkdir(parents=True,exist_ok=True)
        for name,path in SCREENS:
            route(path,lang)
            file=folder/f'{name}.png'
            sim('io',device,'screenshot',str(file))
            im=Image.open(file)
            manifest['files'].append({'path':str(file.relative_to(OUT)),'device':info['name'],'runtime':info['runtime'],'locale':lang,'route':path,'width':im.width,'height':im.height,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
            print('Captured',str(file.relative_to(OUT)),im.size,flush=True)
    if group=='iphone-medium':
        for lang in ('en','de'):record(device,lang)
    (OUT/'capture-manifest.json').write_text(json.dumps(manifest,indent=2))
    last=device
sim('terminate',last,BUNDLE,check=False)
sim('shutdown',last,check=False)
print('Capture batch complete:',len(manifest['files']),'screenshots',flush=True)
