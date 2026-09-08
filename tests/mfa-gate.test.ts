import { describe, it, expect } from "vitest";
import { needsSecondFactor, readAal } from "../src/lib/mfa-gate";

/** A JWT-shaped string whose payload carries these claims. Not signed — the
 *  gate never verifies, it reads a token getUser() has already validated. */
function token(claims: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(claims))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${b64}.signature`;
}

const base = {
  hasUser: true,
  userError: false,
  factors: [{ status: "verified" }],
  accessToken: token({ aal: "aal1" }),
  isProtected: true,
  enforce: true,
};

describe("readAal", () => {
  it("reads the claim out of a base64url payload", () => {
    expect(readAal(token({ aal: "aal2" }))).toBe("aal2");
    expect(readAal(token({ aal: "aal1" }))).toBe("aal1");
  });

  it("returns null rather than throwing on anything unreadable", () => {
    expect(readAal(undefined)).toBeNull();
    expect(readAal("")).toBeNull();
    expect(readAal("not-a-jwt")).toBeNull();
    expect(readAal("header..signature")).toBeNull();
    expect(readAal("header.$$$notbase64$$$.sig")).toBeNull();
    expect(readAal(token({ sub: "abc" }))).toBeNull();
  });
});

describe("needsSecondFactor", () => {
  it("challenges a verified factor on an aal1 session", () => {
    expect(needsSecondFactor(base)).toBe(true);
  });

  it("lets an aal2 session through", () => {
    expect(
      needsSecondFactor({ ...base, accessToken: token({ aal: "aal2" }) }),
    ).toBe(false);
  });

  it("ignores an unverified factor — that is an abandoned setup, not a factor", () => {
    expect(
      needsSecondFactor({ ...base, factors: [{ status: "unverified" }] }),
    ).toBe(false);
    expect(needsSecondFactor({ ...base, factors: [] })).toBe(false);
    expect(needsSecondFactor({ ...base, factors: null })).toBe(false);
  });

  it("fails OPEN when getUser errored", () => {
    // The opposite of the signed-out gate, deliberately: concluding "needs a
    // second factor" during a GoTrue outage would send everyone to a challenge
    // screen that cannot reach GoTrue either.
    expect(needsSecondFactor({ ...base, userError: true })).toBe(false);
  });

  it("leaves unprotected paths alone, so the challenge screen is reachable", () => {
    expect(needsSecondFactor({ ...base, isProtected: false })).toBe(false);
  });

  it("does nothing without a user — that is the other gate's job", () => {
    expect(needsSecondFactor({ ...base, hasUser: false })).toBe(false);
  });

  it("obeys the kill switch", () => {
    expect(needsSecondFactor({ ...base, enforce: false })).toBe(false);
  });

  it("challenges when the token carries no aal at all", () => {
    // A token with no claim is not an aal2 token, and guessing in its favour
    // would be a fail-open.
    expect(needsSecondFactor({ ...base, accessToken: token({}) })).toBe(true);
    expect(needsSecondFactor({ ...base, accessToken: undefined })).toBe(true);
  });

  it("counts a verified factor sitting beside unverified ones", () => {
    expect(
      needsSecondFactor({
        ...base,
        factors: [{ status: "unverified" }, { status: "verified" }],
      }),
    ).toBe(true);
  });
});
