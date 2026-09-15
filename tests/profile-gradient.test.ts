import { describe, it, expect } from "vitest";
import { BANNERS, customGradient, isHexColor, profileBackground } from "@/lib/profile";
import { GRADIENT_PRESETS } from "@/components/profile/GradientPicker";

/**
 * Your own two colours are a Premium background: drawn while you have
 * Premium, quietly back to the preset when you don't.
 */
describe("a profile gradient", () => {
  const colors = ["#331163", "#0b0b14"];

  it("draws only for Premium", () => {
    expect(customGradient(colors, true)).toBe("linear-gradient(160deg, #331163 0%, #0b0b14 100%)");
    expect(customGradient(colors, false)).toBeNull();
  });

  it("refuses anything that isn't two hex colours", () => {
    expect(customGradient(["#331163"], true)).toBeNull();
    expect(customGradient(["red", "blue"], true)).toBeNull();
    expect(customGradient(["#331163", "url(x)"], true)).toBeNull();
    expect(customGradient(null, true)).toBeNull();
    expect(isHexColor("#ABCDEF")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
  });

  it("falls back to the banner they chose, then the default", () => {
    expect(profileBackground({ banner_colors: colors, is_premium: false, banner_id: "purple-night" })).toBe(BANNERS[1].gradient);
    expect(profileBackground({ banner_id: "nope" })).toBe(BANNERS[0].gradient);
    expect(profileBackground({ banner_colors: colors, is_premium: true })).toContain("#331163");
  });

  it("offers presets that are themselves valid", () => {
    for (const p of GRADIENT_PRESETS) expect(customGradient(p, true)).toBeTruthy();
  });
});
