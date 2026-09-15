import { describe, it, expect } from "vitest";
import { customGradient, isHexColor, profileBackground } from "@/lib/profile";
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

  it("leaves the profile plain when there are no colours, or no Premium", () => {
    expect(profileBackground({ profile_colors: colors, is_premium: false })).toBeNull();
    expect(profileBackground({})).toBeNull();
    expect(profileBackground({ profile_colors: colors, is_premium: true })).toContain("#331163");
  });

  it("offers presets that are themselves valid", () => {
    for (const p of GRADIENT_PRESETS) expect(customGradient(p, true)).toBeTruthy();
  });
});
