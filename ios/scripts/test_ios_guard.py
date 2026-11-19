"""Tests for ios_guard.py: the iPhone client calls no AI outside Firebase AI Logic and Apple's
LanguageModelSession, and names the model APIs only in their two owner files."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GUARD = Path(__file__).resolve().parent / "ios_guard.py"


def run(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-I", str(GUARD), str(root), "--min-files", "1"],
                          capture_output=True, text=True)


class GuardTests(unittest.TestCase):
    def repo(self, files: dict) -> Path:
        root = Path(tempfile.mkdtemp())
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        for rel, text in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        return root

    def test_flags_import_vision(self):
        r = run(self.repo({"ios/BYT/X.swift": "import SwiftUI\nimport Vision\n"}))
        self.assertEqual(r.returncode, 1)
        self.assertIn("ios/BYT/X.swift:2", r.stdout)

    def test_flags_each_banned_name(self):
        banned = ["import Vision", "import VisionKit", "import CoreML", "import NaturalLanguage", "import Speech",
                  "import SoundAnalysis", "import Translation", "import _Vision_FoundationModels",
                  "let t = OCRTool()", "let b = BarcodeReaderTool()", "DataScannerViewController()", "ImageAnalyzer()",
                  "PrivateCloudComputeLanguageModel()"]
        for line in banned:
            with self.subTest(line=line):
                r = run(self.repo({"ios/BYT/Views/X.swift": line + "\n"}))
                self.assertEqual(r.returncode, 1, line)

    def test_allows_the_two_owner_files(self):
        ok = self.repo({"ios/BYT/AI/ModelSessionFactory.swift": "let m = SystemLanguageModel.default\nLanguageModelSession()\n",
                        "ios/BYT/AI/AIClient.swift": "FirebaseAI.firebaseAI(backend: .googleAI())\n"})
        self.assertEqual(run(ok).returncode, 0, run(ok).stdout)
        for line in ["let m = SystemLanguageModel.default", "LanguageModelSession()", "ai.geminiLanguageModel(name: n)",
                     "FirebaseAI.firebaseAI(backend: .googleAI())"]:
            with self.subTest(line=line):
                self.assertEqual(run(self.repo({"ios/BYT/Views/X.swift": line + "\n"})).returncode, 1)

    def test_imports_that_only_contain_a_banned_word_pass(self):
        r = run(self.repo({"ios/BYT/X.swift": "import SpeechKitStub\nlet visionary = 1\n// Speech in a comment\n"}))
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_fails_on_zero_files(self):
        r = subprocess.run([sys.executable, "-I", str(GUARD), str(self.repo({}))], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("walked 0 files", r.stdout)

    def test_sees_untracked_files(self):
        root = self.repo({"ios/BYT/New.swift": "import CoreML\n"})       # never added to git
        self.assertEqual(run(root).returncode, 1)


if __name__ == "__main__":
    unittest.main()
