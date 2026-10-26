#!/usr/bin/env python3
"""Draws the extension icons (16, 32, 48 and 128 px) with Pillow.

A white padlock on the same blue-to-violet gradient as the popup's logo.
The 128 px store icon keeps its artwork inside 96x96 with 16 px of
transparent padding on each side, as the Chrome Web Store asks; the
toolbar sizes use more of the canvas, with heavier strokes, so the lock
stays legible when tiny.

    python3 scripts/make-icons.py      # writes icons/icon{16,32,48,128}.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SCALE = 8  # draw 8x larger, then downsample for smooth edges

START = (0x5B, 0x8C, 0xFF)  # the popup's --accent blue
END = (0x8B, 0x5C, 0xF6)  # the popup logo's violet
KEYHOLE = (0x5F, 0x6C, 0xF0)  # mid-gradient colour, so it reads as a cut-out

# size -> (transparent padding in px, stroke weight, draw keyhole?)
SIZES = {
    16: (0, 1.25, False),
    32: (1, 1.15, False),
    48: (3, 1.0, True),
    128: (16, 1.0, True),
}


def gradient(size):
    """Diagonal gradient from START (top left) to END (bottom right)."""
    ramp = Image.linear_gradient("L").resize((size, size))  # 0 at top -> 255 at bottom
    diagonal = Image.blend(ramp, ramp.rotate(90), 0.5)  # mix in a left-to-right ramp
    a = Image.new("RGBA", (size, size), START + (255,))
    b = Image.new("RGBA", (size, size), END + (255,))
    return Image.composite(b, a, diagonal)


def draw_icon(size, padding, weight, keyhole):
    s = size * SCALE
    pad = padding * SCALE
    art = s - 2 * pad  # side of the artwork square

    # Rounded-square background filled with the gradient.
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [pad, pad, pad + art - 1, pad + art - 1], radius=round(0.225 * art), fill=255
    )
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(gradient(s), (0, 0), mask)

    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    cx = pad + art / 2

    # Lock body.
    bw, bh = 0.54 * art, 0.40 * art
    bx0, by0 = cx - bw / 2, pad + 0.46 * art
    d.rounded_rectangle([bx0, by0, bx0 + bw, by0 + bh], radius=round(0.09 * art), fill=white)

    # Shackle: a thick arch whose legs run down into the body.
    thick = 0.085 * art * weight
    outer = 0.37 * art  # outer width of the arch
    r = outer / 2
    top = pad + 0.15 * art
    d.arc([cx - r, top, cx + r, top + 2 * r], start=180, end=360, fill=white, width=round(thick))
    leg_top, leg_bottom = top + r, by0 + thick
    d.rectangle([cx - r, leg_top, cx - r + thick, leg_bottom], fill=white)
    d.rectangle([cx + r - thick, leg_top, cx + r, leg_bottom], fill=white)

    if keyhole:
        kr = 0.055 * art
        ky = by0 + 0.40 * bh
        d.ellipse([cx - kr, ky - kr, cx + kr, ky + kr], fill=KEYHOLE + (255,))
        slot = 0.035 * art
        d.rectangle([cx - slot / 2, ky, cx + slot / 2, by0 + 0.74 * bh], fill=KEYHOLE + (255,))

    return img.resize((size, size), Image.BOX)


def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    for size, (padding, weight, keyhole) in SIZES.items():
        path = out / f"icon{size}.png"
        draw_icon(size, padding, weight, keyhole).save(path, optimize=True)
        print("wrote", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
