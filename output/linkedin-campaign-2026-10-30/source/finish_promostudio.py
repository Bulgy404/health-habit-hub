"""Finish native PromoStudio footage with brand typography in safe margins.

Creates text-only graphics from local fonts. The actual app imagery remains
in the PromoStudio video and is not repainted or generated.
"""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parents[1]
SRC = OUT / 'source'
VIDEO = OUT / 'video'
FONTS = ROOT / 'output/pdf/source/fonts'
BG = '#123c22'
WHITE = '#f8faf5'
SOFT = '#d3e4cd'
GREEN = '#94dc61'
W, H = 1080, 1350

def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)

def centered(draw, value, y, family, size, color=WHITE):
    f = font(family, size)
    box = draw.textbbox((0, 0), value, font=f)
    draw.text(((W - (box[2] - box[0])) / 2, y - box[1]), value, font=f, fill=color)

def regular_frame(headline, body, name, preview='App preview'):
    im = Image.new('RGBA', (W,H), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((493,45,587,51), radius=3, fill=GREEN)
    centered(d, 'HEALTH HABIT HUB', 77, 'Figtree-Bold.ttf', 27, SOFT)
    for i,line in enumerate(headline):
        centered(d, line, 132+i*73, 'Fraunces-Medium.ttf', 65)
    centered(d, body, 300, 'Figtree-Regular.ttf', 29, SOFT)
    centered(d, preview, 1215, 'Figtree-Regular.ttf', 21, SOFT)
    centered(d, 'healthhabithub.de', 1270, 'Figtree-Semibold.ttf', 31)
    im.save(SRC/name)

regular_frame(['Make your','progress visible.'], 'Track everyday habits. See your patterns.', 'promo-typography-01.png')
regular_frame(['Your habits.','A shared picture.'], 'Choose to share habits for TU Dresden research.', 'promo-typography-02.png')
regular_frame(['Find your next','small step.'], 'AI-generated ideas, informed by research.', 'promo-typography-03.png', 'App preview · AI suggestions, not medical advice')

im = Image.new('RGBA',(W,H),BG)
d = ImageDraw.Draw(im)
d.rounded_rectangle((493,160,587,167), radius=3, fill=GREEN)
centered(d,'HEALTH HABIT HUB',215,'Figtree-Bold.ttf',31,SOFT)
centered(d,'One small habit.',400,'Fraunces-Medium.ttf',80)
centered(d,'Start today.',494,'Fraunces-Medium.ttf',80)
centered(d,'Track your routines. Discover your next step.',630,'Figtree-Regular.ttf',33,SOFT)
d.rounded_rectangle((290,746,790,844),radius=17,fill=WHITE)
centered(d,'Download free',776,'Figtree-Bold.ttf',40,BG)
centered(d,'iOS & Android',895,'Figtree-Semibold.ttf',32,SOFT)
centered(d,'healthhabithub.de',1045,'Figtree-Semibold.ttf',43)
im.save(SRC/'promo-end-card.png')

graph = (
    '[0:v]split=3[a][b][c];'
    '[a]trim=start=0:end=8,setpts=(PTS-STARTPTS)*0.875,fps=30[a1];'
    '[b]trim=start=8:end=16,setpts=(PTS-STARTPTS)*0.625,fps=30[b1];'
    '[c]trim=start=16:end=24,setpts=(PTS-STARTPTS)*0.875,fps=30[c1];'
    '[a1][b1][c1]concat=n=3:v=1:a=0,tpad=stop_mode=clone:stop_duration=5,'
    'scale=788:984,pad=1080:1350:146:280:color=0x123c22[base];'
    "[base][1:v]overlay=0:0:enable='lt(t,7)'[v1];"
    "[v1][2:v]overlay=0:0:enable='gte(t,7)*lt(t,12)'[v2];"
    "[v2][3:v]overlay=0:0:enable='gte(t,12)*lt(t,19)'[v3];"
    "[v3][4:v]overlay=0:0:enable='gte(t,19)',format=yuv420p[v]"
)
cmd = ['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO/'promostudio-native-source.mp4')]
for name in ['promo-typography-01.png','promo-typography-02.png','promo-typography-03.png','promo-end-card.png']:
    cmd += ['-loop','1','-framerate','30','-i',str(SRC/name)]
cmd += ['-filter_complex',graph,'-map','[v]','-t','24','-an','-c:v','libx264','-preset','medium','-crf','18','-movflags','+faststart',str(VIDEO/'02-promostudio-product-silent.mp4')]
subprocess.run(cmd,check=True)
for when,name in [(4,'promo-preview-habits.png'),(9,'promo-preview-research.png'),(15,'promo-preview-ideas.png'),(22,'promo-preview-download.png')]:
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(when),'-i',str(VIDEO/'02-promostudio-product-silent.mp4'),'-frames:v','1',str(VIDEO/name)],check=True)
print(VIDEO/'02-promostudio-product-silent.mp4')
