import { describe, it, expect } from "vitest";
import { presenceLabel } from "@/lib/presence";

const ago = (secs: number) => new Date(Date.now() - secs * 1000).toISOString();

describe("presenceLabel", () => {
  it("returns null when unknown", () => {
    expect(presenceLabel(null)).toBeNull();
    expect(presenceLabel(undefined)).toBeNull();
  });

  it("is online within 90s", () => {
    expect(presenceLabel(ago(10))).toEqual({ online: true, text: "Active now" });
  });

  it("formats minutes/hours/days ago", () => {
    expect(presenceLabel(ago(5 * 60))).toEqual({ online: false, text: "Active 5m ago" });
    expect(presenceLabel(ago(3 * 3600))).toEqual({ online: false, text: "Active 3h ago" });
    expect(presenceLabel(ago(2 * 86400))).toEqual({ online: false, text: "Active 2d ago" });
  });
});
