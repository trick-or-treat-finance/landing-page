"""
Turn the owner's ghost art into the files the app serves.

    UV_CACHE_DIR=$TMPDIR/uv uv run --with pillow --with numpy --with scipy python scripts/ghosts/cutout.py \
        <art-dir> <web-out-dir> [<master-out-dir>]

For every `<name>.png` in <art-dir> (names from SHOTLIST.md) it writes
`<name>-512.webp` and `<name>-256.webp` into <web-out-dir>, and a 1024 px PNG master
into <master-out-dir> when given. Drop new art into <art-dir> and run it again.

Art that already has real transparency is used as it is. Art with a painted ground
(solid black, white, or a fake grey checkerboard) has that ground removed by a flood
fill that starts at the image border only, so a black eye or a dark sunglass inside
the ghost is never reached: it is not connected to the border through ground pixels.

The edge is then pulled in by one pixel and feathered by one, and the colour of every
half-transparent edge pixel is replaced by the colour of the solid art next to it, so
no trace of the old ground (a dark or grey halo) shows on cream or on the dark green.
"""

import sys
from collections import deque
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image, ImageChops, ImageFilter

MASTER = 1024
WEB_SIZES = (512, 256)
MARGIN = 0.04  # breathing room around the art inside the square, as a share of the side
BORDER = 12  # width in px of the strip along the edge the painted ground is learnt from
SPECK = 0.0002  # a piece smaller than this share of the image is a fleck, not art
BAND = 4  # slack in brightness either side of the ground's band


def has_real_alpha(im: Image.Image) -> bool:
    if im.mode != "RGBA":
        return False
    lo, _ = im.getchannel("A").getextrema()
    return lo < 16


def ground_mask(rgb: Image.Image) -> Image.Image:
    """255 where the pixel is painted ground reachable from the border, 0 elsewhere.

    The ground is learnt from a strip along the border: how grey it is (the art has a warm
    tint, a painted ground has none) and the brightness band it spans (one tone for a flat
    ground, two plus everything between them for a checkerboard). A pixel is ground when it
    is as grey as that and inside that band, and is joined to the border through ground.
    """
    a = np.asarray(rgb, dtype=np.int16)
    spread = a.max(2) - a.min(2)
    value = a.mean(2)
    strip = np.zeros(spread.shape, bool)
    strip[:BORDER], strip[-BORDER:], strip[:, :BORDER], strip[:, -BORDER:] = True, True, True, True
    grey = np.percentile(spread[strip], 99)
    lo, hi = np.percentile(value[strip], [0.5, 99.5])
    candidate = (spread <= grey) & (value >= lo - BAND) & (value <= hi + BAND)

    h, w = candidate.shape
    seen = np.zeros_like(candidate)
    queue: deque[tuple[int, int]] = deque()
    for y, x in zip(*np.nonzero(strip & candidate)):
        seen[y, x] = True
        queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return Image.fromarray(np.where(seen, 255, 0).astype(np.uint8), "L")


def cut(im: Image.Image) -> Image.Image:
    """The art on real transparency, edge pulled in 1 px and feathered 1 px."""
    if has_real_alpha(im):
        rgba = im.convert("RGBA")
        alpha = rgba.getchannel("A")
    else:
        rgb = im.convert("RGB")
        alpha = ImageChops.invert(ground_mask(rgb))
        rgba = rgb.convert("RGBA")
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    rgba.putalpha(alpha)
    return defringe(rgba)


def defringe(rgba: Image.Image) -> Image.Image:
    """Give every edge pixel the colour of the solid art beside it, so no old ground bleeds through."""
    arr = np.asarray(rgba.convert("RGBA"), dtype=np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    known = (alpha >= 250).astype(np.float32)
    fill = rgb * known[..., None]
    for _ in range(6):  # grow the solid colour outward, one pixel ring per pass
        acc = np.zeros_like(fill)
        cnt = np.zeros_like(known)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                acc += np.roll(fill, (dy, dx), axis=(0, 1))
                cnt += np.roll(known, (dy, dx), axis=(0, 1))
        grow = (known == 0) & (cnt > 0)
        fill[grow] = acc[grow] / cnt[grow][:, None]
        known = np.where(grow, 1.0, known)
    edge = (alpha > 0) & (alpha < 250) & (known > 0)
    rgb = rgb.copy()
    rgb[edge] = fill[edge]
    out = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def drop_specks(rgba: Image.Image) -> Image.Image:
    """Clear stray flecks of ground the fill could not reach, so they do not widen the frame."""
    arr = np.array(rgba)
    labels, count = ndimage.label(arr[..., 3] > 8)
    if count:
        sizes = ndimage.sum_labels(np.ones_like(labels), labels, index=np.arange(1, count + 1))
        keep = np.isin(labels, 1 + np.nonzero(sizes >= SPECK * labels.size)[0])
        arr[..., 3] = np.where(keep, arr[..., 3], 0)
    return Image.fromarray(arr, "RGBA")


def square(rgba: Image.Image) -> Image.Image:
    rgba = drop_specks(rgba)
    box = rgba.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    art = rgba.crop(box)
    side = int(max(art.size) * (1 + 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return canvas


def main() -> None:
    src = Path(sys.argv[1])
    web = Path(sys.argv[2])
    master = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    web.mkdir(parents=True, exist_ok=True)
    if master:
        master.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob("*.png")):
        name = path.stem
        if name.startswith("contact") or "-" in name and name.rsplit("-", 1)[-1].isdigit():
            continue
        art = square(cut(Image.open(path)))
        big = art.resize((MASTER, MASTER), Image.LANCZOS)
        if master:
            big.save(master / f"{name}.png", optimize=True)
        for size in WEB_SIZES:
            out = web / f"{name}-{size}.webp"
            big.resize((size, size), Image.LANCZOS).save(out, "WEBP", quality=90, method=6, exact=False)
            print(f"{out}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
