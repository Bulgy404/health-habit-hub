#!/usr/bin/env python3
"""Build the clean ElevenLabs presenter edit with real app cutaways.

Creates vector title/caption overlays with librsvg. Uses ffmpeg for video
assembly; original AAC speech packets are copied without re-encoding.
"""
from pathlib import Path
import base64
import json
import os
import shutil
import subprocess
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PACK = HERE.parent
ASSETS = ROOT / 'website/src/assets/device-mockups'
ICON = ROOT / 'website/public/app_icon.png'
SOURCE = HERE / 'elevenlabs-presenter-source.mp4'
OUT = PACK / 'video/03-elevenlabs-presenter.mp4'
OVERLAYS = HERE / 'presenter-overlays'
OVERLAYS.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)

# Timings follow the actual speech pauses in the 19.04-second source.
# Website spelling is normalized for readability while preserving the words.
CAPTIONS = [
    (0.16, 1.30, ['Building a routine?']),
    (2.00, 3.90, ['Start with one small habit.']),
    (4.20, 5.46, ['Health Habit Hub helps you']),
    (5.46, 6.45, ['track your habits']),
    (6.45, 7.62, ['and see your progress.']),
    (7.77, 8.96, ['You can also choose to']),
    (8.96, 10.37, ['share habits anonymously']),
    (10.37, 12.03, ['for research at TU Dresden.']),
    (12.35, 13.15, ['It’s free,']),
    (13.27, 15.10, ['with no name or email needed.']),
    (15.46, 16.90, ['Find your next small step']),
    (16.90, 18.98, ['at healthhabithub.de.']),
]

def run(args, **kwargs):
    return subprocess.run(['rtk', *map(str, args)], check=True, **kwargs)

font_config = HERE / 'presenter-fonts.conf'
font_config.write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">'
    '<fontconfig><include ignore_missing="yes">/opt/homebrew/etc/fonts/fonts.conf</include>'
    f'<dir>{ROOT / "output/pdf/source/fonts"}</dir>'
    '<cachedir>/tmp/hhh-presenter-font-cache</cachedir></fontconfig>')
env = os.environ.copy()
env['FONTCONFIG_FILE'] = str(font_config)

def text(x, y, words, size=32, family='Figtree', weight=400,
         fill='#0f172a', anchor='start'):
    if family == 'Figtree':
        family = 'Figtree-Bold' if weight >= 700 else 'Figtree-Semibold' if weight >= 600 else 'Figtree-Regular'
    elif family == 'Fraunces':
        family = 'Fraunces-Medium'
    return (f'<text x="{x}" y="{y}" fill="{fill}" font-family="{family}" '
            f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">'
            f'{escape(words)}</text>')

def image(path, x, y, w, h):
    data = base64.b64encode(path.read_bytes()).decode()
    return f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/png;base64,{data}"/>'

def svg(name, body):
    vector = OVERLAYS / f'{name}.svg'
    bitmap = OVERLAYS / f'{name}.png'
    vector.write_text('<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" width="720" height="1280" '
        'viewBox="0 0 720 1280">' + body + '</svg>')
    run(['rsvg-convert', '--output', bitmap, vector], env=env, stdout=subprocess.DEVNULL)
    return bitmap

label = svg('ai-presenter-label',
    '<rect x="42" y="42" width="158" height="44" rx="9" fill="#123a22" fill-opacity="0.90"/>'
    + text(121, 72, 'AI presenter', size=24, weight=600, fill='white', anchor='middle'))

cutaways = []
for name, phone, title in [
    ('habits', 'Habits.png', 'Track your habits.'),
    ('progress', 'SRHI.png', 'See your progress.'),
]:
    body = '<rect width="720" height="1280" fill="#edf7e8"/>'
    body += image(ICON, 42, 38, 48, 48)
    body += text(107, 72, 'Health Habit Hub', size=28, weight=600)
    body += text(42, 149, title, size=47, family='Fraunces', weight=500)
    body += '<rect x="547" y="107" width="132" height="36" rx="8" fill="white"/>'
    body += text(613, 132, 'App preview', size=20, weight=600, fill='#256f00', anchor='middle')
    # Use the genuine transparent device PNG, fitted intact; no AI interface.
    body += image(ASSETS / phone, 152, 194, 416, 858)
    cutaways.append(svg(name, body))

end_body = '<rect width="720" height="1280" fill="#123a22"/>'
end_body += '<circle cx="360" cy="320" r="180" fill="#1b4b2d"/>'
end_body += image(ICON, 302, 247, 116, 116)
end_body += text(360, 453, 'Health Habit Hub', size=44, weight=700, fill='white', anchor='middle')
end_body += text(360, 566, 'Find your next', size=58, family='Fraunces', weight=500, fill='#f8fbef', anchor='middle')
end_body += text(360, 637, 'small step.', size=65, family='Fraunces', weight=500, fill='#f8fbef', anchor='middle')
end_body += '<rect x="98" y="726" width="524" height="70" rx="14" fill="#f8fbef"/>'
end_body += text(360, 771, 'Download free · iOS & Android', size=29, weight=600, fill='#123a22', anchor='middle')
end_body += text(360, 891, 'healthhabithub.de', size=45, weight=700, fill='white', anchor='middle')
end_body += text(360, 1039, 'Research at TU Dresden', size=26, weight=400, fill='#cfe7c7', anchor='middle')
end_card = svg('end-card', end_body)

caption_files = []
for i, (_, _, lines) in enumerate(CAPTIONS):
    body = '<rect x="32" y="1110" width="656" height="108" rx="15" fill="#102617" fill-opacity="0.94"/>'
    for line_i, line in enumerate(lines):
        body += text(360, 1175 + line_i * 42, line, size=33, weight=600,
                     fill='white', anchor='middle')
    caption_files.append(svg(f'caption-{i + 1:02d}', body))

inputs = [label, *cutaways, end_card, *caption_files]
args = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y', '-i', SOURCE]
for item in inputs:
    args += ['-loop', '1', '-framerate', '25', '-i', item]

filters = ['[0:v]setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,'
    'crop=720:1280,fps=25,tpad=stop_mode=clone:stop_duration=3.2[base]']
filters.append("[base][1:v]overlay=0:0:enable='lt(t,4)+between(t,10,19.039)'[v1]")
filters.append("[v1][2:v]overlay=0:0:enable='gte(t,4)*lt(t,7)'[v2]")
filters.append("[v2][3:v]overlay=0:0:enable='gte(t,7)*lt(t,10)'[v3]")
filters.append("[v3][4:v]overlay=0:0:enable='gte(t,19.04)'[v4]")
previous = 'v4'
for i, (start, end, _) in enumerate(CAPTIONS):
    current = f'c{i}'
    filters.append(f"[{previous}][{i+5}:v]overlay=0:0:enable='gte(t,{start})*lt(t,{end})'[{current}]")
    previous = current
args += ['-filter_complex_threads', '1', '-filter_complex', ';'.join(filters),
    '-map', f'[{previous}]', '-map', '0:a:0', '-t', '22.04', '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
    '-movflags', '+faststart', OUT]
run(args)

def timestamp(value):
    ms = round(value*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
srt = []
for i, (start, end, lines) in enumerate(CAPTIONS, 1):
    srt.append(f'{i}\n{timestamp(start)} --> {timestamp(end)}\n'+'\n'.join(lines))
(PACK / 'video/03-elevenlabs-presenter.srt').write_text('\n\n'.join(srt)+'\n')
(HERE / 'presenter-timings.json').write_text(json.dumps({
    'source_seconds':19.04, 'output_seconds':22.04,
    'cutaways': [{'start':4,'end':7,'asset':'Habits.png'},
                 {'start':7,'end':10,'asset':'SRHI.png'}],
    'captions':CAPTIONS, 'end_card':[19.04,22.04],
    'audio':'Original AAC speech stream copied without re-encoding; no added music.',
}, indent=2))

# Five requested checkpoints in a single clear contact sheet.
frames=[]
for at in [1,5,8,13,20]:
    frame = OVERLAYS / f'checkpoint-{at:02d}.png'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',at,'-i',OUT,
         '-frames:v','1','-update','1',frame])
    frames.append(frame)
contact = PACK / 'video/03-elevenlabs-presenter-contact-sheet.jpg'
args=['ffmpeg','-hide_banner','-loglevel','error','-y']
for frame in frames:
    args += ['-i',frame]
args += ['-filter_complex',
    '[0:v]scale=288:512[a];[1:v]scale=288:512[b];[2:v]scale=288:512[c];'
    '[3:v]scale=288:512[d];[4:v]scale=288:512[e];[a][b][c][d][e]hstack=inputs=5[out]',
    '-map','[out]','-frames:v','1','-update','1',contact]
run(args)
shutil.copy2(frames[0], PACK / 'video/presenter-preview.png')
shutil.copy2(frames[0], PACK / 'video/03-elevenlabs-presenter-preview.png')
shutil.copy2(frames[4], PACK / 'video/presenter-endcard.png')
print(f'Created {OUT}')
