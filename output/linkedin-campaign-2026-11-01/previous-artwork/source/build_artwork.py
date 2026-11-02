"""Render new vector campaign artwork, retaining original app pixels."""
from pathlib import Path
from html import escape
import base64
import os
import shutil
import subprocess
from PIL import ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = Path(__file__).resolve().parents[1]
REPO = OUT.parents[1]
SRC = OUT / 'source'
IMAGES = OUT / 'images'
FONTS = OUT / 'fonts'
for name in ['Figtree-Regular.ttf', 'Figtree-Semibold.ttf', 'Figtree-Bold.ttf']:
    shutil.copy2(REPO / 'output/pdf/source/fonts' / name, FONTS / name)
for original, local in [('website/src/assets/device-mockups/Habits.png', 'Habits-original.png'), ('website/public/app_icon.png', 'app-icon-original.png')]:
    if not (SRC/local).exists():
        shutil.copy2(REPO/original, SRC/local)
config = SRC / 'fonts.conf'
config.write_text(f'''<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>{FONTS}</dir><cachedir>/tmp/hhh-campaign-v2-font-cache</cachedir></fontconfig>''')
env = dict(os.environ, FONTCONFIG_FILE=str(config))

INK, WHITE, LEAF, GREEN = '#172126', '#F5F7F2', '#C7F07A', '#2E8C00'
DISPLAY = 'Barlow Condensed ExtraBold'
BODY = 'Figtree-Regular'
BOLD = 'Figtree-Bold'

def data(path):
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()

ICON, APP = data(SRC / 'app-icon-original.png'), data(SRC / 'Habits-original.png')

def txt(value, x, baseline, size, fill=INK, family=BODY, weight=400):
    filename = {
        DISPLAY: 'BarlowCondensed-ExtraBold.ttf',
        BODY: 'Figtree-Regular.ttf',
        BOLD: 'Figtree-Bold.ttf',
    }[family]
    face = TTFont(FONTS / filename)
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    upem = face['head'].unitsPerEm
    scale = size/upem
    pen = SVGPathPen(glyphs)
    cursor = 0
    for character in value:
        glyph_name = cmap.get(ord(character), '.notdef')
        glyphs[glyph_name].draw(TransformPen(pen, (1, 0, 0, 1, cursor, 0)))
        cursor += face['hmtx'].metrics[glyph_name][0]
    return (f'<g aria-label="{escape(value)}"><title>{escape(value)}</title>'
            f'<path d="{pen.getCommands()}" fill="{fill}" transform="translate({x} {baseline}) scale({scale} {-scale})"/></g>')

def display(value, baseline, size, fill=INK, max_width=952, x=64):
    font_path = FONTS / 'BarlowCondensed-ExtraBold.ttf'
    font = ImageFont.truetype(str(font_path), size)
    while font.getlength(value) > max_width:
        size -= 1
        font = ImageFont.truetype(str(font_path), size)
    return txt(value, x, baseline, size, fill, DISPLAY)

def brand(fg=INK):
    return f'<image href="{ICON}" x="64" y="54" width="44" height="44"/>' + txt('Health Habit Hub', 123, 87, 31, fg, BOLD)

def crop(x, y, width, viewbox, label, label_y, label_color=INK):
    a, b, w, h = viewbox
    height = width*h/w
    return (f'<svg x="{x}" y="{y}" width="{width}" height="{height}" viewBox="{a} {b} {w} {h}" overflow="hidden"><image href="{APP}" x="0" y="0" width="1317" height="2716"/></svg>' + txt(label, x, label_y, 22, label_color))

def footer(fg=INK, line='#AEB6AE'):
    return (f'<path d="M64 1210H1016" stroke="{line}" stroke-width="1"/>'
            + txt('Download free for iOS & Android', 64, 1258, 27, fg, BOLD)
            + txt('healthhabithub.de', 64, 1304, 31, fg, BOLD))

def save(name, bg, items, title):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350"><title>{escape(title)}</title><metadata>Code-authored campaign graphic. Original app screenshot inserted without repainting. Source: website/src/assets/device-mockups/Habits.png. Existing app icon. Fonts: Barlow Condensed and Figtree.</metadata><rect width="1080" height="1350" fill="{bg}"/>' + ''.join(items) + '</svg>')
    master = SRC / (name+'.svg')
    master.write_text(svg)
    subprocess.run(['rtk', 'rsvg-convert', str(master), '-o', str(IMAGES/(name+'.png'))], check=True, env=env)

save('01-ordinary-week', INK, [
    brand(WHITE),
    display('TUESDAY', 344, 236, WHITE),
    display('GOT AWAY.', 520, 203, WHITE),
    display('Wednesday is', 678, 137, WHITE),
    display('still here.', 813, 165, LEAF),
    txt('Keep a record of the week you actually had.', 64, 878, 32, WHITE),
    crop(64, 930, 952, (90,540,1140,292), 'Habit calendar · app preview', 914, LEAF),
    footer(WHITE, '#54605F'),
], 'Tuesday got away. Wednesday is still here.')

save('02-give-it-a-when', LEAF, [
    brand(),
    display('GIVE YOUR', 326, 208),
    display('HABIT A', 526, 225),
    display('WHEN.', 745, 274),
    txt('Choose a moment. Then say what you’ll do.', 64, 817, 33),
    crop(64, 880, 952, (107,1770,1115,355), 'A real habit entry · app preview', 864),
    footer(INK, '#7A9D56'),
], 'Give your habit a when.')

save('03-ordinary-tuesday', WHITE, [
    brand(),
    txt('Researchers are interested', 64, 249, 54, INK, BOLD),
    txt('in your', 64, 318, 54, INK, BOLD),
    display('ORDINARY', 535, 223),
    display('TUESDAY.', 766, 258, GREEN),
    txt('The walk after lunch. The book before bed.', 64, 873, 34),
    txt('The routines that fit around everything else.', 64, 921, 34),
    '<rect x="64" y="1000" width="952" height="156" fill="#172126"/>',
    txt('Track your habits. Choose to share them', 94, 1063, 35, WHITE, BOLD),
    txt('for TU Dresden research.', 94, 1113, 35, WHITE),
    footer(),
], 'Researchers are interested in your ordinary Tuesday.')
print('Rendered three 1080 × 1350 PNGs and portable SVG masters.')
