"""Experience-led Play graphic concept, with no phone frame or OS branding.

The shared Flutter widget is cropped from the new Xcode capture. Final Android
store use still requires comparing it against the same widget on Android.
"""
from pathlib import Path
import base64
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

HERE=Path(__file__).resolve().parent
PACKAGE=HERE.parent
font=TTFont('/Users/felixreinsch/Library/CloudStorage/OneDrive-Personal/01_Arbeit/ResearchGroupDigitalHealth/Projekte/Health Habit Hub/Promo_Material/04_Quelldateien/fonts/Figtree-Semibold.ttf')
glyphs=font.getGlyphSet();cmap=font.getBestCmap();units=font['head'].unitsPerEm

def lettering(text,x,y,size):
    parts=[];advance=0
    for char in text:
        glyph=glyphs[cmap[ord(char)]];pen=SVGPathPen(glyphs);glyph.draw(pen)
        if pen.getCommands():parts.append(f'<path transform="translate({advance} 0)" d="{pen.getCommands()}"/>')
        advance+=glyph.width
    return f'<g fill="#FFFFFF" aria-label="{text}" transform="translate({x} {y}) scale({size/units} {-size/units})">'+''.join(parts)+'</g>'

for lang,title,sub in [('en','My Habits','Habit strength'),('de','Gewohnheiten','Gewohnheitsstärke')]:
    raw=PACKAGE/f'capture/raw/iphone-medium/{lang}/01-my-habits.png'
    image=base64.b64encode(raw.read_bytes()).decode()
    title_size=42 if lang=='en' else 37
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <title>Health Habit Hub — Play feature graphic concept — {lang}</title>
    <desc>Draft. Shared app widget from a current Xcode capture with fictional example data. Native status bar and device imagery excluded. Confirm Android parity before submission.</desc>
    <defs><clipPath id="card"><rect x="440" y="20" width="520" height="461.44" rx="16"/></clipPath></defs>
    <rect width="1024" height="500" fill="#2E8C00"/>
    <g fill="none" stroke="#68AC4B" stroke-width="1.6"><path d="M-30 165L180-45L297 95M-30 165L100 418L336 485M100 418L330 325"/>
    <circle cx="-30" cy="165" r="100" fill="#409519"/><circle cx="180" cy="-45" r="68"/>
    <circle cx="100" cy="418" r="36"/><circle cx="336" cy="485" r="23" fill="#409519"/><circle cx="330" cy="325" r="18" fill="#409519"/><circle cx="297" cy="95" r="21"/></g>
    {lettering('Health Habit Hub',64,90,20)}
    {lettering(title,64,234,title_size)}
    {lettering(sub,64,278,23)}
    <g clip-path="url(#card)"><svg x="440" y="20" width="520" height="461.44" viewBox="48 355 1110 985"><image width="1206" height="2622" href="data:image/png;base64,{image}"/></svg></g>
    </svg>'''
    file=HERE/f'play-feature-graphic-concept-{lang}.svg'
    file.write_text(svg)
    subprocess.run(['rsvg-convert','-o',str(file.with_suffix('.png')),str(file)],check=True)
print('Rendered English and German Play feature concepts')
