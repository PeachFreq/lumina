"""Generate Lumina v2 PWA icons — Blueprint Ember contour topography.

A miniature of the hero: ink field, blueprint contour rings warped toward
an ember minimum (lower-right), halftone sun accent. Reads as: a map of
the descent, glowing at the bottom of the well.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

INK = (11, 13, 18, 255)          # --bg
CONTOUR = (46, 58, 84, 255)      # --contour
BLUEPRINT = (91, 123, 180, 255)  # --blueprint
EMBER = (255, 77, 28, 255)       # --ember
EMBER_DEEP = (196, 50, 20, 255)

S = 1024  # master size, downsampled for crispness
MIN_X, MIN_Y = int(S * 0.60), int(S * 0.64)  # the minimum well


def ring_points(radius, seed, n=180):
    pts = []
    for i in range(n + 1):
        a = (i / n) * 2 * math.pi
        wobble = (1 + 0.13 * math.sin(a * 3 + seed * 1.7)
                  + 0.09 * math.sin(a * 5 - seed * 0.9)
                  + 0.06 * math.sin(a * 2 + seed * 2.3))
        rx = radius * wobble * (1 + 0.30 * math.cos(a - 0.6))
        ry = radius * wobble * 0.78
        pts.append((MIN_X + rx * math.cos(a), MIN_Y + ry * math.sin(a)))
    return pts


def build(size):
    img = Image.new("RGBA", (S, S), INK)
    d = ImageDraw.Draw(img)

    # ember glow at the minimum (soft radial, drawn then blurred)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r, alpha in ((int(S * 0.30), 26), (int(S * 0.20), 48), (int(S * 0.12), 84)):
        gd.ellipse([MIN_X - r, MIN_Y - int(r * 0.8), MIN_X + r, MIN_Y + int(r * 0.8)],
                   fill=(255, 77, 28, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.06))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)

    # contour rings — outer field
    w = max(2, S // 300)
    for i in range(2, 15):
        radius = S * 0.055 * i
        color = BLUEPRINT if i % 4 == 0 else CONTOUR
        alpha = 150 if i % 4 == 0 else 200
        d.line(ring_points(radius, i), fill=color[:3] + (alpha,), width=w)

    # ember rings around the minimum
    for i, radius in enumerate((S * 0.030, S * 0.060, S * 0.095, S * 0.135)):
        alpha = 235 - i * 45
        d.line(ring_points(radius, i + 20), fill=EMBER[:3] + (alpha,),
               width=max(2, int(w * 1.2)))

    # the minimum itself: solid ember core
    r0 = S * 0.014
    d.ellipse([MIN_X - r0, MIN_Y - r0, MIN_X + r0, MIN_Y + r0], fill=EMBER)

    # halftone sun, upper-right — small, scanlined
    sun_x, sun_y, sun_r = int(S * 0.78), int(S * 0.20), int(S * 0.10)
    sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    sd.ellipse([sun_x - sun_r, sun_y - sun_r, sun_x + sun_r, sun_y + sun_r], fill=EMBER)
    # scanlines
    step = max(4, S // 128)
    for y in range(sun_y - sun_r, sun_y + sun_r, step):
        sd.line([(sun_x - sun_r, y), (sun_x + sun_r, y)],
                fill=INK[:3] + (150,), width=max(2, step // 2))
    sd.ellipse([sun_x - sun_r, sun_y - sun_r, sun_x + sun_r, sun_y + sun_r],
               outline=EMBER_DEEP, width=w)
    img = Image.alpha_composite(img, sun)

    # descent path: bezier from upper-left ridge into the minimum
    p0 = (S * 0.17, S * 0.18)
    p1 = (S * 0.40, S * 0.26)
    p2 = (S * 0.50, S * 0.46)
    p3 = (MIN_X, MIN_Y)
    d = ImageDraw.Draw(img)
    pts = []
    for i in range(41):
        t = i / 40
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    d.line(pts, fill=EMBER, width=max(3, int(w * 1.6)))
    # start node
    rn = S * 0.020
    d.ellipse([p0[0] - rn, p0[1] - rn, p0[0] + rn, p0[1] + rn],
              fill=INK, outline=EMBER, width=w * 2)

    return img.resize((size, size), Image.LANCZOS).convert("RGB")


if __name__ == "__main__":
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png")):
        build(size).save(f"ui/public/{name}")
        print(f"wrote ui/public/{name}")
