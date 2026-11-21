#!/usr/bin/env python3
"""Measures each App Store field in ios/app-store/listing.md and review-notes.md against Apple's limit.

Exits 1 when a field is missing or too long. Usage: python3 -I ios/app-store/check_lengths.py
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
LIMITS = {"Name": 30, "Subtitle": 30, "Promotional text": 170, "Description": 4000, "Keywords": 100,
          "What's New (first version)": 4000, "Review notes": 4000}


def section(text: str, heading: str) -> str | None:
    """The text under a '## heading', up to the next '## ', with a trailing note paragraph removed."""
    m = re.search(rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else None


def table_value(text: str, field: str) -> str | None:
    m = re.search(rf"^\| {re.escape(field)} \| (.*?) \|$", text, re.M)
    return m.group(1).strip() if m else None


def main() -> int:
    listing = (HERE / "listing.md").read_text(encoding="utf-8")
    notes = (HERE / "review-notes.md").read_text(encoding="utf-8")
    fields = {
        "Name": table_value(listing, "Name"),
        "Subtitle": table_value(listing, "Subtitle"),
        "Promotional text": section(listing, "Promotional text"),
        "Description": section(listing, "Description"),
        # The keyword line is the first line of its section; the note under it is not sent.
        "Keywords": (section(listing, "Keywords") or "").split("\n")[0] or None,
        "What's New (first version)": section(listing, "What's New (first version)"),
        "Review notes": section(notes, "Notes for the reviewer"),
    }
    bad = 0
    for name, value in fields.items():
        if value is None:
            print(f"MISSING {name}")
            bad += 1
            continue
        n = len(value)
        ok = n <= LIMITS[name]
        bad += 0 if ok else 1
        print(f"{'ok ' if ok else 'TOO LONG'} {name}: {n} / {LIMITS[name]}")
    for text, where in [(listing, "listing.md"), (notes, "review-notes.md")]:
        found = [c for c in "–—‘’“”" if c in text]
        if found:
            print(f"{where}: dashes or curly quotes {found}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
