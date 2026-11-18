#!/usr/bin/env python3
"""Builds the published eval photos and eval/set/manifest.json from the original photos (plan Task 29).

The originals stay private; only the published copies and their provenance enter the repository.
For each item the script checks the original's SHA-256 against its source record, applies the camera's
orientation, shrinks the longest side to MAX_SIDE pixels (never enlarges), and saves a new JPEG with no
Exif, XMP, IPTC or comment block (an ICC color profile is kept so colors stay the same). It records both
hashes and says in `changes` exactly what was done, because attribution licenses ask for that.

Needs Python 3 with Pillow. Run from the repository root:
  python3 scripts/eval-set-photos.py <sources.json>
where sources.json holds {setId, destinations, items: [{itemId, original, sha256Original, alt, printed,
provenance: {sourcePage, author, license, licenseUrl, fileUrl?}}]} and `original` is a local path.
"""
import hashlib
import io
import json
import os
import sys

from PIL import Image, ImageOps

MAX_SIDE = 1600
JPEG_QUALITY = 88
ITEMS_DIR = os.path.join("public", "eval", "items")
MANIFEST = os.path.join("eval", "set", "manifest.json")
METADATA_KEYS = ("exif", "xmp", "XML:com.adobe.xmp", "photoshop", "comment")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def publish(original: bytes) -> tuple[bytes, int, int, str]:
    im = Image.open(io.BytesIO(original))
    had_metadata = any(k in im.info for k in METADATA_KEYS)
    orientation = im.getexif().get(0x0112, 1)
    icc = im.info.get("icc_profile")
    im = ImageOps.exif_transpose(im).convert("RGB")
    changes = []
    if had_metadata:
        changes.append("metadata removed")
    if orientation not in (1, None):
        changes.append("turned upright")
    if max(im.size) > MAX_SIDE:
        scale = MAX_SIDE / max(im.size)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        changes.append(f"resized to {MAX_SIDE} px on the long side")
    changes.append("re-encoded")
    # A fresh image carries no info from the original, so nothing but the pixels and the ICC profile is saved.
    clean = Image.new("RGB", im.size)
    clean.paste(im)
    out = io.BytesIO()
    kwargs = {"quality": JPEG_QUALITY, "optimize": True}
    if icc:
        kwargs["icc_profile"] = icc
    clean.save(out, "JPEG", **kwargs)
    return out.getvalue(), clean.width, clean.height, ", ".join(changes)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python3 scripts/eval-set-photos.py <sources.json>")
    src = json.load(open(sys.argv[1]))
    os.makedirs(ITEMS_DIR, exist_ok=True)
    items = []
    for s in src["items"]:
        original = open(s["original"], "rb").read()
        if sha256(original) != s["sha256Original"]:
            sys.exit(f"{s['itemId']}: the original does not match its recorded SHA-256")
        data, width, height, changes = publish(original)
        with open(os.path.join(ITEMS_DIR, f"{s['itemId']}.jpg"), "wb") as f:
            f.write(data)
        prov = {k: s["provenance"][k] for k in ("sourcePage", "author", "license", "licenseUrl")}
        prov["changes"] = changes
        if s["provenance"].get("fileUrl"):
            prov["fileUrl"] = s["provenance"]["fileUrl"]
        items.append({
            "itemId": s["itemId"], "photo": f"/eval/items/{s['itemId']}.jpg", "photoSha256": sha256(data),
            "photoSha256Original": s["sha256Original"], "widthPx": width, "heightPx": height, "alt": s["alt"],
            "printed": s.get("printed"), "provenance": prov,
        })
        print(f"{s['itemId']}: {width}x{height}, {len(data)} bytes, {changes}")
    manifest = {
        "setId": src["setId"], "destinations": src["destinations"],
        "publishing": {"maxSide": MAX_SIDE, "jpegQuality": JPEG_QUALITY},
        "protocolSha256": "", "labelsSha256": "", "items": items,
    }
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {len(items)} photos and {MANIFEST}")


if __name__ == "__main__":
    main()
