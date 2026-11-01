#!/usr/bin/env python3
"""Draw the BusyTool app icon: a rounded dark square with a white "B"."""
import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 512
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "build", "icon.png")

BG = (24, 24, 27, 255)  # zinc-900
FG = (250, 250, 250, 255)  # zinc-50

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


def load_font(size: int):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=112, fill=BG)

    font = load_font(320)
    box = draw.textbbox((0, 0), "B", font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]
    draw.text(
        ((SIZE - w) / 2 - box[0], (SIZE - h) / 2 - box[1] - 8),
        "B",
        font=font,
        fill=FG,
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
