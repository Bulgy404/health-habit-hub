"""Compose real, current Xcode captures in the approved graph identity."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import base64
import json
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

HERE=Path(__file__).resolve().parent
OUT=HERE.parent
PACKAGE=OUT.parent
ROOT=PACKAGE.parents[1]
fonts=Path('/Users/felixreinsch/Library/CloudStorage/OneDrive-Personal/01_Arbeit/ResearchGroupDigitalHealth/Projekte/Health Habit Hub/Promo_Material/04_Quelldateien/fonts')
font=TTFont(fonts/'Figtree-Semibold.ttf')
glyphs=font.getGlyphSet(); cmap=font.getBestCmap();units=font['head'].unitsPerEm
brand=ET.parse(PACKAGE/'brand-package/health-habit-hub-logo-white.svg').getroot()
brand_paths=''.join(ET.tostring(n,encoding='unicode') for n in brand)
labels={
 'en':['My Habits','Habit strength','Explore habits','Share a habit','New Habit','Get Recommendations'],
 'de':['Gewohnheiten','Gewohnheitsstärke','Gewohnheiten erkunden','Gewohnheit teilen','Neue Gewohnheit','Empfehlungen erhalten'],
}

def text_path(text,x,y,size):
    advance=0;paths=[]
    width=sum(glyphs[cmap[ord(c)]].width for c in text)*size/units
    for char in text:
        glyph=glyphs[cmap[ord(char)]];pen=SVGPathPen(glyphs);glyph.draw(pen)
        if pen.getCommands():paths.append(f'<path transform="translate({advance} 0)" d="{pen.getCommands()}"/>')
        advance+=glyph.width
    return f'<g fill="#FFFFFF" aria-label="{text}" transform="translate({x-width/2} {y}) scale({size/units} {-size/units})">'+''.join(paths)+'</g>'

def render(raw):
    group,lang=raw.parent.parent.name,raw.parent.name
    width,height=Image.open(raw).size
    vh=1320*height/width
    tablet=height/width < 1.7
    wide=width>height
    top,bottom=(390,75) if tablet else (500,90)
    sw=840 if wide else min(1040,(vh-top-bottom)*width/height)
    sh=sw*height/width
    sx,sy=(440,(vh-sh)/2) if wide else ((1320-sw)/2,top)
    label=labels[lang][int(raw.name[:2])-1]
    png=base64.b64encode(raw.read_bytes()).decode()
    logo_width=300 if wide else (540 if tablet else 620)
    logo_height=logo_width*340/980
    logo_y=vh*.23 if wide else (45 if tablet else 85)
    logo_x=50 if wide else (1320-logo_width)/2
    caption_y=vh*.51 if wide else (300 if tablet else 420)
    caption_size=42 if wide else (54 if tablet else 62)
    if wide:
        # Landscape Duo keeps the wide actual UI large, with identity alongside.
        lines=[];line=''
        measure=lambda t:sum(glyphs[cmap[ord(c)]].width for c in t)*caption_size/units
        for word in label.split():
            candidate=(line+' '+word).strip()
            if line and measure(candidate)>340:lines.append(line);line=word
            else:line=candidate
        if line:lines.append(line)
        caption=''
        for i,line in enumerate(lines):
            size=min(caption_size,caption_size*340/max(measure(line),1))
            caption+=text_path(line,200,caption_y+i*56,size)
    else:caption=text_path(label,660,caption_y,caption_size)
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 1320 {vh}">
    <title>Health Habit Hub — {group} {lang} — {label}</title>
    <desc>Actual current app UI from an Xcode simulator, with fictional example data and a branded frame. Capture date November 2, 2026. Device and display provenance is recorded with the original capture. No Android device is represented.</desc>
    <defs><clipPath id="screen"><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{46 if tablet else 70}"/></clipPath></defs>
    <rect width="1320" height="{vh}" fill="#2E8C00"/>
    <g stroke="#68AC4B" stroke-width="3" fill="none">
      <path d="M-55 180L240-80L74 {vh*.44}L-110 {vh*.66}M1260 360L1450 {vh*.36}L1240 {vh*.67}L1450 {vh*.92}"/>
      <circle cx="-55" cy="180" r="190" fill="#409519"/><circle cx="240" cy="-80" r="112"/>
      <circle cx="74" cy="{vh*.44}" r="68"/><circle cx="-110" cy="{vh*.66}" r="106"/>
      <circle cx="1260" cy="360" r="140"/><circle cx="1450" cy="{vh*.36}" r="210"/>
      <circle cx="1240" cy="{vh*.67}" r="65" fill="#409519"/><circle cx="1450" cy="{vh*.92}" r="205"/>
      <path d="M74 {vh*.44}L205 {vh*.31}L168 {vh*.22}M1240 {vh*.67}L1142 {vh*.81}"/>
      <circle cx="205" cy="{vh*.31}" r="28" fill="#409519"/><circle cx="168" cy="{vh*.22}" r="20" fill="#409519"/>
      <circle cx="1142" cy="{vh*.81}" r="25" fill="#409519"/>
    </g>
    <svg x="{logo_x}" y="{logo_y}" width="{logo_width}" height="{logo_height}" viewBox="470 240 980 340">{brand_paths}</svg>
    {caption}
    <rect x="{sx-13}" y="{sy-13}" width="{sw+26}" height="{sh+26}" rx="{59 if tablet else 83}" fill="#172B16"/>
    <image x="{sx}" y="{sy}" width="{sw}" height="{sh}" clip-path="url(#screen)" href="data:image/png;base64,{png}"/>
    </svg>'''
    target=OUT/group/lang
    target.mkdir(parents=True,exist_ok=True)
    file=target/raw.name
    file.with_suffix('.svg').write_text(svg)
    subprocess.run(['rsvg-convert','-o',str(file),str(file.with_suffix('.svg'))],check=True)
    im=Image.open(file)
    assert im.size==(width,height) and im.mode=='RGB'
    return {'path':str(file.relative_to(OUT)),'source':str(raw.relative_to(PACKAGE)),
        'width':width,'height':height,'locale':lang,'caption':label,'format':'opaque RGB PNG'}

def main():
    raws=sorted((PACKAGE/'capture/raw').glob('*/*/*.png'))
    assert raws,'No current captures found'
    with ThreadPoolExecutor(max_workers=4) as pool:files=list(pool.map(render,raws))
    (OUT/'mockup-manifest.json').write_text(json.dumps({'capture_date':'2026-11-02','data':'Fictional examples rendered by current app UI','files':files},indent=2))
    # Review sheet is an inspection aid; store files retain their native size.
    cards=[]
    for file in files:
        p=OUT/file['path'];im=Image.open(p).convert('RGB');im.thumbnail((220,480))
        card=Image.new('RGB',(244,526),'#F4F9EF');card.paste(im,((244-im.width)//2,10))
        ImageDraw.Draw(card).text((8,498),file['path'],fill='#172B16')
        cards.append(card)
    columns=6;rows=(len(cards)+columns-1)//columns
    sheet=Image.new('RGB',(columns*244,rows*526),'#DDE9D3')
    for i,card in enumerate(cards):sheet.paste(card,((i%columns)*244,(i//columns)*526))
    sheet.save(OUT/'mockup-contact-sheet.jpg',quality=92)
    print('Rendered',len(files),'current-UI branded mockups')

if __name__=='__main__':main()
