#!/usr/bin/env python3
"""Blurs the maker and EU representative lines on the published power bank photo (own-01).

The back label in public/eval/items/own-01.jpg prints a company name, a street address and an email address.
This script covers those lines with a smooth fill plus grain, so no letter survives, and leaves the rest of the
photo as it was: each changed rectangle is encoded with the photo's own quantization tables and 4:2:0 sampling,
then put back with jpegtran -drop, so every 16 x 16 block outside the rectangles (the capacity line, the input
and output lines, the marks) keeps its exact coefficients. jpegtran -copy none keeps the file free of Exif, XMP
and comments. The eval runs recorded before this change read the earlier copy.

It runs once: it stops unless the photo is still that earlier copy. Afterwards, write the new SHA-256 into
eval/set/manifest.json, then run scripts/eval-public-manifest.ts and scripts/eval-thumbs.py.

Needs Python 3 with Pillow and NumPy, and jpegtran from libjpeg-turbo. Run from the repository root:
  python3 scripts/eval-privacy-blur.py
"""
import hashlib
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PHOTO = os.path.join("public", "eval", "items", "own-01.jpg")
BEFORE_SHA256 = "50ddec66b05e947838dc0b8950b62a201fc60629905dbccf20a0ebdcc5de1f44"

# Polygons in pixels of the 1200 x 1600 photo.
MASKS = [
    # The maker line, and the line under it that the photo already blurs.
    [(124, 859), (520, 856), (640, 849), (1008, 849), (1008, 838), (1134, 838), (1134, 890), (520, 892),
     (520, 944), (124, 944)],
    # The EU representative's company, street address and email, right of the EC REP mark.
    [(380, 980), (926, 980), (926, 1098), (380, 1098)],
]
# Rectangles (x0, y0, x1, y1) on 16-pixel block edges that hold every mask; only these blocks are re-encoded.
DROPS = [(112, 848, 1008, 960), (1008, 832, 1136, 896), (368, 976, 928, 1104)]
FILL_BLUR = 36  # Gaussian radius in pixels: well past a letter's height on this label
GRAIN = 6.0  # standard deviation of the grain added to the fill, in 8-bit levels
FEATHER = 4  # the mask edge fades in over about this many pixels, inside the polygon only
SEED = 20261125


def sha256(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def alpha_mask(size: tuple[int, int]) -> np.ndarray:
    """1 inside the polygons, 0 outside, with a soft edge that never reaches past a polygon's outline."""
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for poly in MASKS:
        d.polygon(poly, fill=255)
    hard = np.asarray(m, dtype=np.float64) / 255.0
    soft = np.asarray(m.filter(ImageFilter.GaussianBlur(FEATHER)), dtype=np.float64) / 255.0
    return np.where(hard > 0, np.clip(2.0 * soft - 1.0, 0.0, 1.0), 0.0)


def main() -> None:
    if sha256(PHOTO) != BEFORE_SHA256:
        sys.exit(f"{PHOTO} is not the copy this script expects (already blurred?); nothing changed")
    src = Image.open(PHOTO)
    src.load()
    qtables = src.quantization
    rgb = src.convert("RGB")
    w, h = rgb.size
    a = alpha_mask((w, h))

    inside_drop = np.zeros((h, w), dtype=bool)
    for x0, y0, x1, y1 in DROPS:
        assert x0 % 16 == y0 % 16 == x1 % 16 == y1 % 16 == 0, "drop rectangles must sit on 16-pixel block edges"
        inside_drop[y0:y1, x0:x1] = True
    assert not (a[~inside_drop] > 0).any(), "a mask reaches outside the re-encoded rectangles"

    orig = np.asarray(rgb, dtype=np.float64)
    fill = np.asarray(rgb.filter(ImageFilter.GaussianBlur(FILL_BLUR)), dtype=np.float64)
    fill = fill + np.random.default_rng(SEED).normal(0.0, GRAIN, (h, w, 1))
    out = np.clip(orig * (1.0 - a[..., None]) + fill * a[..., None], 0, 255).round().astype(np.uint8)
    blurred = Image.fromarray(out, "RGB")

    with tempfile.TemporaryDirectory() as tmp:
        current = PHOTO
        for i, (x0, y0, x1, y1) in enumerate(DROPS):
            piece = os.path.join(tmp, f"drop{i}.jpg")
            blurred.crop((x0, y0, x1, y1)).save(piece, "JPEG", qtables=qtables, subsampling="4:2:0")
            nxt = os.path.join(tmp, f"step{i}.jpg")
            subprocess.run(["jpegtran", "-copy", "none", "-optimize", "-drop", f"+{x0}+{y0}", piece,
                            "-outfile", nxt, current], check=True)
            current = nxt
        with open(current, "rb") as f:
            data = f.read()
    with open(PHOTO, "wb") as f:
        f.write(data)
    print(f"eval-privacy-blur: {PHOTO} {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
