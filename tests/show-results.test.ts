import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  NO_RESULTS,
  RESULT_KINDS,
  emptyResult,
  isMissingFunction,
  isResultKind,
  readStickerResults,
  resultValue,
  type ResultPerson,
} from "@/lib/show-results";

/**
 * Who did what, on your own Show.
 *
 * The decision behind this: the owner sees who, viewers see totals. That split
 * is kept in the database — show_sticker_results is gated on being the Show's
 * author, and the two calls a viewer makes never learn a name — so the client
 * only has to read the answer without trusting its shape.
 *
 * And it has to cope with the function not being there: 0194 adds it and could
 * not be applied, so a live client is running against a database without it.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sheet = read("src/components/shows/ShowResultsSheet.tsx");
const view = read("src/components/shows/LayerView.tsx");
const viewer = read("src/components/shows/ShowViewer.tsx");
const stickers = read("src/components/shows/ShowStickers.tsx");

const who = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  username: "maya",
  display_name: "Maya",
  avatar_url: null,
  avatar_hue: 120,
  value: 1,
  body: null,
  at: "2026-11-01T10:00:00Z",
  ...over,
});

describe("reading the answer", () => {
  it("one person on one poll", () => {
    const got = readStickerResults({ p1: { kind: "poll", people: [who()] } });
    expect(Object.keys(got)).toEqual(["p1"]);
    expect(got.p1.kind).toBe("poll");
    expect(got.p1.people[0]).toMatchObject({ id: "u1", displayName: "Maya", value: 1, hue: 120 });
  });

  it("nothing at all reads as nothing, never as a crash", () => {
    for (const junk of [null, undefined, "nope", 7, [], [1, 2]]) {
      expect(readStickerResults(junk), String(junk)).toEqual(NO_RESULTS);
    }
  });

  it("a list of rows is nothing, not stickers keyed by position", () => {
    // Object.entries would happily key these "0", "1" — but a layer id is a
    // uuid, so an array answer is a different shape, not one to salvage.
    expect(readStickerResults([{ kind: "poll", people: [who()] }])).toEqual(NO_RESULTS);
  });

  it("a kind it does not know is left out", () => {
    // Rather than rendering a section with no idea what its rows mean.
    const got = readStickerResults({ a: { kind: "text", people: [who()] }, b: { kind: "poll", people: [] } });
    expect(Object.keys(got)).toEqual(["b"]);
  });

  it("somebody with no id is left out, having no row to be", () => {
    const got = readStickerResults({ p1: { kind: "poll", people: [who({ id: null }), who({ id: "u2" })] } });
    expect(got.p1.people.map((p) => p.id)).toEqual(["u2"]);
  });

  it("missing fields read as absent rather than as something", () => {
    const got = readStickerResults({ p1: { kind: "slider", people: [{ id: "u1" }] } });
    const p = got.p1.people[0];
    expect(p.displayName).toBeNull();
    expect(p.username).toBeNull();
    expect(p.value).toBeNull();
    expect(p.at).toBeNull();
    // A hue is a colour and has to be something.
    expect(p.hue).toBe(200);
  });

  it("people that are not a list read as nobody", () => {
    expect(readStickerResults({ p1: { kind: "poll", people: "lots" } }).p1.people).toEqual([]);
  });

  it("and every kind the stickers have is a kind this knows", () => {
    for (const k of ["poll", "quiz", "slider", "countdown", "question", "addyours"]) {
      expect(isResultKind(k), k).toBe(true);
    }
    for (const k of ["text", "music", "mention", "sticker", "time"]) {
      expect(isResultKind(k), k).toBe(false);
    }
    expect(RESULT_KINDS).toHaveLength(6);
  });
});

describe("what a row says", () => {
  const p = (over: Partial<ResultPerson> = {}): ResultPerson => ({
    id: "u1",
    username: null,
    displayName: null,
    avatarUrl: null,
    hue: 200,
    value: null,
    body: null,
    at: null,
    ...over,
  });

  it("a poll choice reads as the option, not the number", () => {
    expect(resultValue("poll", p({ value: 1 }), ["Rooftop", "The park"])).toBe("The park");
  });

  it("an option that has since been rewritten still says something", () => {
    // A poll with votes cannot have its options rewritten (a trigger refuses
    // it), but a quiz answered after an edit, or a stale client, should not
    // render an empty cell.
    expect(resultValue("poll", p({ value: 4 }), ["Rooftop"])).toBe("Option 5");
  });

  it("a slider reads as a percentage", () => {
    expect(resultValue("slider", p({ value: 78 }), [])).toBe("78%");
    expect(resultValue("slider", p({ value: 0 }), [])).toBe("0%");
    // Not "null%", which is what a bare template gives.
    expect(resultValue("slider", p({ value: null }), [])).toBe("");
  });

  it("a countdown and an Add yours are just people", () => {
    expect(resultValue("countdown", p(), [])).toBe("");
    expect(resultValue("addyours", p(), [])).toBe("");
  });

  it("and every kind has something to say when nobody has acted", () => {
    for (const k of RESULT_KINDS) {
      expect(emptyResult(k), k).toMatch(/yet$/);
    }
  });
});

describe("before the migration is applied", () => {
  it("a missing function is recognised, by either code", () => {
    // Postgres says 42883; PostgREST says PGRST202.
    expect(isMissingFunction({ code: "42883" })).toBe(true);
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunction({ code: "23514" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
    expect(isMissingFunction("boom")).toBe(false);
  });

  it("and the sheet says so rather than failing", () => {
    expect(sheet).toContain('setState(isMissingFunction(error) ? "unavailable" : "ready");');
    expect(sheet).toContain("Names appear here after the next database");
  });
});

describe("how it opens", () => {
  it("tapping your own sticker asks for its results", () => {
    // Handled once in the wrapper rather than inside each of the five, since
    // none of them offers the author a vote any more.
    expect(view).toContain("onResults(layer.id)");
    expect(view).toContain("isAuthor && onResults && isResultKind(layer.type)");
  });

  it("and only the author is given the handler at all", () => {
    expect(viewer).toContain("onResults={isOwner ? setResults : undefined}");
    expect(viewer).toContain("{isOwner && (");
  });

  it("it scrolls to the one that was tapped", () => {
    expect(sheet).toContain("document.getElementById(`result-${focus}`)");
    expect(sheet).toContain("id={`result-${layer.id}`}");
  });

  it("sections follow the order the stickers sit in", () => {
    // Which is back to front on the picture, so the sheet reads like the Show.
    expect(sheet).toContain("layers.filter((l) => isResultKind(l.type))");
  });
});

describe("one surface, not five", () => {
  it("the slider's own list of names is gone", () => {
    // Two answers to the same question is the thing the sheet exists to stop,
    // and a button inside the sticker meant one tap doing two things.
    expect(stickers).not.toContain("showWho");
    // The call, not the name: the comment explaining that the function stays
    // in the database as the sheet's fallback mentions it too.
    expect(stickers).not.toContain('rpc("show_slider_voters"');
  });

  it("the question keeps its own screen, being private text", () => {
    // A sheet of other people's confidences reads like a feed of them.
    expect(sheet).toContain('kind === "question" ?');
    expect(sheet).toContain("/answers`}");
  });
});
