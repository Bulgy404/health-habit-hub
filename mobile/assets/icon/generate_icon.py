#!/usr/bin/env python3
"""
Generate the Health Habit Hub app icon (1024x1024 PNG).

Design: charcoal (#454446) circle background with a graph-network of 9 nodes
(5 heart-shaped + 4 circle-with-inner-highlight) in HabShare green (#45b700),
connected by white anti-aliased edges with glow halos, masked to a clean circle.

Output: app_icon.png (in the same directory as this script)
"""

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# ── Constants ──────────────────────────────────────────────────────────────────
SIZE = 1024
BG_COLOR = (0x45, 0x44, 0x46, 255)   # charcoal
GREEN = (0x45, 0xB7, 0x00, 255)      # HabShare green
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

CX, CY = SIZE // 2, SIZE // 2        # canvas centre
RING_R = 340                          # radius of node ring
NODE_R = 54                           # node circle radius
HEART_SCALE = 0.85                    # heart size relative to node circle
INNER_R = 22                          # inner highlight circle radius

EDGE_W = 10                           # edge stroke width
GLOW_R = 22                           # glow blur radius


def heart_path(cx: float, cy: float, size: float):
    """Return a list of (x, y) points approximating a heart centred at (cx, cy)."""
    pts = []
    steps = 200
    for i in range(steps + 1):
        t = 2 * math.pi * i / steps
        # Parametric heart: x = 16 sin³(t), y = -(13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t))
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * size / 17, cy + y * size / 17))
    return pts


def draw_glow(layer: Image.Image, x: float, y: float, r: float, color):
    """Draw a soft glow halo around position (x, y) with radius r."""
    glow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_R))
    layer.alpha_composite(glow)


def draw_edge_with_glow(canvas: Image.Image, x1, y1, x2, y2):
    """Draw a white edge with glow between two node centres."""
    # glow layer
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.line([(x1, y1), (x2, y2)], fill=(255, 255, 255, 80), width=EDGE_W + GLOW_R)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_R // 2))
    canvas.alpha_composite(glow)
    # solid edge
    d2 = ImageDraw.Draw(canvas)
    d2.line([(x1, y1), (x2, y2)], fill=WHITE, width=EDGE_W)


def node_positions():
    """Return (x, y) for 9 nodes: index 0 is centre, 1-8 are on a ring."""
    positions = [(CX, CY)]  # centre node
    for i in range(8):
        angle = 2 * math.pi * i / 8 - math.pi / 2  # start from top
        x = CX + RING_R * math.cos(angle)
        y = CY + RING_R * math.sin(angle)
        positions.append((x, y))
    return positions


# Edges: (src_idx, dst_idx)  — connecting centre to all ring nodes + some ring edges
EDGES = [
    (0, 1), (0, 2), (0, 3), (0, 4), (0, 5), (0, 6), (0, 7), (0, 8),  # centre ↔ ring
    (1, 2), (3, 4), (5, 6), (7, 8),  # adjacent ring pairs
]

# Which node indices use hearts (0-based); others use circle-with-inner-highlight
HEART_NODES = {1, 3, 5, 7, 0}   # centre + 4 alternating ring nodes  → 5 hearts
CIRCLE_NODES = {2, 4, 6, 8}     # remaining 4 ring nodes              → 4 circles


def main():
    canvas = Image.new("RGBA", (SIZE, SIZE), TRANSPARENT)

    # ── Background circle ──────────────────────────────────────────────────────
    bg = Image.new("RGBA", (SIZE, SIZE), TRANSPARENT)
    bg_draw = ImageDraw.Draw(bg)
    pad = 10
    bg_draw.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=BG_COLOR)
    canvas.alpha_composite(bg)

    positions = node_positions()

    # ── Edges ──────────────────────────────────────────────────────────────────
    for src, dst in EDGES:
        x1, y1 = positions[src]
        x2, y2 = positions[dst]
        draw_edge_with_glow(canvas, x1, y1, x2, y2)

    # ── Nodes ──────────────────────────────────────────────────────────────────
    d = ImageDraw.Draw(canvas)
    for idx, (nx, ny) in enumerate(positions):
        r = NODE_R * (1.3 if idx == 0 else 1.0)  # centre node slightly larger

        # glow halo
        draw_glow(canvas, nx, ny, r + 20, (*GREEN[:3], 120))

        if idx in HEART_NODES:
            # filled green heart
            pts = heart_path(nx, ny, r * HEART_SCALE * 2)
            d.polygon(pts, fill=GREEN)
        else:
            # green circle with inner white-highlight ring
            d.ellipse([nx - r, ny - r, nx + r, ny + r], fill=GREEN)
            inner = INNER_R * (1.3 if idx == 0 else 1.0)
            d.ellipse(
                [nx - inner, ny - inner, nx + inner, ny + inner],
                fill=(255, 255, 255, 200),
            )

    # ── Circular mask ──────────────────────────────────────────────────────────
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=255)
    canvas.putalpha(mask)

    # ── Save ───────────────────────────────────────────────────────────────────
    out_path = Path(__file__).parent / "app_icon.png"
    canvas.save(out_path, "PNG")
    print(f"Saved {out_path} ({SIZE}×{SIZE})")


if __name__ == "__main__":
    main()
