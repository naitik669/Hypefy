import type { SearchProfile, SearchPost, SearchResults } from "./load";

/**
 * The flat list a search screen renders.
 *
 * One list rather than two, so the whole thing scrolls as one. Headings
 * are rows too. A SectionList would do this, but its sticky headers and
 * per-section keys buy nothing when there are at most two sections.
 *
 * In its own module, with no react-native import, so a Node test can CALL
 * it — the same reason `dob-parts`, `entry` and `css-color` are separate.
 * A screen file cannot be imported in a test at all, so logic left there
 * can only be checked by reading source.
 */
export type SearchRow =
  | { key: string; kind: "heading"; label: string }
  | { key: string; kind: "person"; person: SearchProfile }
  | { key: string; kind: "post"; post: SearchPost };

export function buildSections(results: SearchResults): SearchRow[] {
  const out: SearchRow[] = [];
  /*
   * A heading only when its section has something in it: a "People"
   * heading over nothing reads as a section that failed to load, which is
   * the same confusion the failed-versus-empty distinction exists to
   * avoid.
   */
  if (results.people.length > 0) {
    out.push({ key: "h-people", kind: "heading", label: "People" });
    for (const person of results.people) {
      // Prefixed, because a person and a post are rows of different
      // tables and an id shared by chance would make React reconcile the
      // wrong row.
      out.push({ key: `p-${person.id}`, kind: "person", person });
    }
  }
  if (results.posts.length > 0) {
    out.push({ key: "h-posts", kind: "heading", label: "Posts" });
    for (const post of results.posts) {
      out.push({ key: `o-${post.id}`, kind: "post", post });
    }
  }
  return out;
}
