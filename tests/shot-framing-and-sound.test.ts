import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Two things about a Shot you have just filmed.
 *
 * It was being zoomed. The player was object-cover, so a clip that was not
 * already 9:16 got blown up until it filled the stage and its sides or ends
 * were gone. Nothing re-encodes the file on the way up — UploadProvider
 * hands storage the File it was given — so the whole frame was always in
 * the upload; only the player threw it away. Contained now, so what was
 * filmed is what plays, black bands and all.
 *
 * And the caption screen was silent. Its video carried a bare `muted` with
 * no control anywhere, so you wrote the caption against a clip you could
 * not hear. It still starts muted, because a browser will not autoplay
 * sound and a refused play leaves a frozen frame, but there is a button —
 * pressing it is the gesture that makes sound allowed.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const reels = read("src/components/shots/ReelsFeed.tsx");
const preview = read("src/components/create/ShotPreview.tsx");
const uploader = read("src/components/upload/UploadProvider.tsx");

describe("a Shot plays at the shape it was filmed", () => {
  it("the reel player contains the clip rather than cropping it", () => {
    // The class on the element, not the word: the comment beside it explains
    // the whole decision and says "object-cover" while doing so.
    expect(reels).toMatch(/className=\{`absolute top-0 bg-black object-contain /);
    expect(reels).not.toMatch(/className=\{`absolute top-0 bg-black object-cover /);
  });

  it("and nothing re-encodes or crops it on the way up", () => {
    // If the upload ever started redrawing frames, contain in the player
    // would stop being enough — the crop would already be baked in.
    for (const banned of ["drawImage", "MediaRecorder", "captureStream"]) {
      expect(uploader, banned).not.toContain(banned);
    }
    expect(uploader).toContain(".upload(path, a.file,");
  });
});

describe("the caption screen can be heard", () => {
  it("its video is muted by state, not by a bare attribute", () => {
    expect(preview).toContain("muted={previewMuted}");
  });

  it("and there is something to press", () => {
    expect(preview).toContain("setPreviewMuted((m) => !m)");
    expect(preview).toContain("Turn sound on");
  });

  it("starting silent, because autoplay with sound is refused", () => {
    // Not a preference. Shipping it unmuted means the clip does not play at
    // all on the screen whose job is showing you the clip.
    expect(preview).toContain("const [previewMuted, setPreviewMuted] = useState(true);");
  });
});
