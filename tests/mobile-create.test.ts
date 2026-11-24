import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { newPost, photoPath, PHOTO_BUCKET } from "../apps/mobile/src/create/post";
import { DESTINATIONS } from "../packages/core/src/navigation";
import { extractHashtags, extractMentions } from "../packages/core/src/content-utils";

/**
 * Taking a photo and posting it.
 *
 * The row this writes is read by the website, by the feed, by every
 * grid and share card — so the shape matters more than the screen does,
 * and it is what most of this tests.
 */

const WEB_UPLOAD = "src/components/upload/UploadProvider.tsx";
const POST = "apps/mobile/src/create/post.ts";
const SCREEN = "apps/mobile/app/create.tsx";
const LAYOUT = "apps/mobile/app/(tabs)/_layout.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the row a phone post writes is the row the website writes", () => {
  it("image_urls is the photos, and never null", () => {
    /*
     * A NOT NULL column with a `[]` default. Sending null breaks a
     * text-only post, which is the web's own note.
     */
    expect(newPost({ userId: "u", caption: "hi", urls: ["a.jpg"] }).image_urls).toEqual([
      "a.jpg",
    ]);
    expect(newPost({ userId: "u", caption: "hi", urls: [] }).image_urls).toEqual([]);
  });

  it("media is null for a post with no photo, not an empty array", () => {
    // "Nothing to describe" and "describes nothing" are different, and a
    // reader checking `media` for truthiness sees the difference.
    expect(newPost({ userId: "u", caption: "hi", urls: [] }).media).toBeNull();
    expect(newPost({ userId: "u", caption: "hi", urls: ["a.jpg"] }).media).toEqual([
      { kind: "image", url: "a.jpg", alt: null },
    ]);
  });

  it("image_url is the cover, decided by core rather than taken as the first", () => {
    /*
     * For a photo post they are the same. They are not for a post that
     * opens with a clip — which would otherwise have no thumbnail
     * anywhere a grid or a share card looks — and taking `urls[0]` here
     * would be right today and wrong the moment video capture lands.
     */
    expect(newPost({ userId: "u", caption: "", urls: ["a.jpg", "b.jpg"] }).image_url).toBe(
      "a.jpg",
    );
    expect(newPost({ userId: "u", caption: "words only", urls: [] }).image_url).toBeNull();
    expect(body(POST)).toMatch(/image_url: coverOf\(slots\)/);
    expect(body(POST), "the cover is being guessed rather than asked for").not.toMatch(
      /image_url: args\.urls\[0\]/,
    );
  });

  it("hashtags and mentions come from core, so a caption indexes the same", () => {
    const caption = "golden hour with @maya #art #photography";
    const row = newPost({ userId: "u", caption, urls: [] });
    expect(row.hashtags).toEqual(extractHashtags(caption));
    expect(row.mentions).toEqual(extractMentions(caption));
    expect(row.hashtags.length).toBeGreaterThan(0);
    expect(row.mentions.length).toBeGreaterThan(0);
  });

  it("the caption is trimmed, and what is indexed is what is stored", () => {
    const row = newPost({ userId: "u", caption: "  #art  ", urls: [] });
    expect(row.caption).toBe("#art");
    expect(row.hashtags).toEqual(extractHashtags("#art"));
  });

  it("and the website writes the same four fields the same way", () => {
    const web = code(WEB_UPLOAD);
    expect(web).toMatch(/image_url: coverOf\(slots\)/);
    expect(web).toMatch(/image_urls: urls/);
    expect(web).toMatch(/media: slots\.length \? slots : null/);
  });
});

describe("where a photo goes", () => {
  it("the website's bucket", () => {
    expect(PHOTO_BUCKET).toBe("post-images");
    expect(code(WEB_UPLOAD)).toMatch(/from\("post-images"\)/);
  });

  it("under the author's own id, which is what the storage policy keys on", () => {
    /*
     * A path that does not start with the uploader's id is refused, and
     * the refusal reads as a generic upload failure.
     */
    const path = photoPath("user-123", 1700000000000);
    expect(path.startsWith("user-123/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
  });

  it("and two photos in the same millisecond do not collide", () => {
    // `upsert: false`, so a collision is a refused upload rather than a
    // silently overwritten photo — but a refusal here is still a post
    // that fails for no reason the person can see.
    const a = photoPath("u", 1700000000000);
    const b = photoPath("u", 1700000000000);
    expect(a).not.toBe(b);
    expect(body(POST)).toMatch(/upsert: false/);
  });
});

describe("the upload failure that would be invisible", () => {
  it("bytes are read from the capture, not handed over as a file object", () => {
    /*
     * supabase-js cannot take a React Native file object: it uploads zero
     * bytes and reports success, so the post appears with a broken
     * picture and nothing anywhere says why.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/await fetch\(stage\.photo\.uri\)/);
    expect(src).toMatch(/\.arrayBuffer\(\)/);
    expect(body(POST)).toMatch(/file: ArrayBuffer/);
  });

  it("and the reason is written where someone might simplify it away", () => {
    expect(read(SCREEN)).toMatch(/zero bytes/);
    expect(read(POST)).toMatch(/zero bytes/);
  });

  it("a failed upload does not write a post", () => {
    const src = body(SCREEN);
    const post = src.slice(src.indexOf("const post = useCallback"), src.indexOf("if (!permission)"));
    const uploadAt = post.indexOf('if ("error" in uploaded)');
    const createAt = post.indexOf("await createPost(");
    expect(uploadAt, "the upload result is not checked").toBeGreaterThan(-1);
    expect(createAt, "nothing writes the post").toBeGreaterThan(-1);
    expect(uploadAt, "the post is written before the upload is checked").toBeLessThan(createAt);
    expect(post).toMatch(/setError\(uploaded\.error\)/);
  });

  it("and a failure returns to the review, so the photo is not lost", () => {
    // Dropping back to the camera would throw away the photo they took,
    // which is the one thing that cannot be recovered.
    const src = body(SCREEN);
    expect(
      [...src.matchAll(/setStage\(\{ kind: "review", photo: stage\.photo \}\)/g)].length,
      "a failure path does not keep the photo",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("the camera asks for permission like a phone should", () => {
  it("on the screen, not at launch", () => {
    /*
     * A phone that demands the camera before showing anything is one
     * people refuse. The permission hook is used on this screen and
     * nowhere earlier.
     */
    expect(body(SCREEN)).toMatch(/useCameraPermissions\(\)/);
    expect(body("apps/mobile/app/_layout.tsx"), "permission is asked at launch").not.toMatch(
      /useCameraPermissions/,
    );
  });

  it("a refusal says what it means, and offers the right next step", () => {
    /*
     * Two different states. "Not asked yet" can be asked again; "turned
     * off" cannot, and offering a button that does nothing is worse than
     * saying where the setting is.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/permission\.canAskAgain/);
    expect(src).toMatch(/Allow the camera/);
    expect(src).toMatch(/turned off for Hypefy/);
  });

  it("and the manifest carries the strings a store review reads", () => {
    /*
     * **The microphone rationale is gone, and its absence is the
     * assertion now.** It was set up here in preparation for video
     * capture, which was then deliberately left out — so the app was
     * declaring a microphone permission, and a reason for it, for a
     * feature it does not have. Play wants a demonstrable in-app use, and
     * a social app asking for the microphone with no voice feature is a
     * review risk as well as a trust problem.
     *
     * The pairing lives in tests/mobile-permissions.test.ts, which fails
     * both ways: when a permission is requested without its feature, and
     * when the feature arrives without the permission. So the day video
     * capture lands, that is what says to put this back.
     */
    const app = JSON.parse(read("apps/mobile/app.json"));
    const camera = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === "expo-camera",
    );
    expect(camera, "expo-camera is not configured as a plugin").toBeTruthy();
    expect(camera[1].cameraPermission).toMatch(/Hypefy/);
    expect(camera[1].microphonePermission, "nothing records audio").toBeUndefined();
  });
});

describe("the screen can be reached, and what it does not do", () => {
  it("a create button in the bar, as the web has", () => {
    /*
     * Creating is an ACTION, not a place — it is deliberately not in
     * core's DESTINATIONS, and the web renders a button between its nav
     * items for the same reason.
     */
    expect(DESTINATIONS.some((d) => d.href === "/create"), "create became a destination").toBe(
      false,
    );
    const layout = body(LAYOUT);
    expect(layout).toMatch(/function CreateButton\(\)/);
    expect(layout).toMatch(/router\.push\("\/create"\)/);
    expect(layout).toMatch(/tabBarButton: \(\) => <CreateButton \/>/);
    expect(existsSync(SCREEN)).toBe(true);
  });

  it("the slot it hangs on redirects rather than showing a blank tab", () => {
    const slot = body("apps/mobile/app/(tabs)/create-slot.tsx");
    expect(slot).toMatch(/<Redirect href="\/create" \/>/);
  });

  it("the camera has a way out", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Close the camera"/);
    expect(src).toMatch(/router\.back\(\)/);
  });

  it("posting goes to Home rather than back to a loaded camera", () => {
    // Going back to a camera still holding a posted photo is a way to
    // post it twice.
    const src = body(SCREEN);
    expect(src).toMatch(/router\.replace\("\/home"\)/);
  });

  it("video is not captured, even though the camera could", () => {
    /*
     * A Shot needs a trim, a poster frame and an upload that survives
     * backgrounding. A record button producing an untrimmed clip with no
     * thumbnail would be worse than no record button.
     */
    const src = body(SCREEN);
    expect(src, "recording appeared without the rest of what a Shot needs").not.toMatch(
      /recordAsync|stopRecording/,
    );
    expect(read(SCREEN)).toMatch(/Video is NOT captured/);
  });

  it("and what else the web does is written down", () => {
    const src = read(POST);
    for (const absent of ["Shrinking before upload", "background upload queue"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });
});
