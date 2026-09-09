import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The gate decides three separate things and gets them wrong in three
 * separate ways, so each one is tested against the failure that matters:
 * a tag inside the Play Store app, a tag served into the EEA without consent,
 * and a personalised ad shown to someone we cannot confirm is an adult.
 *
 * The module reads process.env at call time through adMode(), but the three
 * id constants are read at import, so every test that changes them has to
 * re-import — hence resetModules rather than a shared top-level import.
 */

const ENV = { ...process.env };

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return await import("@/lib/ads");
}

const CONFIGURED = {
  NEXT_PUBLIC_ADS_MODE: "adsense",
  NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-000",
  NEXT_PUBLIC_ADSENSE_FEED_SLOT: "111",
  NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY: "-ab+cd",
};

const BLANK = {
  NEXT_PUBLIC_ADS_MODE: undefined,
  NEXT_PUBLIC_ADSENSE_CLIENT: undefined,
  NEXT_PUBLIC_ADSENSE_FEED_SLOT: undefined,
  NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY: undefined,
};

beforeEach(() => {
  process.env = { ...ENV };
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("adMode", () => {
  it("is off with nothing configured", async () => {
    const { adMode } = await load(BLANK);
    expect(adMode()).toBe("off");
  });

  it("is off when asked for adsense with no ids", async () => {
    // A half-configured deploy is a mistake, not an instruction. Pushing to an
    // <ins> with no client id gives a console error and an empty box.
    const { adMode } = await load({ ...BLANK, NEXT_PUBLIC_ADS_MODE: "adsense" });
    expect(adMode()).toBe("off");
  });

  it("is off without a client or a slot", async () => {
    for (const missing of [
      "NEXT_PUBLIC_ADSENSE_CLIENT",
      "NEXT_PUBLIC_ADSENSE_FEED_SLOT",
    ]) {
      const { adMode } = await load({ ...CONFIGURED, [missing]: undefined });
      expect(adMode()).toBe("off");
    }
  });

  it("runs without a layout key", async () => {
    // The key only exists on an In-feed unit, and AdSense will not always let
    // you create one — its style builder wants to scan a live feed, and this
    // feed is behind a login. Requiring the key would block the feature on a
    // styling wizard. A Display unit fills the same card, which supplies all
    // the styling the key would have.
    const { adMode } = await load({
      ...CONFIGURED,
      NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY: undefined,
    });
    expect(adMode()).toBe("adsense");
  });

  it("takes house mode with no ids at all", async () => {
    const { adMode } = await load({ ...BLANK, NEXT_PUBLIC_ADS_MODE: "house" });
    expect(adMode()).toBe("house");
  });
});

describe("needsConsent", () => {
  it("treats an unknown country as needing consent", async () => {
    // The country comes from an edge header. A header that did not arrive is
    // not evidence of anything, and reading it as "not in Europe" would make a
    // misconfiguration serve into exactly the jurisdiction that must not get it.
    const { needsConsent } = await load(BLANK);
    expect(needsConsent(null)).toBe(true);
    expect(needsConsent(undefined)).toBe(true);
    expect(needsConsent("")).toBe(true);
  });

  it("covers the EEA, the UK and Switzerland", async () => {
    const { needsConsent } = await load(BLANK);
    for (const c of ["DE", "FR", "IE", "NO", "IS", "LI", "GB", "CH"]) {
      expect(needsConsent(c)).toBe(true);
    }
  });

  it("is case-insensitive", async () => {
    const { needsConsent } = await load(BLANK);
    expect(needsConsent("de")).toBe(true);
  });

  it("lets the rest of the world through", async () => {
    const { needsConsent } = await load(BLANK);
    for (const c of ["IN", "US", "BR", "JP", "AU"]) {
      expect(needsConsent(c)).toBe(false);
    }
  });
});

describe("adFill", () => {
  it("never returns adsense inside the native shell", async () => {
    // capacitor.config.ts points the Play Store app at the live site, so a web
    // tag here is a tag inside the app — which is AdMob's territory, not
    // AdSense's. This is the single most expensive thing to get wrong.
    const { adFill } = await load(CONFIGURED);
    expect(adFill({ country: "IN", native: true })).toBe("house");
  });

  it("never returns adsense for a reader who needs a CMP", async () => {
    const { adFill } = await load(CONFIGURED);
    expect(adFill({ country: "DE", native: false })).toBe("house");
    expect(adFill({ country: null, native: false })).toBe("house");
  });

  it("serves adsense to a configured, non-native, non-EEA reader", async () => {
    const { adFill } = await load(CONFIGURED);
    expect(adFill({ country: "IN", native: false })).toBe("adsense");
  });

  it("stays off entirely when nothing is configured, native or not", async () => {
    const { adFill } = await load(BLANK);
    expect(adFill({ country: "IN", native: false })).toBe("off");
    expect(adFill({ country: "IN", native: true })).toBe("off");
  });

  it("falls back to house rather than leaving a hole", async () => {
    // The placement rules have already reserved a slot by the time this is
    // asked. "off" there would be a gap in the middle of the feed.
    const { adFill, adsEnabled } = await load(CONFIGURED);
    expect(adFill({ country: "GB", native: true })).toBe("house");
    expect(adsEnabled({ country: "GB", native: true })).toBe(true);
  });

  it("places no slots at all when off", async () => {
    const { adsEnabled } = await load(BLANK);
    expect(adsEnabled({ country: "IN", native: false })).toBe(false);
  });
});

describe("personalised", () => {
  it("requires a confirmed adult", async () => {
    // Every OAuth account that never passed /age-check has a null date of
    // birth, and the app's only threshold is 13. Unknown is a no.
    const { personalised } = await load(CONFIGURED);
    expect(personalised(true)).toBe(true);
    expect(personalised(false)).toBe(false);
  });
});

describe("the publisher id", () => {
  it("takes the form AdSense shows on screen", async () => {
    // The interface says "pub-8956774728473034"; data-ad-client needs
    // "ca-pub-8956774728473034". Copying what is on screen would otherwise
    // give a unit that loads, requests and never fills, with no error to
    // explain it.
    const { AD_CLIENT } = await load({
      ...CONFIGURED,
      NEXT_PUBLIC_ADSENSE_CLIENT: "pub-8956774728473034",
    });
    expect(AD_CLIENT).toBe("ca-pub-8956774728473034");
  });

  it("leaves an already-prefixed id alone", async () => {
    const { AD_CLIENT } = await load({
      ...CONFIGURED,
      NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-8956774728473034",
    });
    expect(AD_CLIENT).toBe("ca-pub-8956774728473034");
  });

  it("trims, and treats blank as absent", async () => {
    const { AD_CLIENT, adMode } = await load({
      ...CONFIGURED,
      NEXT_PUBLIC_ADSENSE_CLIENT: "   ",
    });
    expect(AD_CLIENT).toBe("");
    expect(adMode()).toBe("off");
  });
});
