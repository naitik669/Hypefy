// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { SPEEDS, nextSpeed, readSpeed, speedLabel, writeSpeed } from "@/lib/voice-speed";

/**
 * How fast voice notes play.
 *
 * A long voice note is unskippable at normal speed, which is the whole
 * complaint. A listener who wants them quick wants them quick for all of
 * them, so the choice belongs to the device rather than to the message.
 */

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("the loop", () => {
  it("goes round and comes back to normal", () => {
    expect(nextSpeed(1)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
  });

  it("and a speed that is not one of ours still lands somewhere real", () => {
    // A stored value from a future version, or junk. Whatever it is, the
    // next tap has to leave the listener somewhere they can get out of.
    for (const odd of [0, 3, -1, 1.25, Number.NaN]) {
      expect(SPEEDS).toContain(nextSpeed(odd));
    }
  });

  it("reads short enough to sit on the bubble", () => {
    expect(speedLabel(1)).toBe("1×");
    expect(speedLabel(1.5)).toBe("1.5×");
    expect(speedLabel(2)).toBe("2×");
  });
});

describe("remembering it", () => {
  it("what you chose is what the next note plays at", () => {
    writeSpeed(2);
    expect(readSpeed()).toBe(2);
  });

  it("nothing chosen is normal", () => {
    expect(readSpeed()).toBe(1);
  });

  it("and a value the app does not know is normal, not whatever it says", () => {
    // Otherwise a bad write leaves somebody at a speed with no way back.
    for (const junk of ["9", "abc", "", "1.25"]) {
      localStorage.setItem("hypefy_voice_speed", junk);
      expect(readSpeed(), junk).toBe(1);
    }
  });

  it("a disk that refuses is normal rather than a crash", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSpeed()).toBe(1);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeSpeed(2)).not.toThrow();
  });
});

describe("the player uses it", () => {
  const voice = readFileSync("src/components/messages/VoiceMessage.tsx", "utf8").replace(
    /\r\n/g,
    "\n",
  );

  it("applies it to the audio, not just to the label", () => {
    expect(voice).toContain("audio.playbackRate = speed;");
  });

  it("including a note that is already playing when you tap", () => {
    // Changing it should take effect in the sentence you are listening
    // to, not the next one.
    // The effect that applies it has to depend on it, or changing the
    // speed does nothing until something else re-renders the bubble.
    const at = voice.indexOf("audio.playbackRate = speed;");
    expect(at).toBeGreaterThan(-1);
    expect(voice.slice(at, at + 120)).toContain("}, [speed, loaded]);");
  });

  it("and the choice is kept, not reset on every bubble", () => {
    expect(voice).toContain("readSpeed()");
    expect(voice).toContain("writeSpeed(");
  });
});
