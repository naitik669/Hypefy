import { describe, it, expect } from "vitest";
import { DECK_SEATS, mergeDecks, type DeckPerson } from "@/lib/rehype";

/**
 * One row of faces over a post, not two.
 *
 * A rehype deck and a hype deck side by side meant six faces on a photo,
 * which read as clutter rather than as people. There are three seats, they
 * are filled rehypes first, and a rehype is worth more than a hype because
 * passing something on costs more than tapping a star.
 */

const p = (id: string, over: Partial<DeckPerson> = {}): DeckPerson => ({
  userId: id,
  name: id.toUpperCase(),
  username: id,
  avatarUrl: null,
  hue: 200,
  isMe: false,
  ...over,
});

const seatsOf = (faces: DeckPerson[]) => faces.map((f) => `${f.userId}:${f.mark}`);

describe("filling the three seats", () => {
  it("rehypes take the whole row when there are enough of them", () => {
    const faces = mergeDecks([p("r1"), p("r2"), p("r3")], [p("h1"), p("h2"), p("h3")]);
    expect(seatsOf(faces)).toEqual(["r1:rehype", "r2:rehype", "r3:rehype"]);
  });

  it("hypes fill whatever the rehypes leave", () => {
    const faces = mergeDecks([p("r1"), p("r2")], [p("h1"), p("h2"), p("h3")]);
    expect(seatsOf(faces)).toEqual(["r1:rehype", "r2:rehype", "h1:hype"]);
  });

  it("with no rehypes at all it is hypes the whole way", () => {
    const faces = mergeDecks([], [p("h1"), p("h2"), p("h3"), p("h4")]);
    expect(seatsOf(faces)).toEqual(["h1:hype", "h2:hype", "h3:hype"]);
  });

  it("and never more than three, whatever it is handed", () => {
    const many = (n: number, k: string) => Array.from({ length: n }, (_, i) => p(`${k}${i}`));
    expect(mergeDecks(many(9, "r"), many(9, "h")).length).toBe(DECK_SEATS);
    expect(mergeDecks([], many(40, "h")).length).toBe(DECK_SEATS);
  });

  it("one rehype and nothing else is one face, not three empty seats", () => {
    expect(seatsOf(mergeDecks([p("r1")], []))).toEqual(["r1:rehype"]);
  });

  it("nobody did either, so there is no row", () => {
    expect(mergeDecks([], [])).toEqual([]);
  });
});

describe("someone who did both", () => {
  it("sits once, in the seat that cost them more", () => {
    // Passing something on is a bigger thing than tapping a star, and the
    // same face twice in a row of three is a third of the row wasted.
    const faces = mergeDecks([p("a")], [p("a"), p("h1")]);
    expect(seatsOf(faces)).toEqual(["a:rehype", "h1:hype"]);
  });

  it("and does not cost the row a seat", () => {
    // Filtering after slicing would leave two faces where three were
    // available.
    const faces = mergeDecks([p("a")], [p("a"), p("h1"), p("h2"), p("h3")]);
    expect(seatsOf(faces)).toEqual(["a:rehype", "h1:hype", "h2:hype"]);
  });
});

describe("what the faces carry", () => {
  it("each knows which mark it wears", () => {
    // One deck draws both now, so the mark belongs to the face rather than
    // to the row.
    const faces = mergeDecks([p("r1")], [p("h1")]);
    expect(faces[0].mark).toBe("rehype");
    expect(faces[1].mark).toBe("hype");
  });

  it("and everything else about them is left alone", () => {
    const face = mergeDecks([p("r1", { name: "Mayo", hue: 42, isMe: true })], [])[0];
    expect(face).toMatchObject({ userId: "r1", name: "Mayo", hue: 42, isMe: true });
  });
});
