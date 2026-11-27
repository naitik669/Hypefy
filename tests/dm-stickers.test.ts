// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DEFAULT_STICKER_EDGE,
  isStickerEdge,
  readSticker,
  readStickerRow,
  recentStickers,
  stickerFit,
  stickerTilt,
  stickerUrl,
} from "@hypefy/core/stickers";
import { forwardSticker, listMyStickers, listRecentStickers, saveSticker, sendSticker } from "@/lib/sticker-store";
import { msgSnippet } from "@/lib/chat-thread";

/**
 * Stickers in a conversation, T1 (0220).
 *
 * A sticker is a picture and one choice — how its edge is drawn. No name.
 * The server decides where a sticker message's picture is; the client only
 * says which sticker.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Comments out, so nothing below can be satisfied by prose. */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*(--|\/\/).*$/gm, "")
    .replace(/\s--\s.*$/gm, "");

const UID = "11111111-2222-3333-4444-555555555555";
const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PATH = `${UID}/99999999-8888-7777-6666-555555555555.webp`;

const stickerMsg = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  kind: "sticker",
  is_unsent: false,
  metadata: { sticker_id: SID, path: PATH, edge: "clean", w: 300, h: 200, ...meta },
  ...over,
});

// ── Reading the shapes ──────────────────────────────────────────────────

describe("reading a sticker off a message", () => {
  it("everything comes from the metadata send_sticker wrote", () => {
    expect(readSticker(stickerMsg())).toEqual({ id: SID, path: PATH, edge: "clean", width: 300, height: 200 });
  });

  it("anything else reads as not a sticker, rather than throwing", () => {
    expect(readSticker({ kind: "gif", metadata: stickerMsg().metadata })).toBe(null);
    expect(readSticker({ kind: "sticker", metadata: null })).toBe(null);
    expect(readSticker({ kind: "sticker", metadata: "nonsense" })).toBe(null);
    expect(readSticker(stickerMsg({}, { path: "https://evil.example/x.png" }))).toBe(null);
    expect(readSticker(stickerMsg({}, { path: `${UID}/../other.png` }))).toBe(null);
    expect(readSticker(stickerMsg({}, { w: 0 }))).toBe(null);
    expect(readSticker(stickerMsg({}, { h: "200" }))).toBe(null);
    expect(readSticker(stickerMsg({}, { sticker_id: 7 }))).toBe(null);
  });

  it("an unsent sticker shows nothing", () => {
    expect(readSticker(stickerMsg({ is_unsent: true }))).toBe(null);
  });

  it("an edge it does not know is drawn the default way, and the default is stroke", () => {
    expect(DEFAULT_STICKER_EDGE).toBe("stroke");
    expect(readSticker(stickerMsg({}, { edge: "glitter" }))?.edge).toBe("stroke");
    expect(readSticker(stickerMsg({}, { edge: "stroke" }))?.edge).toBe("stroke");
    expect(isStickerEdge("clean")).toBe(true);
    expect(isStickerEdge("shadow")).toBe(false);
  });

  it("a table row reads the same way", () => {
    expect(readStickerRow({ id: SID, path: PATH, edge: "clean", width: 10, height: 20 })).toEqual({
      id: SID, path: PATH, edge: "clean", width: 10, height: 20,
    });
    expect(readStickerRow(null)).toBe(null);
  });
});

describe("where its picture is", () => {
  it("the public object URL in the stickers bucket", () => {
    expect(stickerUrl("https://x.supabase.co/", PATH)).toBe(
      `https://x.supabase.co/storage/v1/object/public/stickers/${PATH}`,
    );
  });
});

describe("the tilt in the thread", () => {
  it("is the same every time for the same message", () => {
    expect(stickerTilt("m-1")).toBe(stickerTilt("m-1"));
  });

  it("stays inside ±3 degrees", () => {
    for (let i = 0; i < 2000; i++) {
      const t = stickerTilt(`id-${i}-${i * 7}`);
      expect(t).toBeGreaterThanOrEqual(-3);
      expect(t).toBeLessThanOrEqual(3);
    }
  });

  it("is actually scattered: both directions, and not all the same", () => {
    const tilts = Array.from({ length: 200 }, (_, i) => stickerTilt(crypto.randomUUID() + i));
    expect(tilts.some((t) => t < -1.5)).toBe(true);
    expect(tilts.some((t) => t > 1.5)).toBe(true);
    expect(new Set(tilts).size).toBeGreaterThan(20);
  });
});

describe("the size it is stored at", () => {
  it("shrinks the longer side to 512", () => {
    expect(stickerFit(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(stickerFit(1000, 4000)).toEqual({ width: 128, height: 512 });
  });

  it("never enlarges", () => {
    expect(stickerFit(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it("a picture with no size has none", () => {
    expect(stickerFit(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("Recent", () => {
  it("is each sticker once, newest first, unsent ones left out", () => {
    const A = "a0000000-0000-0000-0000-000000000000";
    const B = "b0000000-0000-0000-0000-000000000000";
    const rows = [
      stickerMsg({}, { sticker_id: A }),
      stickerMsg({ is_unsent: true }, { sticker_id: B }),
      stickerMsg({}, { sticker_id: A }),
      stickerMsg({}, { sticker_id: B }),
      { kind: "text", metadata: null },
    ];
    expect(recentStickers(rows).map((s) => s.id)).toEqual([A, B]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      stickerMsg({}, { sticker_id: `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000` }),
    );
    expect(recentStickers(rows, 5)).toHaveLength(5);
  });
});

describe("what a sticker is called where it cannot be drawn", () => {
  it("a quoted reply says Sticker, never a path", () => {
    expect(msgSnippet({ kind: "sticker", body: null })).toBe("Sticker");
  });

  it("the inbox and the in-app toast both say sent a sticker", () => {
    for (const f of ["src/components/messages/MessagesInbox.tsx", "src/components/messages/InAppNotifier.tsx"]) {
      expect(strip(read(f))).toMatch(/\n\s*sticker: "sent a sticker",/);
    }
  });
});

// ── The calls, driven with a fake client ────────────────────────────────

type Call = { op: string; args: unknown[] };

/** A Supabase client that records what is asked of it and answers as told. */
function fakeClient(answers: {
  select?: { data: unknown; error: { message: string } | null };
  insert?: { data: unknown; error: { message: string } | null };
  upload?: { error: { message: string } | null };
  rpc?: { data: unknown; error: { message: string } | null };
}) {
  const calls: Call[] = [];
  const chain = (final: () => unknown) => {
    const q: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "order", "limit", "insert", "single"]) {
      q[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return q;
      };
    }
    q.then = (res: (v: unknown) => void) => res(final());
    return q;
  };
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      let inserting = false;
      const q = chain(() => (inserting ? answers.insert : answers.select));
      const insert = q.insert as (...a: unknown[]) => unknown;
      q.insert = (...a: unknown[]) => { inserting = true; return insert(...a); };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (...args: unknown[]) => { calls.push({ op: "upload", args: [bucket, ...args] }); return answers.upload ?? { error: null }; },
        remove: async (...args: unknown[]) => { calls.push({ op: "remove", args: [bucket, ...args] }); return { error: null }; },
      }),
    },
    rpc: async (...args: unknown[]) => { calls.push({ op: "rpc", args }); return answers.rpc; },
  };
  return { client: client as never, calls };
}

const row = { id: SID, path: PATH, edge: "stroke", width: 300, height: 200 };

describe("listing your stickers", () => {
  it("asks for your own, not deleted, newest first", async () => {
    const { client, calls } = fakeClient({ select: { data: [row], error: null } });
    const got = await listMyStickers(client, UID);
    expect(got).toEqual({ ok: true, value: [readStickerRow(row)] });
    expect(calls).toContainEqual({ op: "from", args: ["stickers"] });
    expect(calls).toContainEqual({ op: "eq", args: ["owner_id", UID] });
    expect(calls).toContainEqual({ op: "is", args: ["deleted_at", null] });
    expect(calls).toContainEqual({ op: "order", args: ["created_at", { ascending: false }] });
  });

  it("a refused read is a failure, never an empty list", async () => {
    const { client } = fakeClient({ select: { data: null, error: { message: "permission denied" } } });
    expect(await listMyStickers(client, UID)).toEqual({ ok: false, error: "permission denied" });
  });

  it("Recent reads your own sticker messages, and a refusal is a failure too", async () => {
    const ok = fakeClient({ select: { data: [stickerMsg()], error: null } });
    const got = await listRecentStickers(ok.client, UID);
    expect(got.ok && got.value.map((s) => s.id)).toEqual([SID]);
    expect(ok.calls).toContainEqual({ op: "from", args: ["messages"] });
    expect(ok.calls).toContainEqual({ op: "eq", args: ["sender_id", UID] });
    expect(ok.calls).toContainEqual({ op: "eq", args: ["kind", "sticker"] });

    const bad = fakeClient({ select: { data: null, error: { message: "nope" } } });
    expect(await listRecentStickers(bad.client, UID)).toEqual({ ok: false, error: "nope" });
  });
});

describe("saving a sticker", () => {
  const webp = new Blob([new Uint8Array(10)], { type: "image/webp" });

  it("uploads under your own folder with an unguessable name, then writes the row", async () => {
    const { client, calls } = fakeClient({ insert: { data: row, error: null } });
    const got = await saveSticker(client, UID, webp, "clean", { width: 300, height: 200 });
    expect(got.ok).toBe(true);
    const up = calls.find((c) => c.op === "upload")!;
    expect(up.args[0]).toBe("stickers");
    expect(up.args[1]).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\\.webp$`));
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toEqual({ owner_id: UID, path: up.args[1], edge: "clean", width: 300, height: 200 });
    // No name, anywhere.
    expect(Object.keys(ins.args[0] as object)).not.toContain("name");
  });

  it("takes the file back out when the row is refused", async () => {
    const { client, calls } = fakeClient({ insert: { data: null, error: { message: "denied" } } });
    const got = await saveSticker(client, UID, webp, "stroke", { width: 1, height: 1 });
    expect(got).toEqual({ ok: false, error: "denied" });
    const up = calls.find((c) => c.op === "upload")!;
    expect(calls).toContainEqual({ op: "remove", args: ["stickers", [up.args[1]]] });
  });

  it("a refused upload writes no row", async () => {
    const { client, calls } = fakeClient({ upload: { error: { message: "too big" } } });
    expect(await saveSticker(client, UID, webp, "stroke", { width: 1, height: 1 })).toEqual({ ok: false, error: "too big" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("a JPEG is refused before anything is uploaded — its background would turn black", async () => {
    const { client, calls } = fakeClient({});
    const jpg = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
    expect((await saveSticker(client, UID, jpg, "stroke", { width: 1, height: 1 })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("so is a file over the bucket's 1 MB", async () => {
    const { client, calls } = fakeClient({});
    const big = new Blob([new Uint8Array(1024 * 1024 + 1)], { type: "image/png" });
    expect((await saveSticker(client, UID, big, "stroke", { width: 1, height: 1 })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("sending a sticker", () => {
  it("says which sticker and nothing about its file", async () => {
    const { client, calls } = fakeClient({ rpc: { data: { id: "m1" }, error: null } });
    await sendSticker(client, "conv", SID, { replyToId: "r1", forwarded: true });
    expect(calls).toEqual([
      { op: "rpc", args: ["send_sticker", { p_conversation_id: "conv", p_sticker_id: SID, p_reply_to_id: "r1", p_forwarded: true }] },
    ]);
  });

  it("a refusal comes back as a failure with the server's words", async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: "blocked" } } });
    expect(await sendSticker(client, "conv", SID)).toEqual({ ok: false, error: "blocked" });
  });
});

describe("forwarding a sticker", () => {
  it("sends the same sticker again, marked forwarded", async () => {
    const { client, calls } = fakeClient({ rpc: { data: { id: "m2" }, error: null } });
    expect((await forwardSticker(client, "conv2", stickerMsg())).ok).toBe(true);
    expect(calls).toEqual([
      { op: "rpc", args: ["send_sticker", { p_conversation_id: "conv2", p_sticker_id: SID, p_reply_to_id: undefined, p_forwarded: true }] },
    ]);
  });

  it("a message that carries no sticker is refused without calling the server", async () => {
    const { client, calls } = fakeClient({});
    expect((await forwardSticker(client, "conv2", stickerMsg({}, { path: "x" }))).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("the forward sheet sends sticker messages this way, not through send_message", () => {
    const sheet = strip(read("src/components/messages/ForwardSheet.tsx"));
    const loop = sheet.slice(sheet.indexOf("for (const one of sending)"));
    const branch = loop.indexOf('if (one.kind === "sticker") {');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(loop.indexOf('supabase.rpc("send_message"'));
    expect(loop.slice(branch, loop.indexOf('supabase.rpc("send_message"'))).toMatch(/await forwardSticker\(supabase, convId, one\)[\s\S]*continue;/);
  });
});

// ── The migration ───────────────────────────────────────────────────────

describe("0220", () => {
  const sql = strip(read("supabase/migrations/0220_dm_stickers.sql"));
  const table = sql.slice(sql.indexOf("create table if not exists public.stickers"), sql.indexOf("create index"));
  const fn = sql.slice(sql.indexOf("create or replace function public.send_sticker"), sql.indexOf("end $$;"));

  it("a sticker has no name column", () => {
    expect(table).not.toMatch(/\bname\b|\btitle\b|\bcaption\b|\blabel\b/);
  });

  it("the edge is stroke or clean, stroke by default", () => {
    expect(table).toMatch(/edge text not null default 'stroke' check \(edge in \('stroke', 'clean'\)\)/);
  });

  it("the row's path is inside its owner's folder", () => {
    expect(table).toMatch(/check \(split_part\(path, '\/', 1\) = owner_id::text\)/);
  });

  it("the bucket is public, PNG and WebP only, 1 MB", () => {
    expect(sql).toMatch(/values \('stickers', 'stickers', true, 1048576, array\['image\/png', 'image\/webp'\]\)/);
  });

  it("uploads only into your own folder", () => {
    const up = sql.slice(sql.indexOf('create policy "stickers: own upload"'), sql.indexOf('drop policy if exists "stickers: own delete"'));
    expect(up).toMatch(/bucket_id = 'stickers'\s+and \(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  });

  it("only the deleted_at column can be changed after saving", () => {
    expect(sql).toMatch(/revoke all on table public\.stickers from anon, authenticated;/);
    expect(sql).toMatch(/grant update \(deleted_at\) on table public\.stickers to authenticated;/);
    expect(sql).not.toMatch(/grant update on table public\.stickers/);
  });

  it("send_sticker checks membership and blocks before it writes", () => {
    const insertAt = fn.indexOf("insert into public.messages");
    expect(fn.indexOf("if not public.is_conv_member(p_conversation_id) then raise exception")).toBeGreaterThan(-1);
    expect(fn.indexOf("if not public.is_conv_member(p_conversation_id) then raise exception")).toBeLessThan(insertAt);
    expect(fn.indexOf("join public.blocked_users b on b.blocker_id = cm.user_id and b.blocked_id = v_me")).toBeLessThan(insertAt);
    expect(fn.indexOf("raise exception 'blocked'")).toBeGreaterThan(-1);
  });

  it("only a live sticker can be sent", () => {
    expect(fn).toMatch(/where id = p_sticker_id and deleted_at is null;\s+if v_st\.id is null then raise exception 'No such sticker'/);
  });

  it("the picture's path and edge are copied from the row, never taken from the caller", () => {
    expect(fn).toMatch(/'path', v_st\.path,/);
    expect(fn).toMatch(/'edge', v_st\.edge,/);
    // The only things a caller passes.
    const args = fn.slice(0, fn.indexOf(") returns json"));
    expect(args.match(/\bp_[a-z_]+/g)).toEqual(["p_conversation_id", "p_sticker_id", "p_reply_to_id", "p_forwarded"]);
    expect(fn).toMatch(/values \(p_conversation_id, v_me, null, 'sticker', p_reply_to_id, v_meta\)/);
  });

  it("signed-out callers cannot run it", () => {
    expect(sql).toMatch(/revoke all on function public\.send_sticker\(uuid, uuid, uuid, boolean\) from public, anon;/);
  });
});

// ── The composer and the thread (JSX: read, since it cannot be run here) ─

describe("the composer", () => {
  const chat = strip(read("src/components/messages/RealChatView.tsx"));

  it("GIF has left the attach menu", () => {
    const menu = chat.slice(chat.indexOf("const ATTACH_OPTIONS"), chat.indexOf("const ATTACH_HOLD_MS"));
    expect(menu).toMatch(/mode: "poll"/);
    expect(menu).not.toMatch(/mode: "gif"/);
    expect(menu.match(/\{ mode: "/g)).toHaveLength(6);
  });

  it("the old GIF pill is gone and the drawer stands where the GIF picker stood", () => {
    expect(chat).not.toMatch(/aria-label="GIF picker"/);
    expect(chat).not.toMatch(/<GifPicker/);
    expect(chat).toMatch(/<StickerDrawer[\s\S]{0,200}onGif=\{sendGif\}/);
  });

  it("one Stickers and GIFs button sits inside the text box, only while it is empty", () => {
    const input = chat.slice(chat.indexOf("<MessageInput"), chat.indexOf("/>", chat.indexOf('aria-label="Stickers and GIFs"')));
    expect(input).toMatch(/trailing=\{\s*!hasText && !attachment && !editing \? \(/);
    expect(input).toMatch(/aria-label="Stickers and GIFs"/);
  });

  it("a sticker is drawn by its own branch, tilted by its id, before the GIF/image bubble", () => {
    const at = chat.indexOf('m.kind === "sticker" && readSticker(m) ?');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(chat.indexOf('(m.kind === "gif" || m.kind === "image") && m.body ?'));
    expect(chat.slice(at, at + 1200)).toMatch(/<StickerImage sticker=\{readSticker\(m\)!\} tilt=\{stickerTilt\(m\.id\)\} \/>/);
  });

  it("a failed sticker can be retried, by sticker rather than by body", () => {
    const retry = chat.slice(chat.indexOf("async function retrySend"), chat.indexOf("// A OneShot has no body by design"));
    expect(retry).toMatch(/if \(failed\.kind === "sticker"\) \{[\s\S]*sendStickerRpc\(supabase, conversationId, st\.id/);
  });
});

// ── Rendering ──────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/messages/GifPicker", () => ({
  GifPicker: ({ onSelect }: { onSelect: (u: string) => void }) =>
    createElement("button", { "data-gif": true, onClick: () => onSelect("https://gif/x.gif") }, "a gif"),
}));
const store = vi.hoisted(() => ({
  /** Only the drawer's tests answer from here; the calls above run for real. */
  fake: false,
  mine: { ok: true, value: [] as unknown[] } as { ok: boolean; value?: unknown[]; error?: string },
  recent: { ok: true, value: [] as unknown[] } as { ok: boolean; value?: unknown[]; error?: string },
}));
vi.mock("@/lib/sticker-store", async (orig) => {
  const real = await orig<typeof import("@/lib/sticker-store")>();
  return {
    ...real,
    listMyStickers: (...a: Parameters<typeof real.listMyStickers>) => (store.fake ? Promise.resolve(store.mine) : real.listMyStickers(...a)),
    listRecentStickers: (...a: Parameters<typeof real.listRecentStickers>) => (store.fake ? Promise.resolve(store.recent) : real.listRecentStickers(...a)),
  };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  localStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function drawer(props: Record<string, unknown> = {}) {
  store.fake = true;
  const { StickerDrawer } = await import("@/components/stickers/StickerDrawer");
  const h = { onSticker: vi.fn(), onGif: vi.fn(), onError: vi.fn() };
  await act(async () => root.render(createElement(StickerDrawer, { currentUserId: UID, ...h, ...props })));
  return h;
}

describe("the drawer", () => {
  it("Create is the first tile, dark grey with a plus, not lime", async () => {
    store.mine = { ok: true, value: [readStickerRow(row)] };
    await drawer();
    const tiles = host.querySelectorAll(".grid > *");
    const create = tiles[0] as HTMLElement;
    expect(create.getAttribute("aria-label")).toBe("Create a sticker");
    expect(create.className).toMatch(/bg-\[#242424\]/);
    expect(create.className).not.toMatch(/accent/);
    expect(create.querySelector("svg")).not.toBe(null);
    expect(tiles).toHaveLength(2);
  });

  it("a tile sends that sticker", async () => {
    store.mine = { ok: true, value: [readStickerRow(row)] };
    const h = await drawer();
    await act(async () => (host.querySelector('[aria-label="Send sticker"]') as HTMLElement).click());
    expect(h.onSticker).toHaveBeenCalledWith(readStickerRow(row));
  });

  it("a refused read says so instead of showing an empty grid", async () => {
    store.mine = { ok: false, error: "permission denied" };
    await drawer();
    expect(host.textContent).toMatch(/Couldn't load your stickers/);
    expect(host.querySelector('[aria-label="Create a sticker"]')).toBe(null);
  });

  it("GIFs are its second tab, and a GIF picked there is sent as a GIF", async () => {
    store.mine = { ok: true, value: [] };
    const h = await drawer();
    const tabs = [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Stickers", "GIFs"]);
    await act(async () => (host.querySelectorAll('[role="tab"]')[1] as HTMLElement).click());
    await act(async () => (host.querySelector("[data-gif]") as HTMLElement).click());
    expect(h.onGif).toHaveBeenCalledWith("https://gif/x.gif");
  });

  it("opens on GIFs when asked to", async () => {
    await drawer({ startTab: "gifs" });
    expect(host.querySelector("[data-gif]")).not.toBe(null);
  });
});

describe("a sticker in the thread", () => {
  async function draw(edge: "stroke" | "clean", tilt = 0) {
    const { StickerImage } = await import("@/components/stickers/StickerImage");
    await act(async () =>
      root.render(createElement(StickerImage, { sticker: { ...readStickerRow(row)!, edge }, tilt })),
    );
    return host.querySelector("img") as HTMLImageElement;
  }

  it("stroke draws a white outline with no blur — an edge, not a shadow", async () => {
    const img = await draw("stroke");
    const parts = img.style.filter.match(/drop-shadow\([^)]*\)/g) ?? [];
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      // drop-shadow(x y blur color): the blur is always 0.
      const nums = p.match(/-?\d+(\.\d+)?px|\b0\b/g) ?? [];
      expect(nums[2]).toMatch(/^0(px)?$/);
    }
  });

  it("clean draws no outline at all", async () => {
    const img = await draw("clean");
    expect(img.style.filter).toBe("");
  });

  it("is turned by the tilt it is given and fits its 132 × 150 box", async () => {
    const img = await draw("clean", 2.4);
    expect(img.style.transform).toBe("rotate(2.4deg)");
    expect(img.width).toBe(132);
    expect(img.height).toBe(88);
  });
});
