import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import {
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_HOPS,
  PREVIEW_TIMEOUT_MS,
  isPreviewable,
  previewFrom,
} from "@/lib/link-preview";

/**
 * GET /api/unfurl?url=https://…
 *
 * Reads a page's Open Graph tags so a link in a chat can show a card.
 *
 * This is the one route in the app that fetches a URL a user chose, which
 * makes it the one route where getting the checks wrong hands somebody our
 * server's view of the network. The rules, in the order they are applied:
 *
 *   1. Signed in, and capped. A stranger cannot use it at all.
 *   2. The host is on the allowlist in lib/link-preview.ts. HTTPS only, no
 *      credentials in the authority, no port.
 *   3. Redirects are followed by hand, two at most, and each hop's Location
 *      is put through the same check — otherwise an allowed host could
 *      redirect us anywhere it liked, which is the whole hole reopened one
 *      step along.
 *   4. The body is read as a stream and abandoned past the size cap, so a
 *      host that answers with an endless response cannot hold a function
 *      open.
 *   5. Only text/html is read. Anything else gets no card.
 *
 * Nothing is stored. The answer is cached by the client for the session and
 * forgotten, so a page that changes its tags simply shows differently next
 * time rather than leaving a stale row behind.
 */
export async function GET(req: NextRequest) {
  const blocked = await guardApi("unfurl");
  if (blocked) return blocked;

  const asked = req.nextUrl.searchParams.get("url") ?? "";
  if (!isPreviewable(asked)) {
    // Deliberately the same answer for "not a URL", "not HTTPS" and "not a
    // host we fetch": a caller probing for what is reachable learns the
    // same thing either way, which is nothing.
    return NextResponse.json({ error: "Not previewable" }, { status: 422 });
  }

  let target = asked;
  let res: Response;
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
        headers: {
          // Named honestly. A host that would rather not be read by a
          // preview bot can say so, and some answer differently for one.
          "user-agent": "HypefyPreview/1.0 (+https://hypefy.app)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      const moved = res.status >= 300 && res.status < 400;
      if (!moved) break;
      if (hop >= MAX_PREVIEW_HOPS) {
        return NextResponse.json({ error: "Too many redirects" }, { status: 422 });
      }
      const next = res.headers.get("location");
      if (!next) break;
      // Resolved against the hop we are on, because Location may be a path,
      // then checked from scratch. Same gate as the first request.
      const resolved = new URL(next, target).toString();
      if (!isPreviewable(resolved)) {
        return NextResponse.json({ error: "Not previewable" }, { status: 422 });
      }
      target = resolved;
    }
  } catch {
    return NextResponse.json({ error: "Could not read that page" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Could not read that page" }, { status: 502 });
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
    return NextResponse.json({ error: "Not previewable" }, { status: 422 });
  }

  const html = await readCapped(res);
  if (html === null) {
    return NextResponse.json({ error: "Could not read that page" }, { status: 502 });
  }

  const preview = previewFrom(html, target);
  if (!preview) {
    return NextResponse.json({ error: "Nothing to show" }, { status: 404 });
  }

  return NextResponse.json(preview, {
    // The tags on a page change rarely, and a chat is re-read often.
    headers: { "cache-control": "public, max-age=3600, s-maxage=21600" },
  });
}

/**
 * The first MAX_PREVIEW_BYTES of a response, and no more.
 *
 * `res.text()` would read whatever the host sends, which is a function held
 * open by anybody willing to answer slowly and forever. This stops at the
 * cap and cancels the rest: the meta tags are in the head, so a truncated
 * read loses nothing that a card shows.
 */
async function readCapped(res: Response): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (seen >= MAX_PREVIEW_BYTES) break;
      // The tags we want are all in <head>; once it has closed there is no
      // reason to keep reading a page we are not going to render.
      if (out.includes("</head>")) break;
    }
    return out;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
