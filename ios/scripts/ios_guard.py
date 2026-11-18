#!/usr/bin/env python3
"""The iPhone client's model guard.

All AI inference goes through Apple's LanguageModelSession (on device) or the same session API on
Firebase AI Logic's geminiLanguageModel (cloud). So under ios/:
- no import of Apple's other machine-learning frameworks (Vision, VisionKit, CoreML,
  NaturalLanguage, Speech, SoundAnalysis, Translation, _Vision_FoundationModels);
- no use of their recognizers (OCRTool, BarcodeReaderTool, DataScannerViewController,
  ImageAnalyzer, PrivateCloudComputeLanguageModel);
- the session API is named only in ios/BYT/AI/ModelSessionFactory.swift, and FirebaseAI.firebaseAI
  is called only in ios/BYT/AI/AIClient.swift.

Files come from git (tracked plus untracked, ignored files left out), so a new file is checked
before it is committed. Fewer files than the floor fails: a walk that sees nothing is not clean.

Usage: python3 -I ios/scripts/ios_guard.py <repo root> [--min-files N]
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

SELF = ["ios/scripts/ios_guard.py", "ios/scripts/test_ios_guard.py"]
CODE_SUFFIXES = {".swift", ".ts", ".mjs", ".js", ".py", ".sh"}
BANNED_IMPORTS = {"Vision", "VisionKit", "CoreML", "NaturalLanguage", "Speech", "SoundAnalysis", "Translation",
                  "_Vision_FoundationModels"}
IMPORT = re.compile(r"^\s*(?:@\w+(?:\([^)]*\))?\s+)*import\s+(?:(?:struct|class|enum|protocol|func|var|let|typealias)\s+)?"
                    r"([A-Za-z_][A-Za-z0-9_]*)\b")
BANNED_SYMBOLS = ["OCRTool", "BarcodeReaderTool", "DataScannerViewController", "ImageAnalyzer",
                  "PrivateCloudComputeLanguageModel"]
SESSION_OWNER = "ios/BYT/AI/ModelSessionFactory.swift"
CLIENT_OWNER = "ios/BYT/AI/AIClient.swift"
OWNED = [(re.compile(r"\bSystemLanguageModel\b"), "SystemLanguageModel", SESSION_OWNER),
         (re.compile(r"\bLanguageModelSession\b"), "LanguageModelSession", SESSION_OWNER),
         (re.compile(r"\bgeminiLanguageModel\b"), "geminiLanguageModel", SESSION_OWNER),
         (re.compile(r"\bfirebaseAI\s*\("), "firebaseAI(", CLIENT_OWNER)]
SYMBOLS = [(re.compile(rf"\b{name}\b"), name) for name in BANNED_SYMBOLS]

# Measured 2026-11-18 after the engine host, read type and router: 29 files under ios/ besides the guard.
DEFAULT_MIN_FILES = 29


def list_files(root: Path) -> list[str]:
    cmd = ["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "ios"]
    cmd += [f":(exclude){p}" for p in SELF]
    out = subprocess.run(cmd, capture_output=True, check=True)
    return sorted({p for p in out.stdout.decode().split("\0") if p})


def check(rel: str, text: str) -> list[str]:
    problems = []
    if Path(rel).suffix not in CODE_SUFFIXES:
        return problems
    for n, line in enumerate(text.splitlines(), start=1):
        m = IMPORT.match(line)
        if m and m.group(1) in BANNED_IMPORTS and rel.endswith(".swift"):
            problems.append(f"{rel}:{n}: import {m.group(1)} is not allowed (AI goes through Firebase AI Logic)")
        for pattern, name in SYMBOLS:
            if pattern.search(line):
                problems.append(f"{rel}:{n}: {name} is not allowed")
        for pattern, name, owner in OWNED:
            if pattern.search(line) and rel != owner:
                problems.append(f"{rel}:{n}: {name} may appear only in {owner}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    parser.add_argument("--min-files", type=int, default=DEFAULT_MIN_FILES)
    args = parser.parse_args()
    root = Path(args.root)
    files = list_files(root)
    problems = []
    for rel in files:
        try:
            data = (root / rel).read_bytes()
        except (FileNotFoundError, IsADirectoryError):
            continue
        if b"\0" in data:
            continue
        problems += check(rel, data.decode("utf-8", errors="replace"))
    if len(files) < args.min_files:
        problems.append(f"ios guard: walked {len(files)} files, fewer than the floor of {args.min_files}")
    for p in problems:
        print(p)
    print(f"ios guard: {'FAIL' if problems else 'ok'}, walked {len(files)} files, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
