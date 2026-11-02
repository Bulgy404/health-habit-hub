"""Render original vector artwork using the app's existing graph color tokens."""
from pathlib import Path
import math
from html import escape

OUT = Path(__file__).parent
BG = '#FAFBF8'
parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="1646" viewBox="0 0 1920 823">
<title>Health Habit Hub — habits in context</title>
<desc>An example walking habit connected to its behavior, time, location, prior behavior, social context, internal state, and reasoning. Colors follow the app's Explore graph.</desc>
<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r=".65" fill="#D9DED5"/></pattern></defs>
<rect width="1920" height="823" fill="{BG}"/>
<rect width="1920" height="823" fill="url(#grid)"/>
<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">''']

def text(x, y, content, size=16, color='#111827', weight=400, anchor='middle', mono=False, spacing=0):
    family = 'Menlo, monospace' if mono else 'Helvetica Neue, Helvetica, Arial, sans-serif'
    parts.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}" letter-spacing="{spacing}">{escape(content)}</text>')

# A quiet extension of the graph beyond the focal cluster, not random decoration.
peripheral = [(180,245,7),(285,328,11),(350,207,6),(403,350,5),(227,538,6),(365,605,10),(487,676,5),(1535,213,7),(1640,300,11),(1720,244,5),(1583,543,6),(1700,605,8),(1494,670,5),(96,430,4),(1810,434,5)]
links = [(0,1),(0,2),(1,2),(1,3),(1,4),(4,5),(5,6),(7,8),(8,9),(8,10),(10,11),(10,12),(1,13),(8,14),(3,5)]
parts.append('<g fill="none" stroke="#DBE2D8" stroke-width="1">')
for a,b in links:
    x,y,_=peripheral[a];xx,yy,_=peripheral[b]
    parts.append(f'<path d="M{x} {y}L{xx} {yy}"/>')
parts.append('</g>')
for x,y,r in peripheral:
    parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BG}" stroke="#CDD7C8" stroke-width="1.2"/>')

# Small graph signature with actual app colors.
parts.append('<g stroke="#2E8C00" stroke-width="1.5"><path d="M751 104L765 95L779 109L751 104L763 119L779 109" fill="none"/><g fill="#2E8C00" stroke="none"><circle cx="751" cy="104" r="4"/><circle cx="765" cy="95" r="4"/><circle cx="779" cy="109" r="4"/><circle cx="763" cy="119" r="4"/></g></g>')
text(797,115,'Health Habit Hub',27,weight=500,anchor='start',spacing=-.6)

# Dimension IDs and colors match bubble_graph_data.dart. Example values are
# illustrative, never counts or claims about real participant data.
nodes = [
    (710,245,69,'#3B82F6','#EFF5FF','TIME',['Morning']),
    (1204,250,86,'#22C55E','#EFFAF2','BEHAVIOR',['Walking']),
    (1370,474,77,'#F97316','#FFF5ED','LOCATION',['In the park']),
    (1140,652,69,'#06B6D4','#EEFAFC','SOCIAL',['With a friend']),
    (820,652,76,'#A855F7','#F7F0FC','PRIOR BEHAVIOR',['After','breakfast']),
    (554,444,80,'#64748B','#F1F4F7','REASONING',['To clear','my mind']),
    (989,204,47,'#EC4899','#FDF0F7','STATE',['Calm']),
]
cx,cy,cr=960,431,111

# Thin directed relations with precise endpoints, and understated schema labels.
for i,(x,y,r,color,fill,tag,lines) in enumerate(nodes):
    dx,dy=x-cx,y-cy;dist=math.hypot(dx,dy);ux,uy=dx/dist,dy/dist
    sx,sy=cx+ux*(cr+7),cy+uy*(cr+7)
    ex,ey=x-ux*(r+7),y-uy*(r+7)
    parts.append(f'<path d="M{sx:.2f} {sy:.2f}L{ex:.2f} {ey:.2f}" fill="none" stroke="{color}" stroke-opacity=".48" stroke-width="1.35"/>')
    px,py=-uy,ux
    parts.append(f'<path d="M{ex-ux*6+px*3:.2f} {ey-uy*6+py*3:.2f}L{ex:.2f} {ey:.2f}L{ex-ux*6-px*3:.2f} {ey-uy*6-py*3:.2f}" fill="none" stroke="{color}" stroke-width="1.35"/>')
    if i in (0,1,2,5):
        mx,my=(sx+ex)/2,(sy+ey)/2
        angle=math.degrees(math.atan2(dy,dx))
        if angle>90:angle-=180
        if angle<-90:angle+=180
        parts.append(f'<g transform="translate({mx:.2f} {my:.2f}) rotate({angle:.2f})"><rect x="-46" y="-8" width="92" height="16" rx="4" fill="{BG}"/>')
        text(0,3,'HAS_CONTEXT',8,'#7A8676',mono=True,spacing=.5)
        parts.append('</g>')

for x,y,r,color,fill,tag,lines in nodes:
    parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{color}" stroke-width="1.5"/>')
    # A solid color registration dot echoes the Explore graph's dimension markers.
    parts.append(f'<circle cx="{x}" cy="{y-r}" r="3.5" fill="{color}"/>')
    small = r<50
    text(x,y-(10 if small else 16),tag,8 if small else 9.2,'#62705F',mono=True,spacing=1.1)
    for j,line in enumerate(lines):
        text(x,y+10+j*24,line,18 if small else 21,weight=500,spacing=-.4)

# The habit node is the only strong solid fill: brand primaryDark.
parts.append(f'<circle cx="{cx}" cy="{cy}" r="{cr+6}" fill="{BG}" stroke="#D7E9CE" stroke-width="1"/>')
parts.append(f'<circle cx="{cx}" cy="{cy}" r="{cr}" fill="#2E8C00"/>')
text(cx,cy-34,'HABIT',10,'#D9EFCF',mono=True,spacing=2)
text(cx,cy+6,'A daily walk',30,'#FFFFFF',500,spacing=-.9)
parts.append(f'<path d="M{cx-30} {cy+37}l4 4 8-9" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>')
text(cx+6,cy+41,'BUILD',8.5,'#E8F6E1',mono=True,spacing=1.4)

# Quiet editorial caption; never fake live metrics or mock application controls.
text(960,778,'EVERY HABIT HAS A CONTEXT',9.5,'#7C8776',mono=True,spacing=2.8)
parts.append('</g></svg>')
(OUT/'health-habit-hub-header-v2.svg').write_text('\n'.join(parts))
