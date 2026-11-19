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
      "new SpeechRecognition()",
      "new webkitSpeechRecognition()",
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

  it("allows the system voice, which speaks text the app already holds and reads nothing from the user", () => {
    const r = guardFiles([...clean, file("src/c.ts", "window.speechSynthesis.speak(new SpeechSynthesisUtterance(t))")], 2);
    expect(r.ok, r.messages.join("\n")).toBe(true);
  });

  it("fails on a direct model host anywhere in source, tests or scripts", () => {
    for (const bad of [
      "fetch('https://api.openai.com/v1/chat/completions')",
      "const base = 'http://localhost:11434/api/generate'",
      "const base = 'http://127.0.0.1:11434'",
      "import ollama from 'ollama'",
      "await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`)",
      "const u = 'https://us-central1-aiplatform.googleapis.com/v1/projects/p'",
      "fetch('https://api.anthropic.com/v1/messages')",
    ]) {
      const r = guardFiles([...clean, file("tests/e2e/x.spec.ts", bad)], 2);
      expect(r.ok, bad).toBe(false);
      expect(r.messages[0], bad).toMatch(/^tests\/e2e\/x\.spec\.ts:1:\d+ .* is not allowed here$/);
    }
  });

  it("does not flag the Firebase AI Logic host or a word that only contains a host name", () => {
    const r = guardFiles([...clean, file("scripts/c.ts", "const svc = 'firebasevertexai.googleapis.com'; // aiplatform docs say\nconst llamas = 1;")], 2);
    expect(r.messages).toEqual([]);
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
