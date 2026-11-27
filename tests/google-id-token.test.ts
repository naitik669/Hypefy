import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildGoogleAuthUrl,
  parseGoogleReturn,
  sha256Hex,
  GOOGLE_RETURN_PATH,
} from "@/lib/google-id-token";
import { isOpenPath } from "@/lib/invite-gate";

const pending = { state: "s-123", nonce: "raw-nonce", at: 1_000_000 };

describe("Google ID-token sign-in", () => {
  it("sends Google our own page as the redirect, never the Supabase callback", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "cid.apps.googleusercontent.com",
        redirectUri: `https://app.hypefy.chat${GOOGLE_RETURN_PATH}`,
        state: "s-123",
        hashedNonce: "h",
      }),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    const q = url.searchParams;
    expect(q.get("redirect_uri")).toBe("https://app.hypefy.chat/auth/google");
    expect(q.get("redirect_uri")).not.toContain("supabase.co");
    expect(q.get("client_id")).toBe("cid.apps.googleusercontent.com");
    expect(q.get("response_type")).toBe("id_token");
    expect(q.get("scope")!.split(" ")).toContain("openid");
    expect(q.get("state")).toBe("s-123");
    expect(q.get("nonce")).toBe("h");
    expect(q.get("prompt")).toBe("select_account");
  });

  it("hashes the nonce as SHA-256 hex, which is what Supabase compares against", async () => {
    expect(await sha256Hex("raw-nonce")).toBe(
      createHash("sha256").update("raw-nonce").digest("hex"),
    );
  });

  it("returns the token and the RAW nonce when state matches", () => {
    const r = parseGoogleReturn("#state=s-123&id_token=tok", pending, 1_000_500);
    expect(r).toEqual({ ok: true, token: "tok", nonce: "raw-nonce" });
  });

  it("refuses a token answering a different request", () => {
    const r = parseGoogleReturn("#state=other&id_token=tok", pending, 1_000_500);
    expect(r).toEqual({ ok: false, reason: "state_mismatch" });
  });

  it("refuses when this tab never started a request", () => {
    expect(parseGoogleReturn("#state=s-123&id_token=tok", null, 1)).toEqual({
      ok: false,
      reason: "no_pending_request",
    });
  });

  it("refuses a request older than ten minutes, and accepts one just inside", () => {
    const tenMin = 10 * 60 * 1000;
    expect(
      parseGoogleReturn("#state=s-123&id_token=tok", pending, pending.at + tenMin + 1),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      parseGoogleReturn("#state=s-123&id_token=tok", pending, pending.at + tenMin).ok,
    ).toBe(true);
  });

  it("passes Google's error through, ahead of everything else", () => {
    expect(parseGoogleReturn("#error=access_denied", null, 1)).toEqual({
      ok: false,
      reason: "access_denied",
    });
  });

  it("refuses a matching state with no token", () => {
    expect(parseGoogleReturn("#state=s-123", pending, 1_000_500)).toEqual({
      ok: false,
      reason: "no_token",
    });
  });

  it("leaves the return page open through the invite gate, like the callback", () => {
    expect(isOpenPath(GOOGLE_RETURN_PATH)).toBe(true);
    expect(isOpenPath("/auth/google/x")).toBe(false);
  });
});
