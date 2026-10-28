import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_HOPS,
  PREVIEW_TIMEOUT_MS,
  firstPreviewable,
  hostLabel,
  isPreviewable,
  previewFrom,
} from "../src/lib/link-preview";

/**
 * Link previews.
 *
 * The server fetches a URL somebody typed, so most of this file is about
 * the places that must not be reachable rather than the card that comes
 * back.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("what may be fetched", () => {
  it("an allowlisted host over https, yes", () => {
    expect(isPreviewable("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isPreviewable("https://open.spotify.com/track/xyz")).toBe(true);
  });

  it("anything not on the list, no — including a host that merely ends with one", () => {
    // The exact-match rule is the point. "youtube.com.evil.test" ends with
    // nothing allowed, but "evil-youtube.com" and a subdomain of an
    // attacker's domain are the shapes a suffix check waves through.
    expect(isPreviewable("https://example.com/")).toBe(false);
    expect(isPreviewable("https://youtube.com.evil.test/")).toBe(false);
    expect(isPreviewable("https://notyoutube.com/")).toBe(false);
    expect(isPreviewable("https://evil.test/?x=https://youtube.com/")).toBe(false);
  });

  it("the metadata service and the loopback, no", () => {
    // The two addresses that make an SSRF worth having.
    expect(isPreviewable("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPreviewable("https://169.254.169.254/")).toBe(false);
    expect(isPreviewable("http://localhost:3000/api/readiness")).toBe(false);
    expect(isPreviewable("http://127.0.0.1/")).toBe(false);
    expect(isPreviewable("https://[::1]/")).toBe(false);
  });

  it("http, file and the rest of the schemes, no", () => {
    expect(isPreviewable("http://www.youtube.com/")).toBe(false);
    expect(isPreviewable("file:///etc/passwd")).toBe(false);
    expect(isPreviewable("gopher://www.youtube.com/")).toBe(false);
    expect(isPreviewable("javascript:alert(1)")).toBe(false);
    expect(isPreviewable("not a url at all")).toBe(false);
  });

  it("credentials in the authority, no", () => {
    // "https://www.youtube.com@evil.test/" parses with evil.test as the
    // host in a correct parser and youtube as the host in a sloppy one.
    // Refusing any userinfo means both readings are refused.
    expect(isPreviewable("https://www.youtube.com@evil.test/")).toBe(false);
    expect(isPreviewable("https://user:pw@www.youtube.com/")).toBe(false);
  });

  it("a port, no — an allowed name is not a licence to reach every service on it", () => {
    expect(isPreviewable("https://www.youtube.com:8080/")).toBe(false);
    expect(isPreviewable("https://www.youtube.com:22/")).toBe(false);
  });

  it("and the case of the hostname does not decide it", () => {
    expect(isPreviewable("https://WWW.YouTube.com/watch?v=a")).toBe(true);
  });
});

describe("finding the link in a message", () => {
  it("the first previewable one, and only one", () => {
    const body = "watch https://www.youtube.com/watch?v=a then https://open.spotify.com/track/b";
    expect(firstPreviewable(body)).toBe("https://www.youtube.com/watch?v=a");
  });

  it("skips ones it will not fetch rather than giving up at the first link", () => {
    const body = "https://example.com/x and https://www.youtube.com/watch?v=a";
    expect(firstPreviewable(body)).toBe("https://www.youtube.com/watch?v=a");
  });

  it("a sentence's full stop is not part of the URL", () => {
    expect(firstPreviewable("see https://github.com/naitik669/Hypefy.")).toBe(
      "https://github.com/naitik669/Hypefy",
    );
    expect(firstPreviewable("(https://github.com/a)")).toBe("https://github.com/a");
  });

  it("no link, no card", () => {
    expect(firstPreviewable("just talking")).toBe(null);
    expect(firstPreviewable("")).toBe(null);
    expect(firstPreviewable(null)).toBe(null);
    expect(firstPreviewable(undefined)).toBe(null);
  });
});

describe("reading the page", () => {
  const page = `<html><head>
    <meta property="og:title" content="A Song &amp; A Dance">
    <meta property="og:description" content="Some   words   about it">
    <meta content="https://www.youtube.com/img.jpg" property="og:image">
    <meta property="og:site_name" content="YouTube">
  </head></html>`;

  it("pulls the card out of the tags, either attribute order", () => {
    const got = previewFrom(page, "https://www.youtube.com/watch?v=a");
    expect(got?.title).toBe("A Song & A Dance");
    expect(got?.description).toBe("Some words about it");
    expect(got?.image).toBe("https://www.youtube.com/img.jpg");
    expect(got?.site).toBe("YouTube");
  });

  it("falls back to <title> when there is no og:title", () => {
    const got = previewFrom("<html><head><title>Plain</title></head>", "https://github.com/a");
    expect(got?.title).toBe("Plain");
    expect(got?.site).toBe("github.com");
  });

  it("no title is no card, not an empty one", () => {
    // A card with a blank heading and a grey box is worse than the link.
    expect(previewFrom("<html><head></head></html>", "https://github.com/a")).toBe(null);
    expect(previewFrom("<html><head><title>   </title></head>", "https://github.com/a")).toBe(null);
  });

  it("an og:image pointing somewhere private is dropped, not rendered", () => {
    // The fetched page chooses this value. Rendering it would have the
    // reader's browser make the request the server refused to make.
    const hostile = `<head><meta property="og:title" content="Hi">
      <meta property="og:image" content="http://169.254.169.254/latest/meta-data/"></head>`;
    const got = previewFrom(hostile, "https://github.com/a");
    expect(got?.title).toBe("Hi");
    expect(got?.image).toBe(null);
  });

  it("long text is cut rather than allowed to fill the thread", () => {
    const long = "x".repeat(400);
    const got = previewFrom(
      `<head><meta property="og:title" content="${long}"><meta property="og:description" content="${long}"></head>`,
      "https://github.com/a",
    );
    expect(got!.title.length).toBeLessThanOrEqual(120);
    expect(got!.description!.length).toBeLessThanOrEqual(200);
  });

  it("hostLabel drops the www and survives junk", () => {
    expect(hostLabel("https://www.reddit.com/r/x")).toBe("reddit.com");
    expect(hostLabel("nonsense")).toBe(null);
  });
});

describe("the route's own guarantees", () => {
  const route = strip(read("src/app/api/unfurl/route.ts"));

  it("signed in and capped before anything is fetched", () => {
    expect(route).toContain('await guardApi("unfurl")');
    // Before the fetch, not after: a 429 that has already made the request
    // has not limited anything.
    expect(route.indexOf("guardApi")).toBeLessThan(route.indexOf("await fetch("));
  });

  it("the URL is checked before the fetch, and the check is the shared one", () => {
    expect(route).toContain("isPreviewable(asked)");
    expect(route.indexOf("isPreviewable(asked)")).toBeLessThan(route.indexOf("await fetch("));
  });

  it("redirects are followed by hand and each hop is re-checked", () => {
    // Letting fetch follow them would mean one allowlisted host could
    // forward us anywhere — the hole, reopened a step along.
    expect(route).toContain('redirect: "manual"');
    expect(route).toContain("isPreviewable(resolved)");
    expect(route).toContain("hop >= MAX_PREVIEW_HOPS");
  });

  it("the read is capped and the clock is running", () => {
    expect(route).toContain("AbortSignal.timeout(PREVIEW_TIMEOUT_MS)");
    expect(route).toContain("seen >= MAX_PREVIEW_BYTES");
    expect(route).not.toContain("await res.text()");
  });

  it("only html is read", () => {
    expect(route).toContain('content-type');
    expect(route).toContain('"text/html"');
  });

  it("and the caps are real numbers, not placeholders", () => {
    expect(MAX_PREVIEW_BYTES).toBeGreaterThan(0);
    expect(MAX_PREVIEW_BYTES).toBeLessThanOrEqual(1024 * 1024);
    expect(PREVIEW_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PREVIEW_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(MAX_PREVIEW_HOPS).toBeLessThanOrEqual(3);
  });
});

describe("the card in the thread", () => {
  const chat = read("src/components/messages/RealChatView.tsx");
  const card = read("src/components/messages/LinkCard.tsx");

  it("an unsent message shows no card", () => {
    expect(chat).toContain('m.kind === "text" && !m.is_unsent && firstPreviewable(m.body)');
  });

  it("one request per link per session, shared between messages", () => {
    // Three messages carrying the same link are one fetch, and a link with
    // no card is not asked about twice.
    expect(card).toContain("const already = asking.get(url);");
    expect(card).toContain("if (already) return already;");
    expect(card).toContain("answers.set(url, got);");
  });

  it("the link opens away from us, with no referrer handed over", () => {
    expect(card).toContain('rel="noopener noreferrer nofollow"');
    expect(card).toContain('referrerPolicy="no-referrer"');
  });

  it("and a card that is still loading takes up no room", () => {
    // A skeleton would shift the thread under the reader's thumb each time
    // one resolved.
    expect(card).toContain("if (!preview) return null;");
  });
});
