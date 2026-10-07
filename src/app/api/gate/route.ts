import { NextResponse } from "next/server";
import {
  GATE_COOKIE,
  GATE_MAX_AGE,
  expectedToken,
  safeEqual,
} from "@/lib/invite-gate";
import { attemptAllowed } from "@/lib/api-guard";

/** Tries at the code from one address, right or wrong, per window. */
export const GATE_TRIES = 10;
export const GATE_WINDOW_SECONDS = 15 * 60;

/**
 * Exchanges a correct invite code for the gate cookie.
 *
 * Deliberately says nothing about *why* a code failed, and does not
 * distinguish "wrong code" from "gate disabled" in its timing beyond the
 * constant-time compare.
 */
export async function POST(request: Request) {
  const configured = process.env.APP_INVITE_CODE;

  if (!configured) {
    // Nothing to check against — the gate is off.
    return NextResponse.json({ ok: true });
  }

  // Before the code is even read: the answer to the eleventh guess is the
  // same whether or not it was right.
  if (!(await attemptAllowed(request, "gate", GATE_TRIES, GATE_WINDOW_SECONDS))) {
    return NextResponse.json(
      { error: "Too many tries. Wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let submitted: unknown;
  try {
    submitted = (await request.json())?.code;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (typeof submitted !== "string" || !safeEqual(submitted.trim(), configured)) {
    return NextResponse.json(
      { error: "That code is not valid." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set(GATE_COOKIE, await expectedToken(configured), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });

  return res;
}
