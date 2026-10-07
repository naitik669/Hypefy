import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Maintenance mode, through the real proxy: what a request actually gets
 * back, and that the database is never asked.
 */

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/middleware", () => ({ updateSession }));

const req = (path: string) => new NextRequest(new URL(`https://app.hypefy.chat${path}`));

beforeEach(() => {
  updateSession.mockReset();
  updateSession.mockResolvedValue(new Response("ok"));
  vi.stubEnv("APP_INVITE_CODE", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("the proxy while maintenance is on", () => {
  beforeEach(() => vi.stubEnv("MAINTENANCE_MODE", "on"));

  it("answers a page with the maintenance screen and a 503", async () => {
    const { proxy } = await import("@/proxy");
    const res = await proxy(req("/home"));
    expect(res.status).toBe(503);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://app.hypefy.chat/maintenance");
    expect(res.headers.get("retry-after")).toBe("120");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("answers the API with JSON and a 503, never a page", async () => {
    const { proxy } = await import("@/proxy");
    const res = await proxy(req("/api/music?q=x"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "maintenance" });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("lets the legal pages through untouched", async () => {
    const { proxy } = await import("@/proxy");
    const res = await proxy(req("/delete-account"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe("the proxy while maintenance is off", () => {
  it("carries on as it always did", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "");
    const { proxy } = await import("@/proxy");
    await proxy(req("/home"));
    expect(updateSession).toHaveBeenCalledTimes(1);
  });
});
