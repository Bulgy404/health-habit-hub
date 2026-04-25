#!/usr/bin/env python3
"""
Generate the Health Habit Hub app icon (1024×1024 PNG).

Design: Clean Bold — green gradient rounded-square background,
white heart mark, three semi-transparent accent dots inside the heart
representing the three H's (Health · Habit · Hub).

Output: app_icon.png (same directory as this script)
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
CX, CY = SIZE // 2, SIZE // 2

# ── Design tokens ───────────────────────────────────────────────────────────────
GREEN_LIGHT = (92, 212, 0)    # #5CD400 — top-left gradient stop
GREEN_MID   = (61, 165, 0)    # midpoint
GREEN_DARK  = (29, 120, 0)    # #1D7800 — bottom-right gradient stop
GREEN_DARK_RGBA = (46, 140, 0, 77)   # #2E8C00 at 30% opacity — dot colour
WHITE = (255, 255, 255, 255)


# ── Helpers ─────────────────────────────────────────────────────────────────────

def create_gradient() -> Image.Image:
    """
    Fast diagonal gradient #5CD400 → #1D7800 via a 2×2 bilinear resize.
    The off-diagonal corners use the midpoint colour so the result is a smooth
    two-stop linear gradient along the main diagonal.
    """
    tiny = Image.new("RGBA", (2, 2))
    tiny.putpixel((0, 0), (*GREEN_LIGHT, 255))   # top-left
    tiny.putpixel((1, 0), (*GREEN_MID,   255))   # top-right
    tiny.putpixel((0, 1), (*GREEN_MID,   255))   # bottom-left
    tiny.putpixel((1, 1), (*GREEN_DARK,  255))   # bottom-right
    return tiny.resize((SIZE, SIZE), Image.BILINEAR)


def rounded_rect_mask(radius: int = 224) -> Image.Image:
    """Return an L-mode mask for a rounded-square of the given corner radius."""
    mask = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(mask)
    try:
        d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
    except AttributeError:
        # Pillow < 8.2 fallback
        r = radius
        d.rectangle([r, 0, SIZE - r, SIZE], fill=255)
        d.rectangle([0, r, SIZE, SIZE - r], fill=255)
        for x, y in [(0, 0), (SIZE - 2*r, 0), (0, SIZE - 2*r), (SIZE - 2*r, SIZE - 2*r)]:
            d.ellipse([x, y, x + 2*r, y + 2*r], fill=255)
    return mask


def add_shine(canvas: Image.Image) -> None:
    """Soft white radial highlight at top-left — gives the icon subtle depth."""
    shine = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(shine)
    r = 540
    d.ellipse([-r // 3, -r // 3, r, r], fill=(255, 255, 255, 42))
    canvas.alpha_composite(shine.filter(ImageFilter.GaussianBlur(90)))


def heart_points(cx: float, cy: float, size: float, steps: int = 600) -> list:
    """
    Parametric heart (tip-down) via the standard polar formula.
    `size` is half the unit scale (the heart fits in ±size px roughly).
    """
    pts = []
    for i in range(steps + 1):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2*t)
              - 2 * math.cos(3*t) - math.cos(4*t))
        pts.append((cx + x * size / 17, cy + y * size / 17))
    return pts


def draw_heart(canvas: Image.Image, cx: float, cy: float, size: float) -> None:
    """Draw a white heart with a soft drop shadow onto canvas."""
    # Shadow layer
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.polygon(heart_points(cx, cy + 14, size), fill=(0, 0, 0, 65))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    # White fill
    d = ImageDraw.Draw(canvas)
    d.polygon(heart_points(cx, cy, size), fill=WHITE)


def draw_hub_dots(canvas: Image.Image, cx: float, cy: float, size: float) -> None:
    """
    Three semi-transparent dark-green dots inside the heart, arranged as a
    downward-pointing triangle — representing Health, Habit, Hub.
    Connected by faint lines to reinforce the 'hub' network metaphor.
    """
    # Dot centres relative to heart centre
    scale = size / 240          # normalise to design size of 240
    spread_x = int(60 * scale)
    spread_y_top = int(-44 * scale)
    spread_y_bot = int(+48 * scale)

    # Heart centre (visual) sits ~3 * size/17 below cy
    hcx = int(cx)
    hcy = int(cy + 3 * size / 17)

    tl = (hcx - spread_x, hcy + spread_y_top)
    tr = (hcx + spread_x, hcy + spread_y_top)
    bc = (hcx,             hcy + spread_y_bot)

    dot_r = int(34 * scale)
    line_w = max(1, int(8 * scale))

    # Connecting lines (very subtle)
    line_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line_layer)
    line_colour = (46, 140, 0, 46)
    for a, b in [(tl, tr), (tl, bc), (tr, bc)]:
        ld.line([a, b], fill=line_colour, width=line_w)
    canvas.alpha_composite(line_layer)

    # Dots
    d = ImageDraw.Draw(canvas)
    for (dx, dy) in [tl, tr, bc]:
        d.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r],
                  fill=GREEN_DARK_RGBA)


# ── Main ────────────────────────────────────────────────────────────────────────

def main() -> None:
    # 1. Gradient background
    canvas = create_gradient()

    # 2. Shine overlay
    add_shine(canvas)

    # 3. Heart mark — centred slightly above mid-canvas for visual balance
    heart_size = 242
    heart_cx   = float(CX)
    heart_cy   = float(CY) - 22.0
    draw_heart(canvas, heart_cx, heart_cy, heart_size)

    # 4. Hub accent dots inside the heart
    draw_hub_dots(canvas, heart_cx, heart_cy, heart_size)

    # 5. Apply rounded-square mask (clips everything outside the icon shape)
    mask = rounded_rect_mask(radius=224)
    canvas.putalpha(mask)

    # 6. Save
    out = Path(__file__).parent / "app_icon.png"
    canvas.save(out, "PNG")
    print(f"Saved {out}  ({SIZE}×{SIZE} px)")


if __name__ == "__main__":
    main()
