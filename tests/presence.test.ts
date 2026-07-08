import { describe, it, expect } from "vitest";
import { presenceLabel } from "@/lib/presence";

const ago = (secs: number) => new Date(Date.now() - secs * 1000).toISOString();

describe("presenceLabel", () => {
  it("returns null when unknown", () => {
    expect(presenceLabel(null)).toBeNull();
    expect(presenceLabel(undefined)).toBeNull();
  });

  it("is online within 90s", () => {
    expect(presenceLabel(ago(10))).toEqual({ status: "online", online: true, text: "Active now" });
  });

  it("is idle between 90s and 5min", () => {
    expect(presenceLabel(ago(2 * 60))).toEqual({ status: "idle", online: false, text: "Idle" });
  });

  it("formats minutes/hours/days ago", () => {
    expect(presenceLabel(ago(6 * 60))).toEqual({ status: "offline", online: false, text: "Active 6m ago" });
    expect(presenceLabel(ago(3 * 3600))).toEqual({ status: "offline", online: false, text: "Active 3h ago" });
    expect(presenceLabel(ago(2 * 86400))).toEqual({ status: "offline", online: false, text: "Active 2d ago" });
  });
});
