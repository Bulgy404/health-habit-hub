"""Portrait Play/YouTube teaser concepts using current shared Flutter UI.

The source is the actual Xcode recording; iOS status-bar pixels are cropped
away. Android-specific validation is still pending, so exports stay concepts.
"""
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import json

HERE=Path(__file__).resolve().parent
PACKAGE=HERE.parent
brand=ET.parse(PACKAGE/'brand-package/health-habit-hub-logo-white.svg').getroot()
paths=''.join(ET.tostring(n,encoding='unicode') for n in brand)
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<rect width="1080" height="1920" fill="#2E8C00"/>
<g fill="none" stroke="#68AC4B" stroke-width="2.5">
<path d="M-80 140L85 585L-50 1030L78 1490L-65 1870M1120 310L1000 780L1140 1190L1018 1700"/>
<circle cx="-80" cy="140" r="190" fill="#409519"/><circle cx="85" cy="585" r="44"/><circle cx="-50" cy="1030" r="110"/>
<circle cx="78" cy="1490" r="32" fill="#409519"/><circle cx="-65" cy="1870" r="130"/>
<circle cx="1120" cy="310" r="145"/><circle cx="1000" cy="780" r="40" fill="#409519"/>
<circle cx="1140" cy="1190" r="170"/><circle cx="1018" cy="1700" r="32" fill="#409519"/>
</g>
<svg x="320" y="28" width="440" height="152.65" viewBox="470 240 980 340">{paths}</svg>
</svg>'''
(HERE/'play-teaser-background.svg').write_text(svg)
subprocess.run(['rsvg-convert','-o',str(HERE/'play-teaser-background.png'),str(HERE/'play-teaser-background.svg')],check=True)
results=[]
for lang in ('en','de'):
    source=PACKAGE/f'capture/recordings/health-habit-hub-iphone-app-preview-{lang}-25s.mp4'
    target=HERE/f'health-habit-hub-play-teaser-concept-{lang}-25s.mp4'
    filters='[1:v]crop=886:1790:0:130,scale=-2:1650[ui];[0:v][ui]overlay=(W-w)/2:220:shortest=1,format=yuv420p[v]'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',str(HERE/'play-teaser-background.png'),'-i',str(source),
        '-filter_complex',filters,'-map','[v]','-an','-frames:v','750','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration','-of','json',str(target)]))
    assert data['streams'][0]['width']==1080 and data['streams'][0]['height']==1920
    assert data['streams'][0]['nb_frames']=='750' and abs(float(data['format']['duration'])-25)<.001
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(target),'-f','null','-'],check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2','-i',str(target),'-frames:v','1',str(HERE/f'play-teaser-concept-{lang}-poster.png')],check=True)
    results.append({'file':target.name,'validation':data})
    print('Rendered and validated',target.name,flush=True)
(HERE/'teaser-validation.json').write_text(json.dumps(results,indent=2))
