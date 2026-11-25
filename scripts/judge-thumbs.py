#!/usr/bin/env python3
"""Writes the /judge copies of the sample photos, with each brand, maker, logo or seal blurred.

For every photo in src/judge/brandMasks.json, the published photo in public/eval/items/ is opened, each listed
region (a box or a polygon, as fractions of the photo) is pixelated and blurred, and a 240 px and a 480 px wide
WebP go to public/judge/thumbs/ with no Exif or XMP block (an ICC color profile is kept). src/judge/judgeThumbs.json
records each file's size and SHA-256. The published photos, their manifest and public/eval/thumbs/ are not
changed, and a model never reads these copies.

Needs Python 3 with Pillow. Run from the repository root:
  python3 scripts/judge-thumbs.py
"""
import hashlib
import io
import json
import os

from PIL import Image, ImageDraw, ImageFilter

WIDTHS = (240, 480)
QUALITY = 80
MASKS = os.path.join("src", "judge", "brandMasks.json")
OUT_DIR = os.path.join("public", "judge", "thumbs")
INDEX = os.path.join("src", "judge", "judgeThumbs.json")


def region(mask, w, h):
    """The mask as a polygon in pixels."""
    if "box" in mask:
        x0, y0, x1, y1 = mask["box"]
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    else:
        pts = [tuple(p) for p in mask["polygon"]]
    for x, y in pts:
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError(f"mask point {x},{y} is outside the photo")
    return [(round(x * w), round(y * h)) for x, y in pts]


def blurred(im, masks):
    """The photo with each region pixelated, then blurred, so no letter in it can be read."""
    w, h = im.size
    cell = max(8, w // 40)
    pixelated = im.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR).resize((w, h), Image.NEAREST)
    hidden = pixelated.filter(ImageFilter.GaussianBlur(radius=cell))
    out = im.copy()
    for mask in masks:
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).polygon(region(mask, w, h), fill=255)
        out.paste(hidden, (0, 0), m)
    return out


def main() -> None:
    masks = json.load(open(MASKS))["masks"]
    os.makedirs(OUT_DIR, exist_ok=True)
    index = {}
    for item_id, item_masks in masks.items():
        photo = os.path.join("public", "eval", "items", f"{item_id}.jpg")
        with Image.open(photo) as im:
            im.load()
            icc = im.info.get("icc_profile")
            hidden = blurred(im.convert("RGB"), item_masks)
            sizes = []
            for width in WIDTHS:
                height = round(hidden.height * width / hidden.width)
                small = hidden.resize((width, height), Image.LANCZOS)
                buf = io.BytesIO()
                options = {"quality": QUALITY, "method": 6}
                if icc:
                    options["icc_profile"] = icc
                small.save(buf, "WEBP", **options)
                data = buf.getvalue()
                name = f"{item_id}-{width}.webp"
                with open(os.path.join(OUT_DIR, name), "wb") as f:
                    f.write(data)
                sizes.append({"src": f"/judge/thumbs/{name}", "width": width, "height": height,
                              "sha256": hashlib.sha256(data).hexdigest()})
            index[item_id] = {"photoWidth": im.width, "photoHeight": im.height, "masks": len(item_masks), "sizes": sizes}
    with open(INDEX, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print(f"wrote {len(index)} photos to {OUT_DIR} and {INDEX}")


if __name__ == "__main__":
    main()
