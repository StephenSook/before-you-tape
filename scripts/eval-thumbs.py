#!/usr/bin/env python3
"""Writes small WebP copies of the published eval photos, for pages that show them small (/judge).

Each published photo in public/eval/items/ (eval/set/manifest.json) gets a 240 px and a 480 px wide WebP in
public/eval/thumbs/, with no Exif or XMP block (an ICC color profile is kept so colors stay the same), and
src/judge/thumbs.json records each file's size and SHA-256. The published photos and the manifest are not
changed; a model never reads these copies.

Needs Python 3 with Pillow. Run from the repository root:
  python3 scripts/eval-thumbs.py
"""
import hashlib
import io
import json
import os

from PIL import Image

WIDTHS = (240, 480)
QUALITY = 80
MANIFEST = os.path.join("eval", "set", "manifest.json")
OUT_DIR = os.path.join("public", "eval", "thumbs")
INDEX = os.path.join("src", "judge", "thumbs.json")


def main() -> None:
    manifest = json.load(open(MANIFEST))
    os.makedirs(OUT_DIR, exist_ok=True)
    index = {}
    for item in manifest["items"]:
        photo = os.path.join("public", item["photo"].lstrip("/"))
        with Image.open(photo) as im:
            im.load()
            icc = im.info.get("icc_profile")
            sizes = []
            for width in WIDTHS:
                height = round(im.height * width / im.width)
                small = im.convert("RGB").resize((width, height), Image.LANCZOS)
                buf = io.BytesIO()
                options = {"quality": QUALITY, "method": 6}
                if icc:
                    options["icc_profile"] = icc
                small.save(buf, "WEBP", **options)
                data = buf.getvalue()
                name = f"{item['itemId']}-{width}.webp"
                with open(os.path.join(OUT_DIR, name), "wb") as f:
                    f.write(data)
                sizes.append({"src": f"/eval/thumbs/{name}", "width": width, "height": height,
                              "sha256": hashlib.sha256(data).hexdigest()})
            index[item["itemId"]] = {"photoWidth": im.width, "photoHeight": im.height, "sizes": sizes}
    with open(INDEX, "w") as f:
        f.write(json.dumps(index, indent=2) + "\n")
    print(f"eval-thumbs: {len(index)} photos, {len(index) * len(WIDTHS)} files")


if __name__ == "__main__":
    main()
