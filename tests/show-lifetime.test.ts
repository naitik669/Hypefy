import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHOW_LIFETIMES, readLifetime } from "@/lib/show-audience";

/**
 * A Show can last 48 hours instead of 24.
 *
 * expires_at had always been `now() + 24 hours`, written by the column
 * default and never by anybody: shows grants per column, and authenticated
 * has SELECT on expires_at and no INSERT or UPDATE at all. The lifetime
 * was not a choice because there was no way to express one.
 *
 * The shape of the fix is the point. Granting INSERT on expires_at would
 * be the short way and the wrong one — a timestamp from a browser is one
 * a browser can be wrong about, and a Show set to expire in ten years is
 * a Show that never expires: the reaper would never take it and
 * can_see_show would go on returning true. So the client sends hours,
 * bounded by a CHECK, and a trigger computes the timestamp.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const m = read("supabase/migrations/0212_shows_choose_how_long.sql");
const publish = read("src/lib/show-publish.ts");
const preview = read("src/components/create/ShotPreview.tsx");

describe("the browser never names its own expiry", () => {
  it("it is granted the hours, not the timestamp", () => {
    expect(m).toContain("grant insert (lifetime_hours) on public.shows to authenticated");
    expect(m).not.toMatch(/grant insert \(expires_at\)/);
    expect(m).not.toMatch(/grant update \(expires_at\)/);
  });

  it("and a trigger works the timestamp out", () => {
    expect(m).toContain("new.expires_at := now() + make_interval(hours =>");
    expect(m).toContain("before insert on public.shows");
  });

  it("the hours are bounded to what the composer offers", () => {
    expect(m).toContain("check (lifetime_hours in (24, 48))");
  });

  it("and the two lists say the same thing", () => {
    // A third length is a line here, a line there, and a dropdown entry.
    // They have to agree, or the composer offers something the database
    // refuses.
    const sql = (m.match(/lifetime_hours in \(([^)]+)\)/)?.[1] ?? "")
      .split(",")
      .map((n) => Number(n.trim()))
      .sort((a, b) => a - b);
    expect(sql).toEqual([...SHOW_LIFETIMES].sort((a, b) => a - b));
  });

  it("the service role keeps its own timestamps", () => {
    // It backfills and repairs rows; the same exemption
    // tg_profiles_preserve_privileged makes.
    expect(m).toContain("current_user in ('postgres', 'supabase_admin', 'service_role')");
  });

  it("and the lifetime cannot be changed after posting", () => {
    // A Show that had expired coming back is something can_see_show and
    // the reaper both have views about.
    expect(m).not.toMatch(/grant update \(lifetime_hours\)/);
  });
});

describe("what the client sends", () => {
  it("hours, read through the parser rather than passed raw", () => {
    expect(publish).toContain("lifetime_hours: readLifetime(d.lifetimeHours)");
  });

  it("and anything unexpected reads as the short one", () => {
    // A value from a newer client must read as something rather than take
    // the insert down.
    expect(readLifetime(48)).toBe(48);
    expect(readLifetime(24)).toBe(24);
    expect(readLifetime(9999)).toBe(24);
    expect(readLifetime("48")).toBe(24);
    expect(readLifetime(undefined)).toBe(24);
    expect(readLifetime(null)).toBe(24);
  });
});

describe("the composer offers it", () => {
  it("one button per length, from the one list", () => {
    // Built from SHOW_LIFETIMES rather than written out, so the dropdown
    // cannot drift from the CHECK.
    expect(preview).toContain("SHOW_LIFETIMES.map((h)");
  });

  it("saying which is chosen, for a reader too", () => {
    expect(preview).toContain("aria-pressed={lifetime === h}");
  });

  it("and it reaches the insert", () => {
    expect(preview).toContain("lifetimeHours: lifetime,");
  });

  it("defaulting to the short one", () => {
    expect(preview).toContain("useState<ShowLifetime>(24)");
  });
});
