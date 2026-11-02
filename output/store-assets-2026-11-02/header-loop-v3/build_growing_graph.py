"""Grow a living graph around the approved, unchanged logo and wordmark."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
import json
import math
import subprocess
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'output/app-store-header/v4/health-habit-hub-banner-green.svg'
FPS, DURATION = 30, 8
FRAMES = FPS * DURATION
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
source = ET.parse(SOURCE).getroot()
children = list(source)
assert len(children) == 17
assert all(node.tag == f'{{{SVG}}}g' for node in children[-3:])
foreground = ''.join(ET.tostring(n, encoding='unicode') for n in children[-3:])
base_graph = ''.join(ET.tostring(n, encoding='unicode') for n in children[3:-3])

# Original anchors use the approved artwork's exact positions and radii.
anchors = {
    'left': (204, 561, 72),
    'right': (1893, 277, 70),
    'bottom-right': (1642, 675, 93),
}
# id, x, y, radius, parent, appearance time, fade-out start.
# All additions stay outside the brand's protected central area.
nodes = [
    ('l1', 326, 374, 34, 'left', .15, 6.90),
    ('r1', 1670, 300, 36, 'right', .50, 6.85),
    ('rb1', 1488, 631, 30, 'bottom-right', .95, 7.00),
    ('l2', 370, 166, 28, 'l1', 1.10, 6.55),
    ('r2', 1575, 137, 30, 'r1', 1.40, 6.55),
    ('lb1', 380, 690, 30, 'left', 1.65, 6.80),
    ('rb2', 1284, 725, 27, 'rb1', 2.00, 6.40),
    ('l3', 555, 110, 22, 'l2', 2.20, 6.20),
    ('r3', 1375, 92, 22, 'r2', 2.70, 6.15),
    ('lb2', 600, 719, 23, 'lb1', 3.10, 6.25),
]

def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)

def svg_frame(frame):
    t = frame / FPS
    phase = 2 * math.pi * t / DURATION
    positions = dict(anchors)
    visibility = {}
    edges, circles = [], []
    for i, (key, x, y, radius, parent, start, end) in enumerate(nodes):
        # Different phases give the arriving nodes a little independent motion.
        x += 6 * math.sin(phase + i * .9)
        y += 5 * math.sin(phase * 2 + i * .7)
        positions[key] = (x, y, radius)
        fade = 1 - smooth((t - end) / .65)
        draw = smooth((t - start) / .8)
        opacity = smooth((t - start - .38) / .55) * fade
        visibility[key] = opacity
        px, py, pr = positions[parent]
        dx, dy = x - px, y - py
        dist = math.hypot(dx, dy)
        ux, uy = dx / dist, dy / dist
        sx, sy = px + ux * pr, py + uy * pr
        ex, ey = x - ux * radius, y - uy * radius
        length = max(.01, math.hypot(ex - sx, ey - sy))
        parent_opacity = visibility.get(parent, 1)
        edge_opacity = fade * parent_opacity * min(1, draw * 8)
        edges.append(
            f'<path d="M{sx:.3f} {sy:.3f}L{ex:.3f} {ey:.3f}" '
            f'fill="none" stroke="#82BD61" stroke-width="2.2" '
            f'opacity="{edge_opacity:.5f}" stroke-linecap="round" '
            f'stroke-dasharray="{length:.4f} {length:.4f}" '
            f'stroke-dashoffset="{length * (1-draw):.4f}"/>'
        )
        # One quiet traveling signal follows each completed connection.
        travel = (t - start - 1.05) / 1.15
        if 0 < travel < 1:
            signal_alpha = .85 * math.sin(math.pi * travel) ** 2 * fade
            signal_x = sx + (ex - sx) * travel
            signal_y = sy + (ey - sy) * travel
            edges.append(f'<circle cx="{signal_x:.3f}" cy="{signal_y:.3f}" r="3.5" fill="#C0E3A8" opacity="{signal_alpha:.5f}"/>')
        growth = .60 + .40 * smooth((t - start - .38) / .60)
        circles.append(
            f'<g opacity="{opacity:.5f}" transform="translate({x:.3f} {y:.3f}) scale({growth:.5f})">'
            f'<circle r="{radius}" fill="#409519" stroke="#82BD61" stroke-width="2.2"/>'
            f'<circle r="4.5" fill="#AED68F"/>'
            '</g>'
        )

    # Bridges connect the growing left/right branches above and below the brand.
    for a, b, start in [('l3', 'r3', 3.65), ('lb2', 'rb2', 4.25)]:
        ax, ay, ar = positions[a]
        bx, by, br = positions[b]
        dx, dy = bx - ax, by - ay
        dist = math.hypot(dx, dy)
        ux, uy = dx/dist, dy/dist
        sx, sy = ax+ux*ar, ay+uy*ar
        ex, ey = bx-ux*br, by-uy*br
        length = dist-ar-br
        draw = smooth((t-start)/1.15)
        opacity = min(visibility[a], visibility[b]) * .65
        edges.append(
            f'<path d="M{sx:.3f} {sy:.3f}L{ex:.3f} {ey:.3f}" '
            f'fill="none" stroke="#82BD61" stroke-width="1.7" opacity="{opacity:.5f}" '
            f'stroke-dasharray="{length:.4f} {length:.4f}" '
            f'stroke-dashoffset="{length * (1-draw):.4f}"/>'
        )

    # Same wider drift as motion v2; the background color never moves.
    tx, ty = -56 * math.sin(phase), -32 * math.sin(phase)
    dynamic_graph = ''.join(edges + circles)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="1646" viewBox="0 0 1920 823">'
        '<title>Health Habit Hub — growing knowledge graph</title>'
        '<rect width="1920" height="823" fill="#2E8C00"/>'
        f'<g transform="translate({tx:.6f} {ty:.6f})">{base_graph}{dynamic_graph}</g>'
        f'{foreground}</svg>'
    )

def render(frame):
    markup = svg_frame(frame)
    image = subprocess.check_output(['rsvg-convert'], input=markup.encode())
    if frame in (0, 60, 120, 195):
        (HERE/f'preview-{frame:03d}.png').write_bytes(image)
    if frame == 120:
        (HERE/'growing-graph-poster.svg').write_text(markup)
    return image

def main():
    video = HERE/'health-habit-hub-growing-graph-8s-v3.mp4'
    encoder = subprocess.Popen([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'image2pipe', '-framerate', str(FPS), '-vcodec', 'png', '-i', '-',
        '-an', '-frames:v', str(FRAMES), '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(video),
    ], stdin=subprocess.PIPE)
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            for image in pool.map(render, range(FRAMES)):
                encoder.stdin.write(image)
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError('Video export failed')
    except BaseException:
        encoder.kill()
        encoder.wait()
        raise

    # Native dimensions, duration, frame count, codec, full playback decode.
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration',
        '-of', 'json', str(video),
    ], text=True))
    stream = probe['streams'][0]
    assert (stream['width'], stream['height']) == (3840, 1646)
    assert stream['r_frame_rate'] == '30/1' and stream['nb_frames'] == str(FRAMES)
    assert stream['codec_name'] == 'h264' and stream['pix_fmt'] == 'yuv420p'
    assert len(probe['streams']) == 1 and abs(float(probe['format']['duration'])-DURATION) < .001
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video), '-f', 'null', '-'], check=True)

    # The animation is periodic; the virtual endpoint matches the first frame.
    from PIL import Image, ImageChops
    from io import BytesIO
    first = Image.open(HERE/'preview-000.png').convert('RGB')
    last = Image.open(BytesIO(render(FRAMES))).convert('RGB')
    assert ImageChops.difference(first, last).getbbox() is None
    # Brand and its negative space remain identical while the graph grows.
    center = (950, 490, 2890, 1140)
    peak = Image.open(HERE/'preview-120.png').convert('RGB')
    assert ImageChops.difference(first.crop(center), peak.crop(center)).getbbox() is None
    assert ImageChops.difference(first, peak).getbbox() is not None
    probe['checks'] = {'full_decode': True, 'loop_endpoint_pixel_match': True, 'brand_region_pixel_match': True, 'new_nodes': len(nodes), 'new_connections': len(nodes)+2}
    (HERE/'validation.json').write_text(json.dumps(probe, indent=2))
    print(json.dumps(probe, indent=2))

if __name__ == '__main__':
    main()
