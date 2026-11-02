"""Reformat the approved vector identity without stretching the artwork."""
from pathlib import Path
from copy import deepcopy
import xml.etree.ElementTree as ET
import subprocess
import importlib.util
from PIL import Image

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
source=ET.parse(ROOT/'output/store-assets-2026-11-02/header-loop-v3/growing-graph-complete.svg').getroot()

for name,w,h in [('apple-universal',5244,2950),('apple-search',3840,2560)]:
    vh=1920*h/w
    root=ET.Element(f'{{{NS}}}svg',{'width':str(w),'height':str(h),'viewBox':f'0 0 1920 {vh:.8f}'})
    ET.SubElement(root,f'{{{NS}}}rect',{'width':'1920','height':str(vh),'fill':'#2E8C00'})
    g=ET.SubElement(root,f'{{{NS}}}g',{'transform':f'translate(0 {(vh-823)/2:.8f})'})
    for child in source:
        if child.tag!=f'{{{NS}}}rect': g.append(deepcopy(child))
    svg=HERE/f'health-habit-hub-{name}.svg'
    ET.ElementTree(root).write(svg,encoding='utf-8',xml_declaration=True)
    subprocess.run(['rsvg-convert','-o',str(svg.with_suffix('.png')),str(svg)],check=True)

# Play applies its own corner mask. Preserve the existing icon's foreground,
# filling only its transparent outside corners with the original generator's
# background so the store receives a full-bleed, opaque, 32-bit square PNG.
spec=importlib.util.spec_from_file_location('existing_icon_generator',ROOT/'mobile/assets/icon/generate_icon.py')
generator=importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
icon=generator.create_gradient()
generator.add_shine(icon)
icon.alpha_composite(Image.open(ROOT/'mobile/assets/icon/app_icon.png').convert('RGBA'))
icon.resize((512,512),Image.Resampling.LANCZOS).save(HERE/'health-habit-hub-play-icon-512.png')

for variant in ('green','light'):
    original=ET.parse(ROOT/f'output/app-store-header/v4/health-habit-hub-banner-{variant}.svg').getroot()
    root=ET.Element(f'{{{NS}}}svg',{'width':'1960','height':'680','viewBox':'470 240 980 340'})
    for child in list(original)[-3:]:root.append(deepcopy(child))
    # Green-field banner supplies white mark/lettering; light supplies green/dark.
    name='white' if variant=='green' else 'green'
    svg=HERE/f'health-habit-hub-logo-{name}.svg'
    ET.ElementTree(root).write(svg,encoding='utf-8',xml_declaration=True)
    subprocess.run(['rsvg-convert','-o',str(svg.with_suffix('.png')),str(svg)],check=True)
