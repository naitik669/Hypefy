// Copies the ONNX runtime files the cutout studio loads at /cutout/ort/ out
// of node_modules, so they are served by the app itself (the studio page is
// cross-origin isolated, and a CDN copy would need CORP headers we do not
// control) and always match the installed onnxruntime-web version.
// Runs before `next build` and `next dev`; public/cutout/ort/ is gitignored.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CUTOUT_RUNTIME_FILES = [
  "ort.wasm.min.mjs",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "cutout", "ort");

export function copyCutoutRuntime() {
  mkdirSync(to, { recursive: true });
  for (const f of CUTOUT_RUNTIME_FILES) {
    const src = join(from, f);
    if (!existsSync(src)) throw new Error(`cutout runtime: ${src} is missing — is onnxruntime-web installed?`);
    copyFileSync(src, join(to, f));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) copyCutoutRuntime();
