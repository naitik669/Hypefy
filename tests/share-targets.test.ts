import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The quick-share faces are fetched once, not once per card.
 *
 * `share_suggestions` ranks everyone you talk to, and a feed renders one
 * share button per card, each arming itself when the browser goes idle. The
 * result cache could not help, because it is only filled once the query comes
 * back: every button on screen missed it and asked again. Production had
 * 20,091 calls at a mean of 415ms — against 12ms when the query runs on its
 * own, with a 7.9 second maximum and no disk reads, which is what identical
 * work queueing behind itself looks like.
 *
 * Module state is per-import, so each test gets a fresh module.
 */

type Row = {
  kind: string;
  id: string;
  name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

const row = (id: string, over: Partial<Row> = {}): Row => ({
  kind: "person",
  id,
  name: `Name ${id}`,
  username: `u${id}`,
  avatar_hue: 200,
  avatar_url: null,
  ...over,
});

/** One deferred answer per rpc call, so overlap is under the test's control. */
function stubClient() {
  const calls: { resolve: (r: { data: Row[] | null; error: unknown }) => void }[] = [];
  const rpc = vi.fn(
    () =>
      new Promise<{ data: Row[] | null; error: unknown }>((resolve) => {
        calls.push({ resolve });
      }),
  );
  return { rpc, calls };
}

let stub: ReturnType<typeof stubClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: (...args: unknown[]) => stub.rpc(...(args as [])) }),
}));

async function freshModule() {
  vi.resetModules();
  stub = stubClient();
  return import("@/components/feed/QuickShare");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("twenty cards, one query", () => {
  it("callers that arrive together share the request", async () => {
    const { loadShareTargets } = await freshModule();

    const waiting = Array.from({ length: 20 }, () => loadShareTargets());
    expect(stub.rpc).toHaveBeenCalledTimes(1);

    stub.calls[0].resolve({ data: [row("a"), row("b")], error: null });
    const results = await Promise.all(waiting);

    // Every one of them gets the answer, not just the first.
    expect(results).toHaveLength(20);
    for (const r of results) expect(r.map((t) => t.id)).toEqual(["a", "b"]);
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it("and the ones that come later use the remembered list", async () => {
    const { loadShareTargets } = await freshModule();

    const first = loadShareTargets();
    stub.calls[0].resolve({ data: [row("a")], error: null });
    await first;

    await loadShareTargets();
    await loadShareTargets();
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it("the ranking is asked for with the number of faces the row holds", async () => {
    const { loadShareTargets } = await freshModule();
    void loadShareTargets();
    expect(stub.rpc).toHaveBeenCalledWith("share_suggestions", { p_limit: 4 });
  });
});

describe("after a send", () => {
  it("the order is asked for again, once, however many cards ask", async () => {
    const { loadShareTargets, forgetShareTargets } = await freshModule();

    const first = loadShareTargets();
    stub.calls[0].resolve({ data: [row("a")], error: null });
    await first;

    forgetShareTargets();

    const again = Array.from({ length: 12 }, () => loadShareTargets());
    expect(stub.rpc).toHaveBeenCalledTimes(2);
    stub.calls[1].resolve({ data: [row("b")], error: null });
    for (const r of await Promise.all(again)) expect(r.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("when the query fails", () => {
  it("nothing is remembered, so the next hold asks again", async () => {
    const { loadShareTargets } = await freshModule();

    const first = loadShareTargets();
    stub.calls[0].resolve({ data: null, error: { message: "network" } });
    expect(await first).toEqual([]);

    const second = loadShareTargets();
    expect(stub.rpc).toHaveBeenCalledTimes(2);
    stub.calls[1].resolve({ data: [row("a")], error: null });
    expect((await second).map((t) => t.id)).toEqual(["a"]);
  });

  it("but an empty answer is an answer, and is kept", async () => {
    // Somebody with nobody to share with must not re-ask on every hold.
    const { loadShareTargets } = await freshModule();

    const first = loadShareTargets();
    stub.calls[0].resolve({ data: [], error: null });
    expect(await first).toEqual([]);

    await loadShareTargets();
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("what a face is called", () => {
  it("display name, else username, else a word for the kind", async () => {
    const { loadShareTargets } = await freshModule();
    const waiting = loadShareTargets();
    stub.calls[0].resolve({
      data: [
        row("a", { name: "Amy", username: "amy" }),
        row("b", { name: null, username: "bo" }),
        row("c", { name: null, username: null }),
        row("g", { kind: "group", name: null, username: null }),
      ],
      error: null,
    });
    const got = await waiting;
    expect(got.map((t) => t.name)).toEqual(["Amy", "bo", "User", "Group"]);
    expect(got.map((t) => t.kind)).toEqual(["person", "person", "person", "group"]);
  });
});
