"""Draws the app icons (run once: python3 scripts/make_icons.py)."""
from PIL import Image, ImageDraw

BG = (47, 125, 109)
WHITE = (255, 255, 255)
CORAL = (240, 128, 110)


def draw(size, padding):
    s = 4 * size  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    inner = s * (1 - 2 * padding)
    ox = oy = s * padding
    u = inner / 100
    # apple body: two overlapping circles
    d.ellipse([ox + 14 * u, oy + 26 * u, ox + 58 * u, oy + 90 * u], fill=WHITE)
    d.ellipse([ox + 42 * u, oy + 26 * u, ox + 86 * u, oy + 90 * u], fill=WHITE)
    d.rectangle([ox + 36 * u, oy + 34 * u, ox + 64 * u, oy + 84 * u], fill=WHITE)
    # notch at top
    d.ellipse([ox + 42 * u, oy + 20 * u, ox + 58 * u, oy + 34 * u], fill=BG)
    # stem and leaf
    d.rounded_rectangle([ox + 47.5 * u, oy + 10 * u, ox + 52.5 * u, oy + 30 * u], radius=2.5 * u, fill=WHITE)
    d.ellipse([ox + 54 * u, oy + 8 * u, ox + 76 * u, oy + 20 * u], fill=WHITE)
    # heart in the middle
    hx, hy, r = ox + 50 * u, oy + 56 * u, 8 * u
    d.ellipse([hx - 2 * r, hy - r, hx, hy + r], fill=CORAL)
    d.ellipse([hx, hy - r, hx + 2 * r, hy + r], fill=CORAL)
    d.polygon([(hx - 1.93 * r, hy + 0.35 * r), (hx + 1.93 * r, hy + 0.35 * r), (hx, hy + 2.4 * r)], fill=CORAL)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    draw(192, 0.14).save("public/icons/icon-192.png")
    draw(512, 0.14).save("public/icons/icon-512.png")
    draw(512, 0.22).save("public/icons/icon-maskable-512.png")
    draw(180, 0.14).save("public/icons/apple-touch-icon.png")
    draw(64, 0.1).save("public/icons/favicon.png")
