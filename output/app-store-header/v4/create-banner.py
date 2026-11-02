"""Logo-first banner, using the existing mark geometry and Figtree lettering."""
from pathlib import Path
import math
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

# Allow the Homebrew Brotli decoder when the optional Python binding is absent.
from fontTools.ttLib import woff2
if not woff2.haveBrotli:
    import ctypes
    from types import SimpleNamespace
    decoder = ctypes.CDLL('/opt/homebrew/lib/libbrotlidec.dylib')
    decoder.BrotliDecoderDecompress.argtypes = [ctypes.c_size_t, ctypes.c_void_p, ctypes.POINTER(ctypes.c_size_t), ctypes.c_void_p]
    decoder.BrotliDecoderDecompress.restype = ctypes.c_int
    def decompress(data):
        buffer = ctypes.create_string_buffer(8 * 1024 * 1024)
        size = ctypes.c_size_t(len(buffer))
        if decoder.BrotliDecoderDecompress(len(data), data, ctypes.byref(size), buffer) != 1:
            raise ValueError('Unable to decode the local Figtree font')
        return buffer.raw[:size.value]
    woff2.brotli = SimpleNamespace(decompress=decompress)
    woff2.haveBrotli = True

OUT = Path(__file__).parent
ROOT = OUT.parents[2]
font = TTFont(ROOT / 'website/node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2')
font = instantiateVariableFont(font, {'wght': 550}, inplace=True)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
units = font['head'].unitsPerEm

def word_width(word, size):
    return sum(glyphs[cmap[ord(c)]].width for c in word) * size / units

def lettering(word, x, baseline, size, fill):
    """Outline the real website typeface so the SVG has no font dependencies."""
    result = [f'<g transform="translate({x:.4f} {baseline:.4f}) scale({size / units:.8f} {-size / units:.8f})" fill="{fill}" aria-label="{word}">']
    advance = 0
    for char in word:
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(pen)
        commands = pen.getCommands()
        if commands:
            result.append(f'<path transform="translate({advance} 0)" d="{commands}"/>')
        advance += glyph.width
    result.append('</g>')
    return '\n'.join(result)

def logo(x, y, width, fill, node_fill, edge_fill):
    """Same parametric heart and three-node placement as generate_icon.py.

    Coordinates are normalized from the actual app-icon generation geometry,
    with no square background, shine, or shadow. The mark itself is preserved.
    """
    pts = []
    # Existing icon uses a 242px size and x scale size/17.
    for i in range(601):
        t = 2 * math.pi * i / 600
        px = 16 * math.sin(t) ** 3
        py = -(13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t))
        pts.append((px, py))
    ymin, ymax = min(p[1] for p in pts), max(p[1] for p in pts)
    scale = width / 32
    # Optical centering uses the existing heart's full bounds.
    offset = -(ymin + ymax) / 2
    d = 'M' + 'L'.join(f'{px:.6f},{py:.6f}' for px,py in pts) + 'Z'
    # Icon hcy = cy + 3*size/17, with +/- 60*size/240 and +/-44/48.
    dot_x = 60 * 17 / 240
    dot_top = 3 - 44 * 17 / 240
    dot_bottom = 3 + 48 * 17 / 240
    dot_radius = 34 * 17 / 240
    edge_width = 8 * 17 / 242
    return f'''<g transform="translate({x} {y}) scale({scale}) translate(0 {offset:.6f})">
      <path fill="{fill}" d="{d}"/>
      <path d="M{-dot_x} {dot_top}H{dot_x}L0 {dot_bottom}Z" fill="none" stroke="{edge_fill}" stroke-width="{edge_width}" stroke-linejoin="round"/>
      <g fill="{node_fill}"><circle cx="{-dot_x}" cy="{dot_top}" r="{dot_radius}"/><circle cx="{dot_x}" cy="{dot_top}" r="{dot_radius}"/><circle cx="0" cy="{dot_bottom}" r="{dot_radius}"/></g>
    </g>'''

def art(theme):
    if theme == 'light':
        bg,mark,ink,dots,inner = '#F4F9EF','#2E8C00','#172B16','#F4F9EF','#A7CE96'
        line,ring,fill,spot = '#BDD3AC','#BDD3AC','#E2EED9','#8EAF77'
    else:
        bg,mark,ink,dots,inner = '#2E8C00','#FFFFFF','#FFFFFF','#2E8C00','#D2E7C9'
        line,ring,fill,spot = '#68AC4B','#68AC4B','#409519','#93C878'
    p = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="1646" viewBox="0 0 1920 823">
    <title>Health Habit Hub — logo banner</title>
    <desc>Original Health Habit Hub heart and three-node mark beside the brand name in Figtree. More defined, cropped graph elements frame the brand at the outer edges.</desc>
    <rect width="1920" height="823" fill="{bg}"/>''']

    # Sparse geometry drawn from the mark's connected-circle motif. All elements
    # sit outside the main lockup rather than behind the mark or lettering.
    nodes = [(-64,160,166),(279,-45,65),(204,561,72),(-43,872,127),
             (1679,-51,116),(1893,277,70),(1642,675,93),(1981,855,155)]
    links = [(0,1),(0,2),(2,3),(1,2),(4,5),(5,6),(6,7),(5,7)]
    p.append(f'<g fill="none" stroke="{line}" stroke-width="2.2">')
    for a,b in links:
        x,y,r=nodes[a];xx,yy,rr=nodes[b]
        dx,dy=xx-x,yy-y;dist=math.hypot(dx,dy);ux,uy=dx/dist,dy/dist
        p.append(f'<path d="M{x+ux*r:.3f} {y+uy*r:.3f}L{xx-ux*rr:.3f} {yy-uy*rr:.3f}"/>')
    p.append('</g>')
    for i,(x,y,r) in enumerate(nodes):
        p.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill if i in (0,6) else bg}" stroke="{ring}" stroke-width="2.2"/>')
    # A small solid node at two junctions brings definition without extra colors.
    p.append(f'<circle cx="204" cy="561" r="7" fill="{spot}"/>')
    p.append(f'<circle cx="1893" cy="277" r="7" fill="{spot}"/>')

    size,mark_width,gap = 112,340,80
    line1,line2 = 'Health','Habit Hub'
    text_width=max(word_width(line1,size),word_width(line2,size))
    total=mark_width+gap+text_width
    start=(1920-total)/2
    tx=start+mark_width+gap
    p.append(logo(start+mark_width/2,411.5,mark_width,mark,dots,inner))
    p.append(lettering(line1,tx,391,size,ink))
    p.append(lettering(line2,tx,506,size,ink))
    p.append('</svg>')
    (OUT/f'health-habit-hub-banner-{theme}.svg').write_text('\n'.join(p))

for theme in ('light','green'):
    art(theme)
