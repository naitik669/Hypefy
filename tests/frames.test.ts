import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FRAME_REACH, framePlacement, frameUrl, wearableFrame, type FrameCatalog } from "@/lib/frames";
import { DECORATIONS } from "@/lib/cosmetics";
import { buildItems } from "@/lib/marketplace";

const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
const frameComp = read("src/components/ui/AvatarFrame.tsx");
const migration = read("supabase/migrations/0138_frame_assets.sql");
const admin = read("src/components/admin/CosmeticsAdmin.tsx");
const page = read("src/app/(app)/admin/cosmetics/page.tsx");
const placement = read("src/components/admin/FramePlacement.tsx");
const placer = read("src/components/admin/FramePlacer.tsx");
const replace = read("supabase/migrations/0141_place_existing_frame.sql");

const asset = (over: Partial<FrameCatalog[string]> = {}): FrameCatalog[string] => ({
  id: "deco-x",
  label: "X",
  tier: "premium",
  url: "https://example.test/x.svg",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  ...over,
});

/**
 * Frames that come from a file rather than from code.
 */

describe("where the art sits", () => {
  it("at rest it spans twice the avatar, centred on it", () => {
    // The same square the hand-drawn frames use: the photo is the middle,
    // and a frame may reach half an avatar past it on every side.
    const box = framePlacement(100, asset());
    expect(box.width).toBe(200);
    expect(box.height).toBe(200);
    expect(box.left).toBe(-50);
    expect(box.top).toBe(-50);
    expect(FRAME_REACH).toBe(0.5);
  });

  it("scale grows it about the avatar's centre, not its corner", () => {
    const box = framePlacement(100, asset({ scale: 1.5 }));
    expect(box.width).toBe(300);
    // Centre stays put: left + half the width is still the avatar's middle.
    expect(box.left + box.width / 2).toBe(50);
    expect(box.top + box.height / 2).toBe(50);
  });

  it("offsets are avatar widths, so one placement holds at every size", () => {
    // A frame nudged right by a tenth is nudged by a tenth at 24px and at
    // 150px, which is the whole point of not storing pixels.
    for (const size of [24, 56, 150]) {
      const box = framePlacement(size, asset({ offsetX: 0.1, offsetY: -0.05 }));
      expect((box.left + box.width / 2 - size / 2) / size).toBeCloseTo(0.1, 6);
      expect((box.top + box.height / 2 - size / 2) / size).toBeCloseTo(-0.05, 6);
    }
  });

  it("builds a public URL from a storage path", () => {
    expect(frameUrl("https://x.supabase.co", "frames/a.svg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/cosmetics/frames/a.svg",
    );
    // A trailing slash on the base must not double up.
    expect(frameUrl("https://x.supabase.co/", "frames/a.svg")).toContain(".co/storage");
  });
});

describe("who may wear what", () => {
  const catalog: FrameCatalog = {
    "deco-free": asset({ id: "deco-free", tier: "free" }),
    "deco-paid": asset({ id: "deco-paid", tier: "premium" }),
  };

  it("a premium frame shows only while its wearer has premium", () => {
    expect(wearableFrame({ avatar_decoration: "deco-paid", is_premium: true }, catalog)?.id).toBe("deco-paid");
    expect(wearableFrame({ avatar_decoration: "deco-paid", is_premium: false }, catalog)).toBeNull();
  });

  it("a free one shows for anybody", () => {
    expect(wearableFrame({ avatar_decoration: "deco-free", is_premium: false }, catalog)?.id).toBe("deco-free");
  });

  it("a retired or unknown id draws nothing rather than a gap", () => {
    // Retiring an item takes it out of the catalogue, which is what makes
    // one switch-off reach every surface without touching a profile row.
    expect(wearableFrame({ avatar_decoration: "deco-gone", is_premium: true }, catalog)).toBeNull();
    expect(wearableFrame({ avatar_decoration: null }, catalog)).toBeNull();
    expect(wearableFrame(null, catalog)).toBeNull();
  });
});

describe("the catalogue", () => {
  it("one frame is still drawn in code, and it is Bolt", () => {
    expect(DECORATIONS.map((d) => d.id)).toEqual(["deco-bolt"]);
    expect(frameComp).toContain('const DRAWN = new Set(["deco-bolt"])');
  });

  it("uploaded frames reach the Marketplace, where a frame is found", () => {
    const items = buildItems({}, [{ id: "deco-new", label: "New", tier: "free" }]);
    const frames = items.filter((i) => i.category === "frame").map((i) => i.id);
    expect(frames).toContain("deco-bolt");
    expect(frames).toContain("deco-new");
  });
});

describe("an uploaded SVG never becomes script", () => {
  it("is drawn in an img, never inlined", () => {
    // An uploaded SVG put straight into the DOM can carry script; inside an
    // img it cannot run.
    expect(frameComp).toContain("<img");
    expect(frameComp).not.toContain("dangerouslySetInnerHTML");
  });

  it("only SVG or PNG, and only a small one, gets as far as the upload", () => {
    expect(admin).toContain('file.type === "image/png"');
    expect(admin).toContain('file.type === "image/svg+xml"');
    expect(admin).toContain("if (!png && !svg) {");
    expect(admin).toContain("MAX_BYTES");
  });

  it("is uploaded under its own type, not a hardcoded one", () => {
    // The bucket's allowlist checks what is declared, so a PNG sent as
    // image/svg+xml is refused — and would draw as a broken image even
    // if the bucket let it through.
    expect(admin).toContain('contentType: png ? "image/png" : "image/svg+xml"');
    expect(admin).toContain('${png ? "png" : "svg"}');
    expect(admin).not.toContain('contentType: "image/svg+xml",');
  });
});

describe("a PNG is pixels, and the form says so", () => {
  it("warns when it is too small for a profile", () => {
    // The biggest avatar is the profile's 84px and the art spans twice
    // that before scale, so a PNG under 512 shows on a phone.
    expect(admin).toContain("const PNG_MIN = 512;");
    expect(admin).toContain("const PNG_IDEAL = 1024;");
    expect(admin).toContain("It will soften on a profile");
  });

  it("warns about shape before sharpness, because the box is square", () => {
    expect(admin).toContain("It will be stretched to a square");
    const body = admin.slice(admin.indexOf("function measure("));
    expect(body.indexOf("stretched to a square")).toBeLessThan(body.indexOf("soften on a profile"));
  });

  it("warns rather than refuses", () => {
    // A frame meant for comment rows may genuinely not need more, and
    // that is a judgement about the artwork, not a rule for the form.
    const body = admin.slice(admin.indexOf("function measure("), admin.indexOf("async function publish"));
    expect(body).not.toContain("return setNote");
    expect(body).not.toContain("setDraftFile(null)");
  });
});

describe("the desk is shut to everyone else", () => {
  it("fails closed — a failed lookup is not a way in", () => {
    expect(page).toContain('supabase.rpc("is_admin")');
    expect(page).toContain("if (meErr || isAdmin !== true) notFound()");
    // 404 rather than 403: a refusal tells you the page is there.
    expect(page).not.toContain("forbidden");
  });

  it("writes go through definer functions, not a grant on the table", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("if not public.is_admin() then");
    expect(migration).not.toContain("grant insert on public.products");
    expect(migration).not.toContain("grant update on public.products");
  });

  it("the bucket is public to read and admin-only to write", () => {
    expect(migration).toContain(`for select using (bucket_id = 'cosmetics')`);
    for (const verb of ["insert", "update", "delete"]) {
      expect(migration).toContain(`cosmetics: admin ${verb === "insert" ? "upload" : verb}`);
    }
    expect(migration).toContain("public.is_admin()");
  });

  it("a price cannot be set while nobody can pay one", () => {
    expect(migration).toContain("tier must be free or premium");
  });
});

describe("clearing the shelf", () => {
  it("retires rather than deletes, because purchases point at them", () => {
    expect(migration).toContain("update public.products set active = false");
    expect(migration).not.toMatch(/delete\s+from\s+public\.products/);
  });

  it("and clears the frames nobody can wear any more", () => {
    expect(migration).toContain("update public.profiles set avatar_decoration = null");
  });

  it("keeps Bolt", () => {
    expect(migration).toContain("id <> 'deco-bolt'");
  });
});

describe("the catalogue is readable", () => {
  it("is split into frames, chat bubbles and everything else", () => {
    // The list was one flat run of sixty-five rows with no idea what most
    // of them were.
    expect(admin).toContain('label: "Frames"');
    expect(admin).toContain('label: "Chat bubbles"');
    expect(admin).toContain('label: "Others"');
  });

  it("names each kind in words, not in column values", () => {
    expect(admin).toContain('avatar_decoration: "Frame"');
    expect(admin).toContain('bubble_style: "Chat bubble"');
    expect(admin).toContain('name_glow: "Name glow"');
    // The raw column value should not be what anyone reads.
    expect(admin).not.toContain('{row.kind.replace(/_/g, " ")}');
  });

  it("every item can be renamed, retiered, reordered and retired", () => {
    expect(admin).toContain("<CommitField");
    expect(admin).toContain("update(row, { tier: t })");
    expect(admin).toContain("move(row, -1)");
    expect(admin).toContain("update(row, { active: !row.active })");
  });

  it("a rename is one write, not one per keystroke", () => {
    // Each change here goes straight to the database, unlike the upload
    // form where nothing is written until Publish.
    expect(admin).toContain("onBlur={commit}");
    expect(admin).toContain("if (next && next !== value) onCommit(next)");
  });

  it("reordering swaps with a neighbour rather than renumbering the lot", () => {
    expect(admin).toContain("const swap = siblings[i + dir]");
  });
});

describe("the upload cap", () => {
  it("is half a megabyte, and the form says so", () => {
    expect(admin).toContain("const MAX_BYTES = 512 * 1024;");
    expect(admin).toContain("The cap is ${MAX_BYTES / 1024}KB");
  });

  it("is enforced by the bucket, not only by the form", () => {
    // 0138 created the bucket with neither a size limit nor a mime
    // allowlist, which every other bucket in the project has — so the
    // constant above was a convenience, and the bucket would have taken a
    // video named .svg.
    const m = read("supabase/migrations/0139_cosmetics_bucket_limits.sql");
    expect(m).toContain("file_size_limit = 512 * 1024");
    expect(m).toContain("'image/svg+xml'");
  });
});

describe("moving a frame that is already live", () => {
  it("has its own narrow function rather than going through the upsert", () => {
    // admin_save_frame would re-send name, tier and path, so a re-place
    // would overwrite a rename made in another tab, and would refuse
    // outright for a frame somebody had moved to the Shop tier.
    expect(replace).toContain("create or replace function public.admin_place_frame");
    for (const col of ["scale = p_scale", "offset_x = p_offset_x", "offset_y = p_offset_y", "rotation = p_rotation"]) {
      expect(replace).toContain(col);
    }
    expect(replace).not.toContain("name =");
    expect(replace).not.toContain("tier =");
    expect(replace).not.toContain("asset_path =");
  });

  it("is admin-only and unreachable signed out", () => {
    expect(replace).toContain("if not public.is_admin() then");
    expect(replace).toContain("errcode = '42501'");
    expect(replace).toContain("from public, anon");
    expect(replace).toContain("to authenticated");
  });

  it("checks the same bounds the placer clamps to", () => {
    // A definer function is reachable without the placer, so the limits
    // cannot live only in the component.
    expect(replace).toContain("p_scale < 0.25 or p_scale > 3");
    expect(replace).toContain("abs(p_offset_x) > 1 or abs(p_offset_y) > 1");
    expect(replace).toContain("abs(p_rotation) > 360");
    expect(placer).toContain("scale: [0.25, 3]");
    expect(placer).toContain("offset: [-1, 1]");
  });

  it("refuses a frame drawn in code, which has no artwork to move", () => {
    expect(replace).toContain("kind = 'avatar_decoration' and asset_path is not null");
    expect(replace).toContain("raise exception 'no uploaded frame with that id'");
    // And the panel is not offered for one either.
    expect(admin).toContain("{row.asset_path ? (");
    expect(admin).toContain("there is no artwork to move");
  });

  it("starts from what the catalogue says and writes nothing until Save", () => {
    expect(admin).toContain("scale: row.scale");
    expect(admin).toContain("offsetX: row.offset_x");
    expect(placement).toContain("useState<Placement>(saved)");
    // The only write in the panel is the Save button's.
    expect(placement).toContain("await onSave(place)");
    expect(placement.split("await onSave(").length - 1).toBe(1);
  });

  it("opening another frame starts a fresh draft", () => {
    // Keyed on the row, so React remounts instead of carrying the last
    // frame's numbers over — which an effect syncing them would have to.
    // Read the element itself: the row wrapper above is keyed too, so
    // looking for the key anywhere in the file proves nothing.
    const from = admin.indexOf("<FramePlacement");
    const element = admin.slice(from, admin.indexOf("/>", from));
    expect(from).toBeGreaterThan(-1);
    expect(element).toContain("key={row.id}");
    expect(placement).not.toContain("useEffect");
  });

  it("Save and Revert are dead until something actually moved", () => {
    expect(placement).toContain("place.scale !== saved.scale");
    expect(placement).toContain("place.rotation !== saved.rotation");
    expect(placement).toContain("disabled={!moved || busy}");
    expect(placement).toContain("onClick={() => setPlace(saved)}");
  });

  it("says out loud when a save is refused, and does not pretend it moved", () => {
    expect(admin).toContain("Could not move ${row.name}");
    // The refusal returns before setRows, so a frame nobody was allowed
    // to move does not appear moved until the next load says otherwise.
    const from = admin.indexOf("async function savePlacement");
    const body = admin.slice(from, admin.indexOf("\n  }", from));
    expect(body.indexOf("Could not move")).toBeLessThan(body.indexOf("setRows"));
    expect(body).toContain("return false");
  });
});

describe("the placer itself", () => {
  it("fits the view so the handles are always reachable", () => {
    // The art spans twice the avatar before any scaling, so the corner
    // and the turn handle fall outside the stage at most real
    // placements — clipped away if the canvas clips, drawn over the
    // controls beside it if it does not.
    expect(placer).toContain("const zoom = Math.min(1,");
    expect(placer).toContain("HANDLE_MARGIN");
    // Chrome is counter-scaled, so a handle stays the same size to the hand.
    expect(placer).toContain("const u = 1 / zoom");
  });

  it("measures a gesture in the stage's own un-zoomed pixels", () => {
    expect(placer).toContain("- stage / 2) * u + stage / 2");
  });

  it("offers all three gestures", () => {
    for (const kind of ["move", "scale", "rotate"]) {
      expect(placer).toContain(`begin("${kind}")`);
    }
    expect(placer).toContain('aria-label="Rotation"');
    expect(placer).toContain('aria-label="Size"');
  });
});
