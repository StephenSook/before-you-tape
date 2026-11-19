"""Builds android/app/src/androidTest/assets/label-corpus.json: the label texts the device tests feed
both JavaScript runtimes. Every labelText in the shared vectors, plus our own cases (never copied
from a USPS page) crossed with what the engine must read the same way: no-break spaces, each
Unicode hyphen it normalizes, full-width letters, accented words next to rule words, a line break
inside "ALCOHOL FREE", and empty text. Run from the repo root: python3 android/tools/label_corpus.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "android/app/src/androidTest/assets/label-corpus.json"

def vector_labels():
    out = []
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == "labelText" and isinstance(v, str):
                    out.append(v)
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    for name in ("box.json", "box-guards.json", "destinations.json"):
        walk(json.loads((ROOT / "tests/vectors" / name).read_text(encoding="utf-8")))
    return out

BASES = [
    "SHEA BUTTER LOTION 8 FL OZ", "LITHIUM ION BATTERY 3.7V 2600mAh 9.62Wh", "CONTAINS ALCOHOL",
    "FLAMMABLE KEEP AWAY FROM HEAT", "AEROSOL CONTENTS UNDER PRESSURE", "ALCOHOL FREE TONER",
    "NAIL POLISH REMOVER ACETONE", "EAU DE PARFUM 50 ml", "ISOPROPYL ALCOHOL 70%",
    "HAND SANITIZER 62% ETHANOL", "CERAMIC MUG", "DARK CHOCOLATE 70% CACAO", "CBD OIL 30 ml",
    "BUTANE LIGHTER REFILL", "POWER BANK 10000mAh 37Wh", "CR2032 COIN CELL", "COUGH LOZENGES",
    "IBUPROFEN 200 mg TABLETS", "SAFETY MATCHES", "SPARKLERS", "VANILLA EXTRACT 35% ALC",
    "HAIR SPRAY EXTRA HOLD", "MOUTHWASH ALCOHOL FREE", "SPRAY PAINT FLAMMABLE", "SUNSCREEN SPF 50",
    "BEARD OIL 1 FL OZ", "GOLD BULLION BAR", "PET TREATS CHICKEN", "FLOWER SEEDS MIX", "OLIVE OIL 500 ml",
]
# Code points, not literals: U+2010 hyphen, U+2011 no-break hyphen, U+2012 figure dash, U+2013 and
# U+2014 (the two long dashes), U+2212 minus, U+FE63 small hyphen-minus, U+FF0D full-width hyphen-minus.
HYPHENS = [chr(c) for c in (0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212, 0xFE63, 0xFF0D)]
UNITS = ("mAh", "Wh", "ml", "mg", "FL", "%", "V")

def fullwidth(s):
    return "".join(chr(ord(c) + 0xFEE0) if "!" <= c <= "~" else ("　" if c == " " else c) for c in s)

def nbsp_units(s):
    words = s.split(" ")
    return "".join(w if i == 0 else (" " if words[i].startswith(UNITS) or words[i - 1][-1:].isdigit() else " ") + w for i, w in enumerate(words))

def variants(i, base):
    words = base.split(" ")
    first, rest = words[0], " ".join(words[1:]) or "X"
    return [
        base,
        base.lower(),
        nbsp_units(base),
        first + HYPHENS[i % len(HYPHENS)] + rest,
        fullwidth(first) + " " + rest,
        "Crème " + base + " café",
        first + "\n" + rest,
        "  " + base.replace(" ", "\t", 1) + " ..",
    ]

SPECIAL = [
    "", " ", "\n", "ALCOHOL\nFREE", "ALCOHOL\r\nFREE", "0 % alcohol", "0% alcohol", "0.0% ABV",
    "alcohol-free", "alcohol" + chr(0x2011) + "free", "ALCOHOL " + chr(0x2014) + " FREE", "non-alcoholic", "cetyl alcohol",
    "stearyl alcohol lotion", "benzyl alcohol", "contains alcohol", "ALCOHOL", "álcohol",
    "ＡＬＣＯＨＯＬ", "LITHIUM METAL", "Li-ion 3.7 V", "100 Wh", "99.9Wh",
    "160 Wh", "2 g lithium", "éthanol", "ÉTHANOL 70 %", "ethanol" + chr(0x2212) + "free",
]

def build():
    seen, cases = set(), []
    for t in vector_labels() + [v for i, b in enumerate(BASES) for v in variants(i, b)] + SPECIAL:
        if t not in seen:
            seen.add(t)
            cases.append(t)
    return cases

if __name__ == "__main__":
    cases = build()
    OUT.write_text(json.dumps({"cases": cases}, ensure_ascii=True, indent=1) + "\n", encoding="ascii")
    print(f"label-corpus.json: {len(cases)} distinct cases")
