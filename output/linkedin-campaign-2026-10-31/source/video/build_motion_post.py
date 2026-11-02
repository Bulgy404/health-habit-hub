"""Create the revised 18-second poster motion post.

All title art is authored as SVG paths from the supplied fonts. Real app
footage comes from the existing PromoStudio export; no interface is invented.
"""
from pathlib import Path
from html import escape
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

OUT = Path(__file__).resolve().parents[2]
ROOT = OUT.parents[1]
SRC = Path(__file__).resolve().parent
VIDEO = OUT / 'video'
VIDEO.mkdir(parents=True, exist_ok=True)
INK = '#172126'
ACID = '#C7F07A'
WHITE = '#F5F7F2'
W, H = 1080, 1350

fonts = {}
for key, path in {
    'heavy': OUT / 'fonts/BarlowCondensed-ExtraBold.ttf',
    'semi': OUT / 'fonts/BarlowCondensed-SemiBold.ttf',
    'body': ROOT / 'output/pdf/source/fonts/Figtree-Regular.ttf',
    'bodybold': ROOT / 'output/pdf/source/fonts/Figtree-Bold.ttf',
}.items():
    f = TTFont(path)
    fonts[key] = (f, f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm)

def text(value, x, baseline, size, face='heavy', fill=INK, maxwidth=None):
    f, glyphs, cmap, units = fonts[face]
    names = [cmap.get(ord(ch), '.notdef') for ch in value]
    advance = sum(f['hmtx'][name][0] for name in names)
    scale = size / units
    if maxwidth is not None and advance * scale > maxwidth:
        scale = maxwidth / advance
    cursor = 0
    paths = []
    for name in names:
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        p = pen.getCommands()
        if p:
            paths.append(f'<path transform="translate({cursor},0)" d="{p}"/>')
        cursor += f['hmtx'][name][0]
    return (f'<g role="img" aria-label="{escape(value, quote=True)}" fill="{fill}" '
            f'transform="translate({x},{baseline}) scale({scale}, {-scale})">'
            + ''.join(paths) + '</g>')

def rect(x, y, w, h, fill):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>'

def brand(fill=INK):
    return text('HEALTH HABIT HUB', 64, 94, 31, 'bodybold', fill)

def save(name, parts, background=None):
    body = '' if background is None else rect(0,0,W,H,background)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
           f'viewBox="0 0 {W} {H}"><title>Health Habit Hub</title>{body}'
           + ''.join(parts) + '</svg>')
    path = SRC / f'{name}.svg'
    path.write_text(svg)
    subprocess.run(['rsvg-convert', '-o', str(SRC/f'{name}.png'), str(path)], check=True)

# The opening lands in three quick, deliberate beats. The complete message
# remains visible from 0.6 seconds until the 3-second cut.
for stage in [1,2,3]:
    parts = [brand(), rect(64,142,952,4,INK),
             text('GIVE YOUR',64,408,210,maxwidth=952)]
    if stage >= 2:
        parts += [text('HABIT',64,701,323,maxwidth=952)]
    if stage >= 3:
        parts += [text('A WHEN.',64,979,275,maxwidth=952),
                  rect(64,1031,952,17,INK),
                  text('A small plan. A real starting point.',64,1220,34,'body',INK,maxwidth=952)]
    save(f'01-hook-{stage}',parts,ACID)

# The exact if-then example visible in the real app, stated as an example.
save('02-example',[
    brand(), rect(64,142,952,4,INK),
    text('WHEN I GET',64,405,159,maxwidth=952),
    text('INTO BED,',64,562,175,maxwidth=952),
    rect(64,681,952,340,ACID),
    text('I will read a book',101,799,62,'bodybold',INK,maxwidth=870),
    text('for ten minutes.',101,895,62,'bodybold',INK,maxwidth=870),
    text('Example shown in the app.',64,1230,30,'body',INK,maxwidth=952)
],WHITE)

# Transparent foreground for the genuine app footage, with a clear margin.
save('03-app-foreground',[
    brand(WHITE), rect(64,142,952,4,ACID),
    text('A PLAN YOU CAN',64,260,107,fill=WHITE,maxwidth=952),
    text('KEEP TRACK OF.',64,364,111,fill=WHITE,maxwidth=952),
    text('Actual app preview',64,1254,30,'body',WHITE,maxwidth=952)
])

save('04-research',[
    brand(), rect(64,142,952,4,INK),
    text('YOUR ORDINARY',64,376,135,maxwidth=952),
    rect(64,425,952,228,ACID),
    text('TUESDAY',82,624,231,maxwidth=910),
    text('COULD HELP',64,831,164,maxwidth=952),
    text('SCIENCE.',64,1021,195,maxwidth=952),
    text('You choose whether to share habits',64,1172,32,'body',INK,maxwidth=952),
    text('for TU Dresden research.',64,1220,32,'body',INK,maxwidth=952),
],WHITE)

save('05-download',[
    rect(64,142,952,4,INK),
    text('HEALTH',64,444,274,maxwidth=952),
    text('HABIT HUB',64,689,244,maxwidth=952),
    text('Download free for iOS & Android',64,858,40,'bodybold',INK,maxwidth=952),
    rect(64,938,952,126,INK),
    text('healthhabithub.de',98,1021,56,'bodybold',WHITE,maxwidth=884),
    text('Choose whether to share habits',64,1190,31,'body',INK,maxwidth=952),
    text('for TU Dresden research.',64,1237,31,'body',INK,maxwidth=952),
],ACID)

# Five seconds of authentic native phone movement, fitted under the headline.
# Only the uniform studio backdrop is keyed out; all app content is preserved.
app_graph = (
    '[0:v]trim=start=0:end=8,setpts=(PTS-STARTPTS)*0.625,fps=30,'
    'scale=700:876,format=rgba,colorkey=0x123c22:0.075:0.015[phone];'
    'color=c=0x172126:s=1080x1350:r=30:d=5[bg];'
    '[bg][phone]overlay=190:345:shortest=1[v0];'
    '[v0][1:v]overlay=0:0:shortest=1,format=yuv420p[v]'
)
source_video = ROOT / 'output/linkedin-campaign-2026-10-30/video/promostudio-native-source.mp4'
subprocess.run([
    'ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source_video),
    '-loop','1','-framerate','30','-i',str(SRC/'03-app-foreground.png'),
    '-filter_complex',app_graph,'-map','[v]','-t','5','-an',
    '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
    str(SRC/'03-app-shot.mp4')
],check=True)

shots = [
    ('01-hook-1.png',.3), ('01-hook-2.png',.3), ('01-hook-3.png',2.4),
    ('02-example.png',3), ('03-app-shot.mp4',5),
    ('04-research.png',3), ('05-download.png',4),
]
segments = []
for i,(name,seconds) in enumerate(shots):
    path = SRC / name
    if name.endswith('.mp4'):
        segments.append(path)
        continue
    segment = SRC / f'segment-{i:02d}.mp4'
    subprocess.run([
        'ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30',
        '-i',str(path),'-t',str(seconds),'-an','-c:v','libx264','-preset','medium',
        '-crf','18','-pix_fmt','yuv420p',str(segment)
    ],check=True)
    segments.append(segment)
concat_file = SRC / 'segments.txt'
concat_file.write_text(''.join(f"file '{path}'\n" for path in segments))
final = VIDEO / '01-give-it-a-when.mp4'
subprocess.run([
    'ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0',
    '-i',str(concat_file),'-c','copy','-movflags','+faststart',str(final)
],check=True)

previews = [(1.6,'preview-01-hook.png'),(4.4,'preview-02-plan.png'),
            (8.7,'preview-03-app.png'),(16,'preview-04-download.png')]
for when,name in previews:
    subprocess.run([
        'ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(when),'-i',str(final),
        '-frames:v','1',str(VIDEO/name)
    ],check=True)
subprocess.run([
    'ffmpeg','-hide_banner','-loglevel','error','-y',
    *sum((['-i',str(VIDEO/name)] for _,name in previews),[]),
    '-filter_complex','[0:v]scale=432:540[a];[1:v]scale=432:540[b];'
    '[2:v]scale=432:540[c];[3:v]scale=432:540[d];'
    '[a][b][c][d]xstack=inputs=4:layout=0_0|432_0|0_540|432_540[v]',
    '-map','[v]','-frames:v','1',str(VIDEO/'contact-sheet.png')
],check=True)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(final),'-f','null','-'],check=True)
print(final)
