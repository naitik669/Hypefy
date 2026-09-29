import { describe, it, expect, beforeEach } from "vitest";
import {
  clearChatMediaCache,
  needsSigning,
  parseChatMediaUrl,
  peekSigned,
  resolveChatMediaUrl,
} from "@/lib/chat-media-url";

/**
 * Chat media sits in private buckets and is shown through short-lived signed
 * links. What can go wrong is quiet: a GIF accidentally sent through storage,
 * a path mis-decoded so the wrong file is asked for, a link reused after it
 * died, or fifty tiles in one thread each making their own round trip.
 */

const HOST = "https://proj.supabase.co/storage/v1/object";
const PHOTO = `${HOST}/public/chat-media/user-1/170.png`;
const VOICE = `${HOST}/public/voice-notes/user-1/171.webm`;

function signer(impl?: (bucket: string, path: string, ttl: number) => { data: { signedUrl: string } | null; error: unknown }) {
  const calls: { bucket: string; path: string; ttl: number }[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          calls.push({ bucket, path, ttl });
          return impl
            ? impl(bucket, path, ttl)
            : { data: { signedUrl: `${HOST}/sign/${bucket}/${path}?token=t${calls.length}` }, error: null };
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
    expect(parseChatMediaUrl(`${HOST}/public/chat-media/user-1/my%20file.doc`)?.path).toBe("user-1/my file.doc");
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
    expect(calls).toEqual([{ bucket: "voice-notes", path: "user-1/171.webm", ttl: 3600 }]);
  });

  it("reuses a link while it is good", async () => {
    const { client, calls } = signer();
    const a = await resolveChatMediaUrl(PHOTO, { client });
    const b = await resolveChatMediaUrl(PHOTO, { client });
    expect(b).toBe(a);
    expect(calls).toHaveLength(1);
    expect(peekSigned(PHOTO)).toBe(a);
  });

  it("shares one round trip between simultaneous requests for one file", async () => {
    // A thread of fifty tiles mounting together.
    const { client, calls } = signer();
    const all = await Promise.all(Array.from({ length: 20 }, () => resolveChatMediaUrl(PHOTO, { client })));
    expect(new Set(all).size).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("signs again shortly before the link expires, not after", async () => {
    const { client, calls } = signer();
    const t0 = 1_000_000;
    await resolveChatMediaUrl(PHOTO, { client, now: t0 });

    // 54 minutes in: still inside the hour, and outside the 5-minute margin.
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
    const { client } = signer(() => ({ data: null, error: { message: "Object not found" } }));
    expect(await resolveChatMediaUrl(PHOTO, { client })).toBeNull();
  });

  it("does not remember a refusal — access can be granted later", async () => {
    let allow = false;
    const { client, calls } = signer((b, p) =>
      allow ? { data: { signedUrl: `${HOST}/sign/${b}/${p}?token=ok` }, error: null } : { data: null, error: { message: "no" } },
    );
    expect(await resolveChatMediaUrl(PHOTO, { client })).toBeNull();
    allow = true;
    expect(await resolveChatMediaUrl(PHOTO, { client })).toContain("token=ok");
    expect(calls).toHaveLength(2);
  });

  it("survives the storage call throwing", async () => {
    const client = {
      storage: { from: () => ({ createSignedUrl: async () => { throw new Error("network"); } }) },
    };
    expect(await resolveChatMediaUrl(PHOTO, { client })).toBeNull();
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

describe("peekSigned", () => {
  it("returns non-chat URLs as they are, and unseen chat URLs as null", () => {
    expect(peekSigned("https://x.test/a.gif")).toBe("https://x.test/a.gif");
    expect(peekSigned(PHOTO)).toBeNull();
  });
});

