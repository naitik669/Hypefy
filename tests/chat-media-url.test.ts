import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearChatMediaCache,
  mediaUrlsOf,
  needsSigning,
  parseChatMediaUrl,
  peekSigned,
  resolveChatMediaUrl,
} from "@/lib/chat-media-url";

/**
 * Chat media sits in private buckets and is shown through short-lived signed
 * links. What can go wrong is quiet: a GIF accidentally sent through storage,
 * a path mis-decoded so the wrong file is asked for, a link reused after it
 * died, one refused file taking its neighbours down, or fifty tiles in one
 * thread each making their own round trip.
 */

const HOST = "https://proj.supabase.co/storage/v1/object";
const url = (bucket: string, file: string) => `${HOST}/public/${bucket}/user-1/${file}`;
const PHOTO = url("chat-media", "170.png");
const VOICE = url("voice-notes", "171.webm");

type Item = { path: string | null; signedUrl: string; error: string | null };
type Call = { bucket: string; paths: string[]; ttl: number };

/** A storage stand-in that signs in batches, the way the real one does. */
function signer(refuse: (path: string) => boolean = () => false) {
  const calls: Call[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], ttl: number) => {
          calls.push({ bucket, paths, ttl });
          const data: Item[] = paths.map((path) =>
            refuse(path)
              ? { path, signedUrl: "", error: "Object not found" }
              : { path, signedUrl: `${HOST}/sign/${bucket}/${path}?token=t${calls.length}`, error: null },
          );
          return { data, error: null };
        },
      }),
    },
  };
  return { client, calls };
}

beforeEach(() => clearChatMediaCache());

describe("recognising chat media", () => {
  it("picks out both private buckets, with the path", () => {
    expect(parseChatMediaUrl(PHOTO)).toEqual({ bucket: "chat-media", path: "user-1/170.png" });
    expect(parseChatMediaUrl(VOICE)).toEqual({ bucket: "voice-notes", path: "user-1/171.webm" });
  });

  it("decodes an encoded path so the right file is asked for", () => {
    expect(parseChatMediaUrl(url("chat-media", "my%20file.doc"))?.path).toBe("user-1/my file.doc");
  });

  it("ignores everything that is not chat media", () => {
    for (const u of [
      "https://media0.giphy.com/media/abc/giphy.gif",
      "blob:http://localhost/1234",
      `${HOST}/public/avatars/user-1/a.png`,
      `${HOST}/sign/chat-media/user-1/170.png?token=x`,
      "not a url",
      "",
    ]) {
      expect(parseChatMediaUrl(u)).toBeNull();
      expect(needsSigning(u)).toBe(false);
    }
    expect(needsSigning(undefined)).toBe(false);
  });
});

describe("mediaUrlsOf — what a message points at", () => {
  it("reads the body of a photo or video", () => {
    expect(mediaUrlsOf("image", PHOTO)).toEqual([PHOTO]);
    expect(mediaUrlsOf("video", PHOTO)).toEqual([PHOTO]);
  });

  it("reads the url out of a voice note or document", () => {
    expect(mediaUrlsOf("voice", JSON.stringify({ url: VOICE, duration: 4 }))).toEqual([VOICE]);
    expect(mediaUrlsOf("document", JSON.stringify({ url: PHOTO, name: "a.pdf", size: 1 }))).toEqual([PHOTO]);
  });

  it("reads every item of an album", () => {
    const a = url("chat-media", "1.png");
    const b = url("chat-media", "2.mp4");
    const body = JSON.stringify({ caption: "", items: [{ url: a, type: "image" }, { url: b, type: "video" }] });
    expect(mediaUrlsOf("album", body)).toEqual([a, b]);
  });

  it("returns nothing for a GIF, text, or a body that is not what its kind says", () => {
    expect(mediaUrlsOf("gif", "https://media0.giphy.com/x.gif")).toEqual([]);
    expect(mediaUrlsOf("text", PHOTO)).toEqual([]);
    expect(mediaUrlsOf("voice", "not json")).toEqual([]);
    expect(mediaUrlsOf("album", JSON.stringify({ items: [null, { url: 5 }, {}] }))).toEqual([]);
    expect(mediaUrlsOf("image", null)).toEqual([]);
    expect(mediaUrlsOf("image", "https://media0.giphy.com/x.gif")).toEqual([]);
  });
});

describe("resolveChatMediaUrl", () => {
  it("hands anything else straight back, without touching storage", async () => {
    const { client, calls } = signer();
    for (const u of ["https://media0.giphy.com/x.gif", "blob:http://localhost/1"]) {
      expect(await resolveChatMediaUrl(u, { client })).toBe(u);
    }
    expect(calls).toHaveLength(0);
  });

  it("asks the right bucket for the right path, for an hour", async () => {
    const { client, calls } = signer();
    const out = await resolveChatMediaUrl(VOICE, { client });
    expect(out).toContain("/sign/voice-notes/user-1/171.webm");
    expect(calls).toEqual([{ bucket: "voice-notes", paths: ["user-1/171.webm"], ttl: 3600 }]);
  });

  it("reuses a link while it is good", async () => {
    const { client, calls } = signer();
    const a = await resolveChatMediaUrl(PHOTO, { client });
    const b = await resolveChatMediaUrl(PHOTO, { client });
    expect(b).toBe(a);
    expect(calls).toHaveLength(1);
    expect(peekSigned(PHOTO)).toBe(a);
  });

  it("signs again shortly before the link expires, not after", async () => {
    const { client, calls } = signer();
    const t0 = Date.now();
    await resolveChatMediaUrl(PHOTO, { client, now: t0 });

    // 54 minutes in: inside the hour and outside the 5-minute margin.
    await resolveChatMediaUrl(PHOTO, { client, now: t0 + 54 * 60_000 });
    expect(calls).toHaveLength(1);

    // 56 minutes in: inside the margin, so it is renewed before it can die mid-play.
    await resolveChatMediaUrl(PHOTO, { client, now: t0 + 56 * 60_000 });
    expect(calls).toHaveLength(2);
  });

  it("re-signs on demand — an expired link in a thread left open", async () => {
    const { client, calls } = signer();
    const first = await resolveChatMediaUrl(PHOTO, { client });
    const second = await resolveChatMediaUrl(PHOTO, { client, force: true });
    expect(calls).toHaveLength(2);
    expect(second).not.toBe(first);
    expect(peekSigned(PHOTO)).toBe(second);
  });

  it("returns null, not the private URL, when storage refuses", async () => {
    // Not a member, an unsent message, or offline. An empty tile is honest;
    // the raw URL would only show a broken image and imply it might work.
    const { client } = signer(() => true);
    expect(await resolveChatMediaUrl(PHOTO, { client })).toBeNull();
  });

  it("does not remember a refusal — access can be granted later", async () => {
    let allow = false;
    const { client, calls } = signer(() => !allow);
    expect(await resolveChatMediaUrl(PHOTO, { client })).toBeNull();
    allow = true;
    expect(await resolveChatMediaUrl(PHOTO, { client })).toContain("token=");
    expect(calls).toHaveLength(2);
  });

  it("survives the storage call throwing, and the whole call erroring", async () => {
    const throwing = {
      storage: { from: () => ({ createSignedUrls: async () => { throw new Error("network"); } }) },
    };
    expect(await resolveChatMediaUrl(PHOTO, { client: throwing })).toBeNull();

    const erroring = {
      storage: { from: () => ({ createSignedUrls: async () => ({ data: null, error: { message: "boom" } }) }) },
    };
    expect(await resolveChatMediaUrl(VOICE, { client: erroring })).toBeNull();
  });

  it("clears its cache on demand — the next account starts clean", async () => {
    const { client, calls } = signer();
    await resolveChatMediaUrl(PHOTO, { client });
    clearChatMediaCache();
    expect(peekSigned(PHOTO)).toBeNull();
    await resolveChatMediaUrl(PHOTO, { client });
    expect(calls).toHaveLength(2);
  });
});

describe("batching — the point of it", () => {
  it("sends a thread of different files as ONE call, not one each", async () => {
    // Fifty tiles mounting together used to be fifty round trips before the
    // first picture.
    const { client, calls } = signer();
    const files = Array.from({ length: 50 }, (_, i) => url("chat-media", `${i}.jpg`));
    const out = await Promise.all(files.map((f) => resolveChatMediaUrl(f, { client })));

    expect(out.every((u) => u?.includes("/sign/chat-media/"))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].paths).toHaveLength(50);
  });

  it("makes one call per bucket when a thread mixes photos and voice notes", async () => {
    const { client, calls } = signer();
    await Promise.all([
      resolveChatMediaUrl(PHOTO, { client }),
      resolveChatMediaUrl(url("chat-media", "2.png"), { client }),
      resolveChatMediaUrl(VOICE, { client }),
    ]);
    expect(calls.map((c) => c.bucket).sort()).toEqual(["chat-media", "voice-notes"]);
    expect(calls.find((c) => c.bucket === "chat-media")!.paths).toHaveLength(2);
  });

  it("asks once for a file that many tiles want", async () => {
    const { client, calls } = signer();
    const all = await Promise.all(Array.from({ length: 20 }, () => resolveChatMediaUrl(PHOTO, { client })));
    expect(new Set(all).size).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].paths).toEqual(["user-1/170.png"]);
  });

  it("splits a very large thread into several calls rather than one enormous one", async () => {
    const { client, calls } = signer();
    const files = Array.from({ length: 250 }, (_, i) => url("chat-media", `${i}.jpg`));
    await Promise.all(files.map((f) => resolveChatMediaUrl(f, { client })));
    expect(calls.map((c) => c.paths.length).sort((a, b) => b - a)).toEqual([100, 100, 50]);
  });

  it("lets one refused file fail alone", async () => {
    // An unsent message, or a file from a chat we are not in, must not blank
    // the neighbours it happened to be batched with.
    const bad = url("chat-media", "bad.jpg");
    const { client } = signer((path) => path.endsWith("bad.jpg"));
    const [a, b, c] = await Promise.all([
      resolveChatMediaUrl(PHOTO, { client }),
      resolveChatMediaUrl(bad, { client }),
      resolveChatMediaUrl(url("chat-media", "good.jpg"), { client }),
    ]);
    expect(a).toContain("token=");
    expect(b).toBeNull();
    expect(c).toContain("token=");
  });

  it("does not share a forced re-sign with the lookup already in flight", async () => {
    const { client, calls } = signer();
    const [first, forced] = await Promise.all([
      resolveChatMediaUrl(PHOTO, { client }),
      resolveChatMediaUrl(PHOTO, { client, force: true }),
    ]);
    expect(first).toBeTruthy();
    expect(forced).toBeTruthy();
    // Both asked, in the same batch — but the path is sent only once.
    expect(calls.flatMap((c) => c.paths)).toEqual(["user-1/170.png"]);
  });
});

describe("surviving a reload of the tab", () => {
  it("serves links from the session, with no call at all", async () => {
    const first = signer();
    const link = await resolveChatMediaUrl(PHOTO, { client: first.client });
    // persistence is debounced
    await new Promise((r) => setTimeout(r, 300));
    expect(sessionStorage.getItem("hypefy:chat-media-links:v1")).toContain("170.png");

    // A reload: same tab, module state gone, sessionStorage kept.
    vi.resetModules();
    const fresh = await import("@/lib/chat-media-url");
    const second = signer();
    expect(fresh.peekSigned(PHOTO)).toBe(link);
    expect(await fresh.resolveChatMediaUrl(PHOTO, { client: second.client })).toBe(link);
    expect(second.calls).toHaveLength(0);
  });

  it("does not resurrect a link that is about to expire", async () => {
    const stale = {
      "chat-media/user-1/170.png": { url: `${HOST}/sign/old`, expiresAt: Date.now() + 60_000 },
    };
    sessionStorage.setItem("hypefy:chat-media-links:v1", JSON.stringify(stale));
    vi.resetModules();
    const fresh = await import("@/lib/chat-media-url");
    expect(fresh.peekSigned(PHOTO)).toBeNull();
  });

  it("is emptied on sign-out, so the next account cannot inherit a link", async () => {
    const { client } = signer();
    await resolveChatMediaUrl(PHOTO, { client });
    await new Promise((r) => setTimeout(r, 300));
    expect(sessionStorage.getItem("hypefy:chat-media-links:v1")).not.toBeNull();

    clearChatMediaCache();
    expect(sessionStorage.getItem("hypefy:chat-media-links:v1")).toBeNull();
    vi.resetModules();
    const fresh = await import("@/lib/chat-media-url");
    expect(fresh.peekSigned(PHOTO)).toBeNull();
  });

  it("shrugs off garbage in storage", async () => {
    sessionStorage.setItem("hypefy:chat-media-links:v1", "{not json");
    vi.resetModules();
    const fresh = await import("@/lib/chat-media-url");
    expect(fresh.peekSigned(PHOTO)).toBeNull();
    const { client } = signer();
    expect(await fresh.resolveChatMediaUrl(PHOTO, { client })).toContain("token=");
  });
});

describe("peekSigned", () => {
  it("returns non-chat URLs as they are, and unseen chat URLs as null", () => {
    expect(peekSigned("https://x.test/a.gif")).toBe("https://x.test/a.gif");
    expect(peekSigned(PHOTO)).toBeNull();
  });
});
