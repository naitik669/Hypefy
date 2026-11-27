// The cutout studio's model runner (src/lib/cutout/engine.ts starts it).
//
// Plain JavaScript in public/ on purpose: it loads the ONNX runtime as a
// static ES module from /cutout/ort/ (copied there from node_modules by
// scripts/copy-cutout-runtime.mjs), so the bundler never has to understand
// the runtime's WebAssembly loading. All pre- and post-processing lives in
// src/lib/cutout/mask.ts, where it is tested; this file only runs the model.
//
// Threads: the runtime uses several only when the page is cross-origin
// isolated (/stickers/new sets COOP/COEP for exactly this). Measured in the
// spike: ~3-4 s a photo on 4 threads against ~11 s on one.
import * as ort from "./ort/ort.wasm.min.mjs";

let session = null;

ort.env.wasm.wasmPaths = new URL("./ort/", import.meta.url).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      session = await ort.InferenceSession.create(new Uint8Array(msg.model), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      self.postMessage({ type: "ready", threads: ort.env.wasm.numThreads });
      return;
    }
    if (msg.type === "run") {
      if (!session) throw new Error("model not loaded");
      const t0 = performance.now();
      const input = new ort.Tensor("float32", msg.input, [1, 3, msg.size, msg.size]);
      const out = await session.run({ [session.inputNames[0]]: input });
      const pred = out[session.outputNames[0]].data;
      const copy = new Float32Array(pred);
      self.postMessage({ type: "result", id: msg.id, pred: copy, ms: performance.now() - t0 }, [copy.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: String((err && err.message) || err) });
  }
};
