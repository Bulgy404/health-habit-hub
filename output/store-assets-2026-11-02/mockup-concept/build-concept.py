"""Layout proof using a genuine, unchanged iPhone capture and approved branding."""
from pathlib import Path
from copy import deepcopy
import xml.etree.ElementTree as ET
import base64

OUT=Path(__file__).parent
ROOT=OUT.parents[2]
source=Path('/Users/felixreinsch/Library/CloudStorage/OneDrive-Personal/01_Arbeit/ResearchGroupDigitalHealth/Projekte/Health Habit Hub/Screenshots/iPhone/01_Originale/Simulator Screenshot - iPhone 17 Pro Max - 2026-08-06 at 13.26.49.png')
brand=ET.parse(ROOT/'output/app-store-header/v4/health-habit-hub-banner-green.svg').getroot()
layers='\n'.join(ET.tostring(deepcopy(node),encoding='unicode') for node in list(brand)[-3:])
screen=base64.b64encode(source.read_bytes()).decode('ascii')
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="2868" viewBox="0 0 1320 2868">
<title>Health Habit Hub — iPhone layout concept</title>
<desc>Concept only. Genuine August 6, 2026 iPhone screen; current build verification pending. No Duo or Android compatibility is represented.</desc>
<defs><clipPath id="screen"><rect x="160" y="562" width="1000" height="2172.7273" rx="76"/></clipPath></defs>
<rect width="1320" height="2868" fill="#2E8C00"/>
<g fill="none" stroke="#68AC4B" stroke-width="3">
<path d="M-95 200L240-80L72 890L-140 1200M1275 365L1435 1050L1220 1770L1420 2570"/>
<circle cx="-95" cy="200" r="195" fill="#409519"/><circle cx="240" cy="-80" r="112"/>
<circle cx="72" cy="890" r="70"/><circle cx="-140" cy="1200" r="106"/>
<circle cx="1275" cy="365" r="142"/><circle cx="1435" cy="1050" r="210"/>
<circle cx="1220" cy="1770" r="66" fill="#409519"/><circle cx="1420" cy="2570" r="205"/>
</g>
<g transform="translate(35 -20) scale(.65)">{layers}</g>
<rect x="147" y="549" width="1026" height="2198.7273" rx="89" fill="#172B16"/>
<image x="160" y="562" width="1000" height="2172.7273" clip-path="url(#screen)" href="data:image/png;base64,{screen}"/>
</svg>'''
(OUT/'iphone-habit-strength-concept-en.svg').write_text(svg)
(OUT/'README.md').write_text('''# iPhone mockup concept — not an upload-approved final

1320 × 2868 layout concept using the approved v4 banner motifs and one existing original iPhone 17 Pro Max simulator capture from August 6, 2026 (13:26:49). The screen content and aspect ratio are preserved; a simple frame and brand surround were added.

The screenshot shows habit detail, activity logging, and SRHI habit strength. Match this UI to the current shipping build and confirm the example data before store use. This concept does not represent iPhone Duo or Android. Those need their own actual app captures. There is no generated or invented UI in this proof.

The SVG embeds its source PNG and outlines its brand lettering, so it is self-contained. The PNG is a full-resolution render with no alpha channel.
''')
