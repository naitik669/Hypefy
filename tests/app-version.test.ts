import { describe, it, expect } from "vitest";
import { isNewerBuild } from "@/lib/app-version";

describe("picking up a new release", () => {
  it("reloads only when the server is on a different real build", () => {
    expect(isNewerBuild("abc123", "old999")).toBe(true);
    expect(isNewerBuild("abc123", "abc123")).toBe(false);
    expect(isNewerBuild("dev", "abc123")).toBe(false);
    expect(isNewerBuild("abc123", "dev")).toBe(false);
    expect(isNewerBuild(null, "abc123")).toBe(false);
  });
});
