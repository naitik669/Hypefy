import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * Hypefy's own icons are the same shape on the phone as on the site.
 *
 * These three are hand-drawn in `src/components/ui/`, so unlike Lucide and
 * Phosphor there is no package to pin — the geometry is path data, and the
 * native copy is a copy. A copy with nothing checking it goes stale: the
 * star gets a point adjusted on the website, the phone keeps drawing the
 * old one, and nobody notices because nobody has both open at once.
 *
 * So every `d` string committed on the native side is asserted to appear,
 * character for character, in the web component it came from.
 */

const NATIVE = "apps/mobile/src/glyphs.tsx";

/** Which web component each native glyph was taken from. */
const SOURCES: ReadonlyArray<readonly [string, string]> = [
  ["HypeIcon", "src/components/ui/HypeIcon.tsx"],
  ["CommentIcon", "src/components/ui/CommentIcon.tsx"],
  ["ShareIcon", "src/components/ui/ShareIcon.tsx"],
];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Every `d="…"` in a file, in order. */
function paths(src: string): string[] {
  return [...src.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
}

/** The native file, sliced to one exported component. */
function nativeGlyph(name: string): string {
  const src = read(NATIVE);
  const start = src.indexOf(`export function ${name}(`);
  expect(start, `${name} is not exported from ${NATIVE}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.indexOf("\nexport function ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the hand-drawn icons match the website's", () => {
  for (const [name, webFile] of SOURCES) {
    it(`${name}: every committed path appears in ${webFile}`, () => {
      expect(existsSync(webFile), `${webFile} has moved`).toBe(true);
      const web = read(webFile);
      const committed = paths(nativeGlyph(name));

      expect(committed.length, `${name} committed no path data`).toBeGreaterThan(0);
      for (const d of committed) {
        expect(web, `${name}: this path is not in the web component any more:\n  ${d}`).toContain(d);
      }
    });
  }

  it("HypeIcon is the star, and only the star", () => {
    // One path. If the web grows a second element the native copy is
    // incomplete, and "every committed path is in the web" would still
    // pass — this is the assertion that catches a MISSING piece rather
    // than a changed one.
    expect(paths(nativeGlyph("HypeIcon")).length).toBe(1);
    expect(paths(read("src/components/ui/HypeIcon.tsx")).length).toBe(1);
  });

  it("CommentIcon is the bubble, and only the bubble", () => {
    expect(paths(nativeGlyph("CommentIcon")).length).toBe(1);
    expect(paths(read("src/components/ui/CommentIcon.tsx")).length).toBe(1);
  });

  it("ShareIcon takes the two paths of the share glyph, not the other three", () => {
    /*
     * ShareIcon.tsx exports four glyphs through one wrapper — Share, Send,
     * ShareNodes and Flip — so a blunt "same number of paths" check would
     * be wrong here. The share arrow is the first two, and they are named
     * so a reorder in that file is visible rather than silently pulling in
     * somebody else's geometry.
     */
    const committed = paths(nativeGlyph("ShareIcon"));
    expect(committed).toEqual([
      "M13.5 3.5 21 10.5l-7.5 7",
      "M21 10.5H11c-4.5 0-8 3.6-8 8.5",
    ]);
    const web = paths(read("src/components/ui/ShareIcon.tsx"));
    expect(web.slice(0, 2)).toEqual(committed);
  });

  it("all three are drawn on the same 24 grid the web uses", () => {
    const native = read(NATIVE);
    expect(native).toMatch(/const BOX = "0 0 24 24"/);
    for (const [, webFile] of SOURCES) {
      expect(read(webFile), `${webFile} is no longer 24x24`).toContain('viewBox="0 0 24 24"');
    }
  });

  it("the verified badge's star is the web's star, rebuilt from its own array", () => {
    /*
     * This one cannot be a `toContain`, and that is the point: the web
     * declares the star as an ARRAY of commands with a comment naming each
     * vertex, joined with a space. So the path string the browser draws
     * exists nowhere in the source — asserting the committed `d` appeared
     * in the file would always fail, and the obvious "fix" is to loosen the
     * test until it passes, which proves nothing.
     *
     * It is rebuilt the way the web builds it instead, so a vertex moved on
     * the site fails here with the two paths printed side by side.
     */
    const web = read("src/components/ui/VerifiedStar.tsx");
    const block = web.match(/const STAR = \[([\s\S]*?)\]\.join\(" "\)/);
    expect(block, "the web's STAR is no longer an array joined with a space").toBeTruthy();
    const commands = [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(commands.length, "the star no longer has ten vertices and a close").toBe(11);
    expect(commands.at(-1)).toBe("Z");

    const committed = paths(nativeGlyph("VerifiedStar"));
    expect(committed.length, "the badge committed more or fewer than one path").toBe(1);
    expect(committed[0]).toBe(commands.join(" "));
  });

  it("the badge's squircle and its light are the web's", () => {
    const web = read("src/components/ui/VerifiedStar.tsx");
    const native = read(NATIVE);

    // The plate: one rect, same box, same corner.
    const rect = web.match(/<rect x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="(\d+)" rx="([\d.]+)"/);
    expect(rect, "the web's badge no longer draws a rounded rect").toBeTruthy();
    expect(native).toContain(
      `<Rect x="${rect?.[1]}" y="${rect?.[2]}" width="${rect?.[3]}" height="${rect?.[4]}" rx="${rect?.[5]}"`,
    );

    // The gradient: bright at the top, deep below, top to bottom.
    const stops = [...web.matchAll(/stopColor="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    expect(stops.length, "the web's badge no longer has two stops").toBe(2);
    for (const c of stops) expect(native, `${c} is missing from the badge`).toContain(c);
    expect(web).toContain('x1="0" y1="0" x2="0" y2="1"');
    expect(native).toMatch(/LinearGradient id=\{VERIFIED_LIT\} x1="0" y1="0" x2="0" y2="1"/);
  });

  it("and the star is stroked in its own fill, which is what rounds its corners", () => {
    /*
     * Without the stroke the ten corners are sharp, and at sixteen pixels
     * that reads as a different mark. The web's own comment says so; this
     * asserts the phone kept it, and kept the same width.
     */
    const web = read("src/components/ui/VerifiedStar.tsx");
    const m = web.match(/fill="#fff" stroke="#fff" strokeWidth="([\d.]+)" strokeLinejoin="round"/);
    expect(m, "the web no longer strokes the star in its own fill").toBeTruthy();
    const glyph = nativeGlyph("VerifiedStar");
    expect(glyph).toContain('fill="#fff"');
    expect(glyph).toContain('stroke="#fff"');
    expect(glyph).toContain(`strokeWidth="${m?.[1]}"`);
    expect(glyph).toContain('strokeLinejoin="round"');
  });

  it("and the stroke joins are round on both sides", () => {
    // A mitre instead of a round join turns the star's points into
    // spikes. Cheap to assert, and invisible until somebody looks.
    const native = read(NATIVE);
    expect(native).toMatch(/strokeLinejoin="round"/);
    expect(native).toMatch(/strokeLinecap="round"/);
  });
});
