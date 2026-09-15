import { NextResponse } from "next/server";

/** The build this server is running; open pages compare it with their own. */
export function GET() {
  return NextResponse.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
