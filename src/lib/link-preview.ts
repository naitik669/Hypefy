/**
 * Link previews in chat.
 *
 * A link in a message is a card showing the page's title, description and
 * image. The page has to be fetched to find those out, and the fetch runs
 * on our server, which is the whole reason this file is careful: a server
 * that fetches whatever a user pastes is a server that can be pointed at
 * anything it can reach, including the metadata endpoints and private
 * addresses nothing outside the network should see.
 *
 * The answer here is an allowlist, not a blocklist. A blocklist of private
 * ranges has to be right about every address family, every encoding of a
 * loopback address, and every DNS name that resolves into one; an allowlist
 * of the two dozen hosts people actually paste has to be right about those
 * two dozen hosts. Everything else gets no preview at all, which is a link
 * that reads as a link — not a failure.
 *
 * None of this is stored. The preview belongs to the reader's screen, not
 * to the message, so there is no row to poison and nothing to re-serve.
 */

/** What a preview says, once a page has been read. */
export type LinkPreview = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  site: string | null;
};

/**
 * The hosts a preview may be fetched from.
 *
 * Exact hostnames, deliberately. A suffix rule like "ends with
 * .youtube.com" is one hijacked subdomain away from being a hole, and a
 * registrable-suffix check would need the public suffix list to be right
 * about it. These are the ones worth a card.
 */
const PREVIEW_HOSTS: readonly string[] = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "open.spotify.com",
  "music.apple.com",
  "soundcloud.com",
  "www.soundcloud.com",
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "www.instagram.com",
  "instagram.com",
  "www.tiktok.com",
  "tiktok.com",
  "www.reddit.com",
  "reddit.com",
  "github.com",
  "www.github.com",
  "en.wikipedia.org",
  "medium.com",
  "substack.com",
  "www.twitch.tv",
  "twitch.tv",
  "steamcommunity.com",
  "store.steampowered.com",
];

/** The longest page we will read before giving up on it. */
export const MAX_PREVIEW_BYTES = 512 * 1024;

/** How long a page gets to answer. */
export const PREVIEW_TIMEOUT_MS = 4000;

/** How many redirects a page gets, each one re-checked against the list. */
export const MAX_PREVIEW_HOPS = 2;

/**
 * May this URL be fetched?
 *
 * Every clause here is a way somebody has reached somewhere they should not
 * have: a non-HTTPS scheme to pick up `file:` and `gopher:`, credentials in
 * the authority to confuse a parser that splits on `@`, and a port to stop
 * an allowed hostname being used to reach a service on another port of the
 * same machine.
 */
export function isPreviewable(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  return PREVIEW_HOSTS.includes(url.hostname.toLowerCase());
}

/**
 * The first link in a message body, if there is one worth previewing.
 *
 * One card per message. Two links in a sentence are a sentence, not a
 * gallery, and the thread stays readable if a long paste cannot push the
 * conversation off the screen.
 */
export function firstPreviewable(body: string | null | undefined): string | null {
  if (!body) return null;
  // Stops at whitespace and at the punctuation that ends a sentence rather
  // than a URL, so "look at https://x.com/a." does not fetch the full stop.
  const found = body.match(/https:\/\/[^\s<>"']+/g);
  if (!found) return null;
  for (const one of found) {
    const trimmed = one.replace(/[.,;:!?)\]]+$/, "");
    if (isPreviewable(trimmed)) return trimmed;
  }
  return null;
}

/** One meta tag's content, by property or name, whichever the page used. */
function metaContent(html: string, key: string): string | null {
  // Both attribute orders, because plenty of pages put content first.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

/** The handful of entities that actually show up in a title. */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Nothing on a card runs past a line or two. */
function clamp(s: string | null, max: number): string | null {
  if (!s) return null;
  const tidy = s.replace(/\s+/g, " ").trim();
  if (!tidy) return null;
  return tidy.length > max ? `${tidy.slice(0, max - 1)}…` : tidy;
}

/**
 * The card an HTML page describes.
 *
 * Returns null when there is no title to show: a card with an empty heading
 * and a grey box is worse than the link it replaced.
 *
 * The image is re-checked against the allowlist, because `og:image` is a
 * value the fetched page controls. A page on an allowed host that points
 * its image at an internal address would otherwise have the browser fetch
 * it — the same hole one step removed.
 */
export function previewFrom(html: string, url: string): LinkPreview | null {
  const head = html.slice(0, MAX_PREVIEW_BYTES);
  const title =
    clamp(metaContent(head, "og:title"), 120) ??
    clamp(metaContent(head, "twitter:title"), 120) ??
    clamp(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(head.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null, 120);
  if (!title) return null;

  const image = metaContent(head, "og:image") ?? metaContent(head, "twitter:image");

  return {
    url,
    title,
    description:
      clamp(metaContent(head, "og:description"), 200) ??
      clamp(metaContent(head, "twitter:description"), 200) ??
      clamp(metaContent(head, "description"), 200),
    image: image && isPreviewable(image) ? image : null,
    site: clamp(metaContent(head, "og:site_name"), 40) ?? hostLabel(url),
  };
}

/** "youtube.com" rather than "www.youtube.com" — the part a reader reads. */
export function hostLabel(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
