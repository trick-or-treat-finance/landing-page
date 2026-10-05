"""
Every ghost on the two grounds it is allowed on, cream and dark green, to check by eye
that no cut is ragged and no edge carries a halo.

    UV_CACHE_DIR=$TMPDIR/uv uv run --with pillow python scripts/ghosts/contact_sheet.py \
        <web-dir> <out.png>
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

# The two page grounds, as RGB, from src/tokens (cream page, dark green brand).
CREAM = (250, 248, 240)
GREEN = (21, 86, 70)
CELL = 300


def main() -> None:
    web = Path(sys.argv[1])
    files = sorted(web.glob("*-512.webp"))
    cols = 5
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (CELL * cols, CELL * rows * 2 + 0), CREAM)
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(files):
        art = Image.open(path).convert("RGBA").resize((CELL - 40, CELL - 40), Image.LANCZOS)
        for band, ground in enumerate((CREAM, GREEN)):
            x = (i % cols) * CELL
            y = ((i // cols) * 2 + band) * CELL
            sheet.paste(ground, (x, y, x + CELL, y + CELL))
            sheet.paste(art, (x + 20, y + 20), art)
            ink = GREEN if band == 0 else CREAM
            draw.text((x + 8, y + 6), path.name.replace("-512.webp", ""), fill=ink)
    sheet.save(sys.argv[2])


if __name__ == "__main__":
    main()
