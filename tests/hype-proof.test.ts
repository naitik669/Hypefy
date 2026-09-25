import { describe, it, expect } from "vitest";
import { proofSentence, sharedFollowsNames, type Previewer } from "@/lib/hype-proof";

/**
 * What the line says. The counting is the feature — get it wrong and it reads
 * like a machine talking, which is the whole thing this was meant to fix.
 */

const p = (id: string, name: string | null, username: string | null = null): Previewer => ({
  id,
  name,
  username,
  avatar_url: null,
  hue: null,
});

const AMAN = p("1", "Aman");
const CRAZIE = p("2", "Craziematez");
const RIYA = p("3", "Riya");

/** How the component joins the pieces back into one string. */
function say(s: ReturnType<typeof proofSentence>): string | null {
  return s ? s.names.join(s.joiner) + s.tail : null;
}

describe("the hype line", () => {
  it("says nothing when nobody you follow hyped it", () => {
    expect(proofSentence([], 1204)).toBeNull();
  });

  it("names one person with no arithmetic when they are the only hype", () => {
    expect(say(proofSentence([AMAN], 1))).toBe("Aman hyped this");
  });

  it("uses and, not an ampersand, for two people and nobody else", () => {
    expect(say(proofSentence([AMAN, CRAZIE], 2))).toBe("Aman and Craziematez hyped this");
  });

  it("lets the friend lead however big the post is", () => {
    expect(say(proofSentence([AMAN], 1204))).toBe("Aman & 1,203 others hyped this");
  });

  it("counts everyone else, not just the rest of your friends", () => {
    // Ten people you follow hyped it, but 1,204 hyped it in total. The
    // remainder is everyone, so the sentence stays true.
    expect(say(proofSentence([AMAN, CRAZIE, RIYA], 1204))).toBe(
      "Aman, Craziematez & 1,202 others hyped this",
    );
  });

  it("names at most two however many faces it was given", () => {
    const said = proofSentence([AMAN, CRAZIE, RIYA], 1204);
    expect(said?.names).toEqual(["Aman", "Craziematez"]);
  });

  it("never names the viewer — the filled gold star already said that", () => {
    // You hyped it and so did two friends. Naming "You" would spend one of
    // only two slots restating what the star beside the count already shows.
    expect(say(proofSentence([AMAN, CRAZIE], 11))).toBe("Aman, Craziematez & 9 others hyped this");
  });

  it("says one other, singular, when exactly one is left", () => {
    expect(say(proofSentence([AMAN, CRAZIE], 3))).toBe("Aman, Craziematez & 1 other hyped this");
  });

  it("falls back to a username when someone has no display name", () => {
    expect(say(proofSentence([p("9", null, "lavi4sure")], 1))).toBe("lavi4sure hyped this");
  });

  it("never renders an empty name", () => {
    expect(say(proofSentence([p("9", "   ", null)], 1))).toBe("Someone hyped this");
  });
});

describe("the people you both follow", () => {
  it("lists the names it has when that is all of them", () => {
    expect(sharedFollowsNames({ count: 3, names: ["Riya", "Dev", "Ishaan"] })).toBe(
      "Riya, Dev, Ishaan",
    );
  });

  it("counts the rest when there are more than it names", () => {
    expect(sharedFollowsNames({ count: 5, names: ["Riya", "Dev", "Ishaan"] })).toBe(
      "Riya, Dev, Ishaan and 2 more",
    );
  });

  it("says nothing rather than an empty list", () => {
    expect(sharedFollowsNames({ count: 4, names: [] })).toBeNull();
  });
});
