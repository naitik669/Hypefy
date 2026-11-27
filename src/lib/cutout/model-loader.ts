/**
 * Getting the cutout model onto the device, once.
 *
 * The model is 46 MB, which is far too much to fetch every time someone
 * opens the studio, and the browser's ordinary HTTP cache may evict a file
 * that size whenever it likes. So the bytes go into Cache Storage under a
 * versioned name, and every later visit reads them from there without
 * touching the network. The first visit shows progress while it downloads.
 *
 * Fetch and Cache Storage are passed in, so a test drives this directly.
 */

/**
 * Bump the file name when the model changes: the old cache entry is then
 * simply never asked for again, and `pruneOldModels` clears it.
 */
export const MODEL_URL = "/cutout/isnet-general-use-q8.onnx";
export const MODEL_CACHE = "hypefy-cutout-v1";
/** The size of the file at MODEL_URL, for progress before a length arrives. */
export const MODEL_BYTES = 46_360_867;

export type Progress = { loaded: number; total: number };

export type LoaderDeps = {
  fetch: (url: string) => Promise<Response>;
  /** Absent where Cache Storage is unavailable (private windows on some browsers). */
  caches?: Pick<CacheStorage, "open" | "keys" | "delete">;
};

/** Read a response's body to the end, reporting how far it has got. */
async function readWithProgress(res: Response, total: number, onProgress?: (p: Progress) => void): Promise<ArrayBuffer> {
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress?.({ loaded: buf.byteLength, total: buf.byteLength });
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total: Math.max(total, loaded) });
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

/**
 * The model's bytes: from Cache Storage when they are already on this
 * device, otherwise downloaded (with progress) and then stored there.
 *
 * A download that fails throws: the studio has nothing to cut with, and it
 * says so rather than spinning. A cache that fails is not fatal — the bytes
 * were fetched, so they are used, and the next visit downloads again.
 */
export async function loadModelBytes(deps: LoaderDeps, onProgress?: (p: Progress) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = deps.caches ? await deps.caches.open(MODEL_CACHE) : null;
  } catch {
    cache = null;
  }
  if (cache) {
    try {
      const hit = await cache.match(MODEL_URL);
      if (hit) {
        const buf = await hit.arrayBuffer();
        // A truncated entry (a tab closed mid-write) is not a model.
        if (buf.byteLength === MODEL_BYTES) {
          onProgress?.({ loaded: buf.byteLength, total: buf.byteLength });
          return buf;
        }
        await cache.delete(MODEL_URL);
      }
    } catch {
      // Unreadable cache: fall through and download.
    }
  }
  const res = await deps.fetch(MODEL_URL);
  if (!res.ok) throw new Error(`cutout model download failed: ${res.status}`);
  const length = Number(res.headers.get("content-length")) || MODEL_BYTES;
  const buf = await readWithProgress(res, length, onProgress);
  if (buf.byteLength !== MODEL_BYTES) throw new Error(`cutout model is ${buf.byteLength} bytes, expected ${MODEL_BYTES}`);
  if (cache) {
    try {
      await cache.put(MODEL_URL, new Response(buf.slice(0), { headers: { "content-type": "application/octet-stream" } }));
    } catch {
      // Out of quota, most likely. The cut still goes ahead.
    }
  }
  return buf;
}

/** Remove cutout caches from earlier model versions. */
export async function pruneOldModels(deps: LoaderDeps): Promise<void> {
  if (!deps.caches) return;
  try {
    const names = await deps.caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("hypefy-cutout-") && n !== MODEL_CACHE).map((n) => deps.caches!.delete(n)),
    );
  } catch {
    // Nothing to tidy is not worth failing for.
  }
}
