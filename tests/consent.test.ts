import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultConsent,
  parseConsent,
  saveConsent,
  storedConsent,
  needsChoice,
  currentConsent,
  subscribeConsent,
  toGoogleConsent,
  CONSENT_VERSION,
} from "@/lib/consent";

function clearCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(clearCookies);

describe("defaultConsent", () => {
  it("is opt-in where the law requires consent first", () => {
    for (const c of ["DE", "FR", "GB", "CH", "NO"]) {
      expect(defaultConsent(c)).toMatchObject({ analytics: false, ads: false });
    }
  });

  it("treats an unknown country as the strict case", () => {
    // A header that failed to arrive is not permission.
    expect(defaultConsent(null)).toMatchObject({ analytics: false, ads: false });
  });

  it("is opt-out everywhere else", () => {
    expect(defaultConsent("IN")).toMatchObject({ analytics: true, ads: true });
    expect(defaultConsent("US")).toMatchObject({ analytics: true, ads: true });
  });
});

describe("parseConsent", () => {
  const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));

  it("reads a current, well-formed choice", () => {
    expect(parseConsent(enc({ analytics: true, ads: false, version: CONSENT_VERSION }))).toMatchObject({
      analytics: true,
      ads: false,
    });
  });

  it("refuses a choice made under an older policy, so it is asked again", () => {
    expect(parseConsent(enc({ analytics: true, ads: true, version: CONSENT_VERSION - 1 }))).toBeNull();
  });

  it("refuses anything malformed rather than guessing", () => {
    expect(parseConsent("not json")).toBeNull();
    expect(parseConsent(enc({ analytics: "yes", ads: true, version: CONSENT_VERSION }))).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });
});

describe("saving a choice", () => {
  it("stores it, ends the need to ask, and wins over the regional default", () => {
    expect(needsChoice()).toBe(true);
    saveConsent({ analytics: true, ads: false });
    expect(needsChoice()).toBe(false);
    expect(storedConsent()).toMatchObject({ analytics: true, ads: false });
    // An EEA reader who accepted analytics gets analytics.
    expect(currentConsent("DE")).toMatchObject({ analytics: true, ads: false });
  });

  it("tells listeners straight away", () => {
    let calls = 0;
    const off = subscribeConsent(() => (calls += 1));
    saveConsent({ analytics: false, ads: false });
    off();
    saveConsent({ analytics: true, ads: true });
    expect(calls).toBe(1);
  });

  it("removes Google Analytics cookies when analytics is refused", () => {
    document.cookie = "_ga=GA1.1.123; Path=/";
    document.cookie = "_ga_ABC123=GS1.1.456; Path=/";
    saveConsent({ analytics: false, ads: true });
    expect(document.cookie).not.toMatch(/_ga=/);
    expect(document.cookie).not.toMatch(/_ga_ABC123=/);
  });

  it("leaves them when analytics is accepted", () => {
    document.cookie = "_ga=GA1.1.123; Path=/";
    saveConsent({ analytics: true, ads: true });
    expect(document.cookie).toMatch(/_ga=/);
  });
});

describe("toGoogleConsent", () => {
  it("sends all four Consent Mode v2 signals explicitly", () => {
    expect(toGoogleConsent({ analytics: true, ads: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });
});
