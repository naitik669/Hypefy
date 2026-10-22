import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildIceServers } from "@/lib/ice";

/**
 * The readiness check: which services this deployment has actually been
 * given keys for.
 *
 * Several features are finished in code and dark in production because a
 * key is missing, and each one fails quietly in a way that looks like a bug
 * in the feature rather than a gap in the configuration.
 */

const route = readFileSync("src/app/api/readiness/route.ts", "utf8").replace(/\r\n/g, "\n");

describe("who may ask", () => {
  it("admin, not merely signed in", () => {
    // Together these answers describe the whole deployment's posture, which
    // is a map of what is and is not defended.
    expect(route).toContain('await supabase.rpc("is_admin")');
    expect(route).toContain('if (isAdmin !== true) return NextResponse.json({ error: "not allowed" }, { status: 403 });');
    // And the signed-out answer comes first, so an anonymous caller cannot
    // tell an admin-only route from a missing one by timing the rpc.
    expect(route.indexOf('"sign in first"')).toBeLessThan(route.indexOf('"not allowed"'));
  });

  it("is never cached", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});

describe("it reports presence, never values", () => {
  it("every env read goes through the presence helper or a builder", () => {
    // The failure this guards against is a convenience line like
    // `keyId: env.RAZORPAY_KEY_ID` added later by someone debugging.
    const body = route.slice(route.indexOf("const checks = {"), route.indexOf("const missing"));
    const envReads = body.match(/env\.[A-Z0-9_]+/g) ?? [];
    expect(envReads.length).toBeGreaterThan(5);
    for (const read of envReads) {
      // Each one must sit inside has(...), never be emitted on its own.
      expect(body, read).toContain(`has(${read})`);
    }
  });

  it("answers are booleans and notes, nothing else", () => {
    const body = route.slice(route.indexOf("const checks = {"), route.indexOf("const missing"));
    // No template literals in the checks block: that is how a value would
    // get smuggled into a note.
    expect(body).not.toContain("${");
  });
});

describe("what it considers ready", () => {
  it("a relay is what makes calls real, so it asks the builder not the variable", () => {
    // Reading TURN_URLS would say "configured" for a malformed value the
    // builder discards. This asks what a caller would actually be handed.
    expect(route).toContain("const ice = buildIceServers(env, user.id);");
    expect(route).toContain('u.startsWith("turn:") || u.startsWith("turns:")');
  });

  it("STUN-only is not a relay", () => {
    const ice = buildIceServers({}, "u1");
    const hasRelay = ice.some((s) => s.urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:")));
    expect(hasRelay).toBe(false);
  });

  it("a configured relay is", () => {
    const ice = buildIceServers({ TURN_URLS: "turn:relay.example.com:3478", TURN_SECRET: "s" }, "u1");
    const hasRelay = ice.some((s) => s.urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:")));
    expect(hasRelay).toBe(true);
  });

  it("the invite gate counts as ON when it is still up", () => {
    // Inverted from every other entry on purpose: this one being on is the
    // problem, because a store reviewer cannot get past it.
    expect(route).toContain("a store reviewer cannot get in");
  });

  it("names what it cannot see rather than implying everything is covered", () => {
    // Supabase's sender and password policy live in its dashboard, not in
    // this environment. Leaving them out would read as "all clear".
    expect(route).toContain("cannotSeeFromHere");
    expect(route).toContain("Supabase custom SMTP");
    expect(route).toContain("Supabase leaked-password protection");
  });

  it("ok means every required piece is present", () => {
    expect(route).toContain("ok: missing.length === 0");
    expect(route).toContain(".filter(([, c]) => c.required && !c.on)");
  });
});
