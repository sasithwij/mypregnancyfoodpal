"""Draws the app icons (run once: python3 scripts/make_icons.py)."""
from PIL import Image, ImageDraw

BG = (180, 72, 107)  # berry, matches --accent in styles.css
WHITE = (255, 255, 255)


def draw(size, padding):
    s = 4 * size  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    inner = s * (1 - 2 * padding)
    ox = oy = s * padding
    u = inner / 100
    # a soft heart, same shape as the logo in the app
    hx, hy, r = ox + 50 * u, oy + 40 * u, 21 * u
    d.ellipse([hx - 2 * r, hy - r, hx, hy + r], fill=WHITE)
    d.ellipse([hx, hy - r, hx + 2 * r, hy + r], fill=WHITE)
    d.polygon([(hx - 1.93 * r, hy + 0.35 * r), (hx + 1.93 * r, hy + 0.35 * r), (hx, hy + 2.6 * r)], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    draw(192, 0.14).save("public/icons/icon-192.png")
    draw(512, 0.14).save("public/icons/icon-512.png")
    draw(512, 0.22).save("public/icons/icon-maskable-512.png")
    draw(180, 0.14).save("public/icons/apple-touch-icon.png")
    draw(64, 0.1).save("public/icons/favicon.png")
