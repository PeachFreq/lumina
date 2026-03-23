"""
Generate LUMINA PWA icons.
Run: python generate_icons.py
Creates icon-192.png and icon-512.png in ui/public/
"""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print("pip install Pillow")
    exit(1)


def generate_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (14, 12, 20))  # #0E0C14
    draw = ImageDraw.Draw(img)

    # Create glow layer
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)

    center = size // 2
    max_r = int(size * 0.32)

    # Build radial glow by drawing concentric circles with decreasing opacity
    for r in range(max_r, 0, -1):
        ratio = r / max_r
        alpha = int(255 * (1 - ratio) ** 1.8 * 0.85)
        # Fuchsia: #E5006A → rgb(229, 0, 106)
        glow_draw.ellipse(
            [center - r, center - r, center + r, center + r],
            fill=(229, 0, 106, alpha),
        )

    # Blur the glow
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.06))

    # Composite
    img.paste(glow, (0, 0), glow)

    return img


if __name__ == "__main__":
    out = Path(__file__).parent / "ui" / "public"
    out.mkdir(parents=True, exist_ok=True)

    for s in (192, 512):
        icon = generate_icon(s)
        path = out / f"icon-{s}.png"
        icon.save(path, "PNG")
        print(f"Created {path}")
