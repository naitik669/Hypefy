import { describe, it, expect } from "vitest";
import { CARD_TYPES } from "@/components/shows/CardEditor";
import { readFileSync } from "node:fs";
import { LAYER_TYPES, layerMentions, readLayers, type ShowLayer } from "@/lib/show-layers";

/**
 * The widgets, as somebody adds them.
 *
 * Phase 3's second half: the model, the renderer and the voting already
 * existed, but nothing in the app could *make* a music, mention, link,
 * poll, question or embed layer — the editor offered words and a sticker
 * and nothing else, and the editor itself was not reachable from the
 * creator at all. A widget nobody can add is a widget that does not
 * exist, so what is pinned here is mostly reachability.
 *
 * Three of the six pickers are the app's own, reused rather than
 * rebuilt. That is worth a test: a second people search or a second poll
 * validator is a second thing to keep in step, and the one that drifts
 * is always the one nobody is looking at.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const editor = read("src/components/shows/ShowEditor.tsx");
const pickers = read("src/components/shows/ShowWidgetPickers.tsx");
const view = read("src/components/shows/LayerView.tsx");
const viewer = read("src/components/shows/ShowViewer.tsx");
const publishLib = read("src/lib/show-publish.ts");
const create = read("src/components/create/CreateScreen.tsx");

describe("every kind of layer can actually be added", () => {
  it("the tray covers the six that need a picker", () => {
    // The whole point of the phase. Read off the tray's tile table rather
    // than from the rendered JSX, because that table is what it maps over.
    const tray = read("src/components/shows/StickerTray.tsx");
    const table = tray.slice(tray.indexOf("export const ASK_AND_PLAY"), tray.indexOf("export const ALL_TILES"));
    for (const key of ["music", "mention", "link", "poll", "question", "embed", "quiz", "slider", "countdown", "addyours", "location", "hashtag", "time"]) {
      expect(table, key).toContain(`key: "${key}"`);
    }
  });

  it("and words are made rather than picked", () => {
    expect(editor).toContain('add("text", { text: "" })');
    // The emoji sticker is no longer added from the tray.
    expect(editor).not.toContain('add("sticker"');
  });

  it("so between them the editor reaches every type the model has", () => {
    // LAYER_TYPES is the model's own list; a type added there without a
    // way to add one is a type that exists only in the parser. "embed"
    // is the tray's word for the two that are one picker.
    const reachable = new Set<string>();
    for (const type of LAYER_TYPES) {
      if (editor.includes(`add("${type}"`)) reachable.add(type);
    }
    // The cards written on the sticker are placed by one generic line,
    // for every type CardEditor lists.
    if (editor.includes("const id = add(key, blankCard(key));")) {
      for (const t of CARD_TYPES) reachable.add(t);
    }
    // The tags typed on the sticker are placed blank by one line too.
    if (editor.includes("const id = add(key, blank);")) {
      for (const t of ["location", "hashtag", "mention", "link"]) reachable.add(t);
    }
    // The emoji sticker left the tray (the keyboard has emoji, and a text
    // layer takes them); it is still read, so Shows that carry one keep it.
    expect([...LAYER_TYPES].filter((t) => !reachable.has(t))).toEqual(["sticker"]);
  });

  it("the table is typed against the sheets, not kept in step by hand", () => {
    expect(editor).toContain("type Picker = SheetKey | null;");
    expect(read("src/components/shows/StickerTray.tsx")).toContain("type Tile = { key: WidgetKey; label: string; layer: ShowLayer; zoom: number; tilt: number };");
  });
});

describe("the pickers that already existed are the ones used", () => {
  it("a song comes from the app's own track picker", () => {
    expect(editor).toContain('import { TrackPicker } from "@/components/music/TrackPicker";');
    expect(editor).toContain('open={picking === "music"}');
  });

  it("a poll is written on the sticker, and kept by the chat's own validator", () => {
    // tidyOptions decides what is an option, for chat polls and Show polls
    // alike; readPayload asks the same questions on the way into the column.
    const card = read("src/components/shows/CardEditor.tsx");
    expect(card).toContain("options: tidyOptions(poll.options)");
    expect(editor).toContain("const id = add(key, blankCard(key));");
    expect(card).toContain('return { question: "", options: ["", ""] };');
  });

  it("and a mention is the same people search the chat typeahead runs", () => {
    const writer = read("src/components/shows/TagWriter.tsx");
    expect(writer).toContain('import { useMentionHashtag, type Suggestion } from "@/components/ui/MentionHashtagPicker";');
    // Driven with a value that is one mention and a caret at its end,
    // which is the question that hook already answers.
    expect(writer).toContain('const typed = `@${query.replace(/^@+/, "")}`;');
    expect(writer).toContain("useMentionHashtag(typed, typed.length)");
  });

  it("a link cannot be kept that the parser would refuse", () => {
    // readPayload takes https only. Leaving a link sticker checks the same
    // shape, so a link is never silently dropped at publish.
    const layers = read("src/lib/show-layers.ts");
    const check = layers.slice(layers.indexOf("export function linkFrom"), layers.indexOf("export function cleanTag"));
    expect(check).toContain('`https://${t}`');
    expect(check).toContain('replace(/^http:\\/\\//i, "https://")');
  });
});

describe("an embed points at the thing, and does not copy it", () => {
  it("the layer stores only an id", () => {
    // A thumbnail written into the layer would outlive a takedown of the
    // post it came from, inside every Show that embedded it.
    expect(editor).toContain('add("post", { postId: choice.id })');
    expect(editor).toContain('add("shot", { shotId: choice.id })');
    // The picture the picker already has goes to the render-time record
    // that the viewer fetches into, never into the layer's payload.
    const sheet = editor.slice(editor.indexOf("<EmbedSheet"), editor.indexOf("{writing === null &&"));
    expect(sheet).toContain("setEmbeds((e) => ({");
    expect(sheet).toContain("[id]: { thumb: choice.thumb, caption: choice.caption },");
  });

  it("the picture is fetched by id, and a removed one is not fetched", () => {
    const fetched = viewer.slice(viewer.indexOf("const [embeds, setEmbeds]"), viewer.indexOf("}, [embedded, supabase]);"));
    expect(fetched).toContain('.in("id", postIds)');
    expect(fetched).toContain('.in("id", shotIds)');
    expect((fetched.match(/\.is\("removed_at", null\)/g) ?? []).length).toBe(2);
  });

  it("one that comes back as nothing is marked gone rather than drawn blank", () => {
    const fetched = viewer.slice(viewer.indexOf("const [embeds, setEmbeds]"), viewer.indexOf("}, [embedded, supabase]);"));
    expect(fetched).toContain("next[layer.id] = found ?? { thumb: null, caption: null, gone: true };");
  });

  it("and a gone one stops being a door to it", () => {
    // Scoped to the embed branch: `editing` appears in every branch, so
    // a file-wide check would pass with this condition reverted.
    const branch = view.slice(view.indexOf('    case "post":'));
    expect(branch).toContain("if (editing || embed?.gone) return body;");
    expect(branch).toContain('? `This ${layer.type === "post" ? "post" : "Shot"} is gone`');
  });

  it("nothing is asked for when the Show embeds nothing", () => {
    const fetched = viewer.slice(viewer.indexOf("const [embeds, setEmbeds]"), viewer.indexOf("}, [embedded, supabase]);"));
    expect(fetched).toContain("if (embedded.length === 0) return;");
  });

  it("and the picker offers only your own", () => {
    // A picker over everybody's would be a way of hanging a stranger's
    // picture on your Show.
    const sheet = pickers.slice(pickers.indexOf("export function EmbedSheet"));
    expect((sheet.match(/\.eq\("user_id", me\)/g) ?? []).length).toBe(2);
    expect(sheet).toContain("const me = auth.user?.id;");
  });
});

describe("a mention placed on the picture reaches its owner", () => {
  const layer = (over: Partial<ShowLayer>): ShowLayer =>
    ({ id: "a", type: "mention", x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload: { username: "naitik" }, ...over }) as ShowLayer;

  it("every mention layer is listed", () => {
    expect(
      layerMentions([layer({ id: "a" }), layer({ id: "b", payload: { username: "aman" } })]),
    ).toEqual(["naitik", "aman"]);
  });

  it("each of them once, however many times it was placed", () => {
    expect(layerMentions([layer({ id: "a" }), layer({ id: "b" })])).toEqual(["naitik"]);
  });

  it("and nothing else is a mention", () => {
    expect(
      layerMentions([
        layer({ id: "s", type: "sticker", payload: { emoji: "🔥" } }),
        layer({ id: "t", type: "text", payload: { text: "@naitik" } }),
      ]),
    ).toEqual([]);
  });

  it("the name is already lowercased by the time it is a layer", () => {
    // readPayload lowercases it, so the trigger's lower(username) match
    // is comparing like with like.
    const [one] = readLayers([layer({ payload: { username: "NaiTik" } })]);
    expect(one.payload).toEqual({ username: "naitik" });
    expect(layerMentions([one])).toEqual(["naitik"]);
  });

  it("and the insert sends them beside the caption's own", () => {
    // shows.mentions is what the 0180 trigger reads. A mention layer
    // that did not join it would be a mention that reaches nobody —
    // which is exactly what caption mentions did before 0180.
    const insert = publishLib.slice(publishLib.indexOf('.from("shows")\n    .insert({'));
    expect(insert.slice(0, 900)).toContain(
      "mentions: [...new Set([...extractMentions(text), ...layerMentions(layers)])],",
    );
  });

  it("empty when there are none, so a Show with no layers sends what it always did", () => {
    expect(layerMentions([])).toEqual([]);
  });
});

describe("the arrangement reaches the column", () => {
  it("the insert sends it", () => {
    const insert = publishLib.slice(publishLib.indexOf('.from("shows")\n    .insert({'));
    expect(insert.slice(0, 900)).toContain("layers: layers as unknown as Json,");
  });

  it("and the editor is on the way there for a photo Show", () => {
    expect(create).toContain('if (captured && mode === "show" && !isVideoFile(captured) && arranged === null) {');
    expect(create).toContain("<ShowArrange\n          file={captured}\n          onCancel={back}");
    expect(create).toContain("if (!drawing || drawing.strokes.length === 0) return setArranged(layers);");
  });

  it("the blob URL is minted only once the editor is on screen", () => {
    // useObjectUrl takes a File and cannot be called for a `captured`
    // that may be null, and a video Show never reaches the editor.
    expect(create).toContain("function ShowArrange({");
    expect(create).toContain("photoUrl={useObjectUrl(file)}");
  });

  it("and stepping back to it is one step, like the Shot's caption → editor", () => {
    const back = create.slice(create.indexOf("function back() {"), create.indexOf("useOverlayBackButton(true, back)"));
    expect(back).toContain('if (arranged && mode === "show" && !isVideoFile(captured)) {\n        setDrawn(null);\n        return setArranged(null);');
  });

  it("what is published is what the parser accepts, not what the editor held", () => {
    expect(editor).toContain("onPublish(readLayers(layers), strokes.length ? { strokes, frame } : null)");
  });
});

describe("two layers do not land on the same spot", () => {
  it("each one steps down and across from the last", () => {
    // Every layer used to arrive at exactly DROP, so the second widget
    // covered the first and it read as nothing having happened. Found by
    // adding a link and then a question in a real browser.
    expect(editor).toContain("function dropAt(count: number) {");
    expect(editor).toContain("const layer = { id: freshId(), type, ...dropAt(layers.length), look: 0, payload } as ShowLayer;");
    expect(editor).not.toContain("type, ...DROP, look: 0");
  });

  it("and the walk wraps rather than running off the bottom", () => {
    const fn = editor.slice(editor.indexOf("function dropAt(count: number) {"), editor.indexOf("function freshId()"));
    expect(fn).toContain("const step = count % 6;");
    // The sixth step is the furthest: it has to stay inside the frame.
    expect(0.45 + 5 * 0.055).toBeLessThan(0.8);
    expect(0.5 + 5 * 0.035).toBeLessThan(0.8);
  });
});
