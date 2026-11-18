import { describe, expect, it } from "vitest";
import { guardFiles } from "./model-guard";

const file = (path: string, text: string) => ({ path, text });
const clean = [file("src/a.ts", "export const a = 1;"), file("src/b.tsx", "export const b = 2;")];

describe("guardFiles", () => {
  it("passes clean files", () => {
    expect(guardFiles(clean, 2).ok).toBe(true);
  });

  it("fails on a banned call and on zero files", () => {
    for (const bad of [
      "new Translator()",
      "await LanguageDetector.create()",
      "Summarizer.availability()",
      "const w = await Writer.create()",
      "Rewriter.create()",
      "Proofreader.create()",
      "import Tesseract from 'tesseract.js'",
      "import { FaceDetector } from '@mediapipe/tasks-vision'",
      "import * as tf from '@tensorflow/tfjs'",
      "import * as ort from 'onnxruntime-web'",
      "window.speechSynthesis.speak(u)",
      "new SpeechRecognition()",
      "await LanguageModel.create(opts)",
      "await session.prompt(x)",
      "await session.promptStreaming(x)",
      "model.countTokens(req)",
    ]) {
      const r = guardFiles([...clean, file("src/c.ts", bad)], 2);
      expect(r.ok, bad).toBe(false);
      expect(r.messages[0], bad).toContain("src/c.ts:1:");
    }
    const empty = guardFiles([], 2);
    expect(empty.ok).toBe(false);
    expect(empty.messages.join("\n")).toMatch(/walked 0 files/);
  });

  it("allows availability only in gate.ts", () => {
    expect(guardFiles([...clean, file("src/ai/gate.ts", "await LanguageModel.availability(o)")], 2).ok).toBe(true);
    expect(guardFiles([...clean, file("src/ai/gate.test.ts", "LanguageModel.availability(o)")], 2).ok).toBe(true);
    expect(guardFiles([...clean, file("src/ai/itemRead.ts", "await LanguageModel.availability(o)")], 2).ok).toBe(false);
  });

  it("allows getGenerativeModel only in firebaseModels.ts", () => {
    expect(guardFiles([...clean, file("src/ai/firebaseModels.ts", "getGenerativeModel(ai, p)")], 2).ok).toBe(true);
    expect(guardFiles([...clean, file("src/ai/firebaseModels.test.ts", "vi.spyOn(m, 'getGenerativeModel')")], 2).ok).toBe(true);
    expect(guardFiles([...clean, file("src/ai/describe.ts", "getGenerativeModel(ai, p)")], 2).ok).toBe(false);
  });

  it("does not flag ordinary words", () => {
    expect(guardFiles([...clean, file("src/d.ts", "const typewriter = 'Prompt the sender'; // checking availability")], 2).ok).toBe(true);
  });
});
