import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { lineAndColumn, readFiles, type TextFile } from "./lib/files";

// All inference goes through Firebase AI Logic. These names and model hosts must not appear in shipped
// code, tests or scripts, except where `allowIn` names the one file that owns the call.
const RULES: ReadonlyArray<{ name: string; re: RegExp; allowIn?: readonly string[] }> = [
  { name: "Translator", re: /\bTranslator\b/g },
  { name: "LanguageDetector", re: /\bLanguageDetector\b/g },
  { name: "Summarizer", re: /\bSummarizer\b/g },
  { name: "Writer", re: /\bWriter\b/g },
  { name: "Rewriter", re: /\bRewriter\b/g },
  { name: "Proofreader", re: /\bProofreader\b/g },
  { name: "tesseract", re: /tesseract/gi },
  { name: "mediapipe", re: /mediapipe/gi },
  { name: "@tensorflow", re: /@tensorflow/g },
  { name: "onnxruntime", re: /onnxruntime/gi },
  // Speech: recognition is banned (this matches the webkit-prefixed name too), since it reads the user's speech
  // with a model outside Firebase AI Logic. The browser's system voice (speechSynthesis) is allowed as a fallback
  // voice: it speaks text the app already holds and reads nothing from the user.
  { name: "SpeechRecognition", re: /SpeechRecognition/g },
  { name: "LanguageModel.create", re: /\bLanguageModel\s*\.\s*create\b/g },
  { name: ".prompt(", re: /\.prompt\s*\(/g },
  { name: ".promptStreaming(", re: /\.promptStreaming\s*\(/g },
  { name: "countTokens", re: /\bcountTokens\b/g },
  { name: "availability(", re: /\bavailability\s*\(/g, allowIn: ["src/ai/gate.ts", "src/ai/gate.test.ts"] },
  // Direct model hosts: a call to any of these would skip Firebase AI Logic and App Check.
  { name: "api.openai.com", re: /api\.openai\.com/gi },
  { name: "api.anthropic.com", re: /api\.anthropic\.com/gi },
  { name: "generativelanguage.googleapis.com", re: /generativelanguage\.googleapis\.com/gi },
  { name: "aiplatform.googleapis.com", re: /aiplatform\.googleapis\.com/gi },
  { name: "a local Ollama port", re: /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):11434/gi },
  { name: "ollama", re: /\bollama\b/gi },
  {
    name: "getGenerativeModel",
    re: /\bgetGenerativeModel\b/g,
    allowIn: ["src/ai/firebaseModels.ts", "src/ai/firebaseModels.test.ts"],
  },
];

export const GUARD_PATHSPECS = [
  "index.html",
  ":(glob)src/**",
  ":(glob)functions/src/**",
  ":(glob)scripts/**",
  ":(glob)tests/**",
  ":(exclude)scripts/model-guard.ts",
  ":(exclude)scripts/model-guard.test.ts",
];

// Measured on 2026-11-17 at bootstrap: 9 files. A walk below this means the pathspecs broke.
export const GUARD_MIN_FILES = 6;

export function guardFiles(files: TextFile[], minFiles: number): { ok: boolean; messages: string[] } {
  const messages: string[] = [];
  for (const file of files) {
    for (const rule of RULES) {
      if (rule.allowIn?.includes(file.path)) continue;
      for (const m of file.text.matchAll(rule.re)) {
        const { line, column } = lineAndColumn(file.text, m.index);
        messages.push(`${file.path}:${line}:${column} ${rule.name} is not allowed here`);
      }
    }
  }
  if (files.length < minFiles) messages.push(`model guard walked ${files.length} files, expected at least ${minFiles}`);
  return { ok: messages.length === 0, messages };
}

function main(): void {
  const files = readFiles(GUARD_PATHSPECS);
  const result = guardFiles(files, GUARD_MIN_FILES);
  for (const m of result.messages) console.error(m);
  console.log(`model guard: ${files.length} files, ${result.ok ? "clean" : "FAILED"}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
