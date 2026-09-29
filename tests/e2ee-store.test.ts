import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveIdentity,
  loadIdentity,
  loadSeed,
  hasIdentity,
  forgetIdentity,
  forgetAllIdentities,
} from "@/lib/e2ee/store";
import { identityFromSeed, newSeed, toB64 } from "@/lib/e2ee/crypto";

/**
 * The local key store.
 *
 * The property that matters most is isolation between accounts. Hypefy lets
 * one device hold several — saved-accounts.ts keeps a session each and the
 * switcher swaps them in place — so a store keyed only by origin would hand
 * one account's private key to another. Several of these exist purely to
 * make that impossible to regress.
 */

const A = "user-a";
const B = "user-b";

beforeEach(async () => {
  await forgetAllIdentities();
});

describe("saving and loading", () => {
  it("returns the identity that was saved", async () => {
    const seed = newSeed();
    await saveIdentity(A, seed);
    const loaded = await loadIdentity(A);
    expect(loaded).not.toBeNull();
    expect(toB64(loaded!.boxPub)).toBe(toB64(identityFromSeed(seed).boxPub));
  });

  it("returns the seed itself, for re-wrapping", async () => {
    const seed = newSeed();
    await saveIdentity(A, seed);
    expect(await loadSeed(A)).toEqual(seed);
  });

  it("says nothing is there for a user it has never seen", async () => {
    expect(await loadIdentity("never-seen")).toBeNull();
    expect(await hasIdentity("never-seen")).toBe(false);
  });

  it("reports whether a device is unlocked for a user", async () => {
    expect(await hasIdentity(A)).toBe(false);
    await saveIdentity(A, newSeed());
    expect(await hasIdentity(A)).toBe(true);
  });

  it("replaces rather than duplicates when saved twice", async () => {
    const first = newSeed();
    const second = newSeed();
    await saveIdentity(A, first);
    await saveIdentity(A, second);
    expect(await loadSeed(A)).toEqual(second);
  });
});

describe("accounts are isolated", () => {
  it("never returns one account's key for another", async () => {
    // The whole reason this store is keyed by user id.
    const seedA = newSeed();
    const seedB = newSeed();
    await saveIdentity(A, seedA);
    await saveIdentity(B, seedB);

    expect(await loadSeed(A)).toEqual(seedA);
    expect(await loadSeed(B)).toEqual(seedB);
    expect(await loadSeed(A)).not.toEqual(seedB);
  });

  it("keeps the other account when one is forgotten", async () => {
    await saveIdentity(A, newSeed());
    const seedB = newSeed();
    await saveIdentity(B, seedB);

    await forgetIdentity(A);

    expect(await loadSeed(A)).toBeNull();
    expect(await loadSeed(B)).toEqual(seedB);
  });

  it("clears every account on sign-out", async () => {
    await saveIdentity(A, newSeed());
    await saveIdentity(B, newSeed());

    await forgetAllIdentities();

    expect(await hasIdentity(A)).toBe(false);
    expect(await hasIdentity(B)).toBe(false);
  });
});

describe("refusing nonsense rather than trusting it", () => {
  it("ignores a seed of the wrong length", async () => {
    // A row from an older version, or a corrupted one. Deriving an identity
    // from it would produce a key nobody can answer.
    await saveIdentity(A, new Uint8Array(8));
    expect(await loadIdentity(A)).toBeNull();
    expect(await loadSeed(A)).toBeNull();
  });

  it("forgetting something that was never there is not an error", async () => {
    await expect(forgetIdentity("never-seen")).resolves.toBeUndefined();
  });
});
