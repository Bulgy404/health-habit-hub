"""Animate only the graph layer of the approved v4 green header.

The heart and outlined wordmark are copied verbatim from the approved SVG.
No generation, relayout, resizing, or typography substitution is performed.
"""
from copy import deepcopy
from pathlib import Path
import json
import subprocess
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'output/app-store-header/v4/health-habit-hub-banner-green.svg'
ET.register_namespace('', 'http://www.w3.org/2000/svg')
source = ET.parse(SOURCE).getroot()
children = list(source)
assert len(children) == 17
assert all(node.tag.endswith('g') for node in children[-3:])

background = ET.Element(source.tag, {
    'width': '3904', 'height': '1710', 'viewBox': '-16 -16 1952 855',
})
for node in children[:-3]:
    background.append(deepcopy(node))
rect = background.find('{http://www.w3.org/2000/svg}rect')
rect.attrib.update({'x': '-16', 'y': '-16', 'width': '1952', 'height': '855'})

foreground = ET.Element(source.tag, dict(source.attrib))
for node in children[-3:]:
    foreground.append(deepcopy(node))

for name, node in [('graph-background', background), ('static-logo-wordmark', foreground)]:
    svg = HERE / f'{name}.svg'
    ET.ElementTree(node).write(svg, encoding='utf-8', xml_declaration=True)
    subprocess.run(['rsvg-convert', '-o', str(HERE / f'{name}.png'), str(svg)], check=True)

video = HERE / 'health-habit-hub-header-loop-8s.mp4'
filters = (
    '[0:v]format=rgba,crop=3840:1646:'
    "x='32+16*sin(2*PI*n/240)':y='32+10*sin(2*PI*n/240)':exact=1[bg];"
    '[bg][1:v]overlay=0:0:shortest=1,format=yuv420p[v]'
)
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-framerate', '30', '-i', str(HERE/'graph-background.png'),
    '-loop', '1', '-framerate', '30', '-i', str(HERE/'static-logo-wordmark.png'),
    '-filter_complex', filters, '-map', '[v]', '-an', '-frames:v', '240',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', str(video),
], check=True)

subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '4',
    '-i', str(video), '-frames:v', '1', str(HERE/'header-loop-midpoint.png'),
], check=True)
probe = subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_entries',
    'stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration',
    '-of', 'json', str(video),
], text=True)
(HERE/'validation.json').write_text(probe)
result = json.loads(probe)
stream = result['streams'][0]
assert stream['width'] == 3840 and stream['height'] == 1646
assert stream['r_frame_rate'] == '30/1'
assert stream['codec_name'] == 'h264' and stream['pix_fmt'] == 'yuv420p'
assert stream['nb_frames'] == '240'
assert len(result['streams']) == 1 and stream['codec_type'] == 'video'
assert abs(float(result['format']['duration']) - 8) < 0.001
subprocess.run([
    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video),
    '-f', 'null', '-',
], check=True)
print(probe)
