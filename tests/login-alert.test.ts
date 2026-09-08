import { describe, it, expect } from "vitest";
import { deviceLabel, readSessionId } from "../src/lib/login-alert";

function token(claims: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(claims))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${b64}.signature`;
}

describe("readSessionId", () => {
  it("reads session_id from the payload", () => {
    expect(readSessionId(token({ session_id: "abc-123" }))).toBe("abc-123");
  });

  it("returns null rather than throwing on anything unreadable", () => {
    expect(readSessionId(undefined)).toBeNull();
    expect(readSessionId("not-a-jwt")).toBeNull();
    expect(readSessionId(token({ sub: "u1" }))).toBeNull();
  });
});

describe("deviceLabel", () => {
  const UA = {
    chromeWin:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    safariIphone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    chromeAndroid:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    edgeWin:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    firefoxMac:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
  };

  it("names the browser and the platform", () => {
    expect(deviceLabel(UA.chromeWin)).toBe("Chrome on Windows");
    expect(deviceLabel(UA.safariIphone)).toBe("Safari on iOS");
    expect(deviceLabel(UA.firefoxMac)).toBe("Firefox on Mac");
  });

  it("does not call Chrome or Edge 'Safari'", () => {
    // Both carry "Safari/537.36" in their UA, so an eager Safari check would
    // label most of the web as Safari.
    expect(deviceLabel(UA.chromeWin)).not.toContain("Safari");
    expect(deviceLabel(UA.edgeWin)).toBe("Edge on Windows");
  });

  it("does not call Android 'Linux'", () => {
    // Android UAs contain "Linux", so order matters here too.
    expect(deviceLabel(UA.chromeAndroid)).toBe("Chrome on Android");
  });

  it("carries nothing worth harvesting", () => {
    // The label lands in a notification row and a push payload. No version
    // numbers, no device model, no raw UA.
    const out = deviceLabel(UA.chromeAndroid);
    expect(out).not.toMatch(/\d/);
    expect(out).not.toContain("Pixel");
    expect(out.length).toBeLessThan(30);
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(deviceLabel(null)).toBe("");
    expect(deviceLabel("")).toBe("");
    expect(deviceLabel("curl/8.4.0")).toBe("");
  });
});
