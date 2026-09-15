import { describe, it, expect } from "vitest";
import { videoConstraints } from "@/lib/useCamera";

/**
 * On a phone the camera must never be cropped to a 9:16 shape: sensors are
 * landscape, and Chrome's crop kept about a third of the width (a 3x zoom).
 */
describe("camera constraints", () => {
  it("asks a phone for the sensor's own, uncropped picture", () => {
    const c = videoConstraints("environment", true, true) as Record<string, unknown>;
    expect(c.resizeMode).toEqual({ ideal: "none" });
    expect(c.aspectRatio).toBeUndefined();
    expect(c.facingMode).toEqual({ ideal: "environment" });
  });

  it("still crops a desktop webcam to portrait for a Shot", () => {
    const c = videoConstraints("user", true, false) as Record<string, unknown>;
    expect(c.resizeMode).toBeUndefined();
    expect(c.aspectRatio).toEqual({ ideal: 9 / 16 });
  });
});
