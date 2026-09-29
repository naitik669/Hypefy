import { describe, it, expect } from "vitest";
import {
  createVault,
  openVault,
  rewrapForPassword,
  rewrapForRecovery,
  newRecoveryCode,
  normaliseRecoveryCode,
} from "@/lib/e2ee/keys";
import { toB64 } from "@/lib/e2ee/crypto";

/**
 * The key lifecycle. Two properties matter more than anything else here:
 *
 *   1. Both routes in must reach the SAME identity. If a recovery code
 *      produced a different one, using it would silently orphan every
 *      message the person had ever received.
 *   2. Changing a password must not invalidate the recovery code, and must
 *      not change the identity. A password change that loses history is the
 *      worst bug this system can have.
 */

const PW = "correct horse battery staple";

describe("recovery codes", () => {
  it("are long enough to be unguessable, and grouped for writing down", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(normaliseRecoveryCode(code)).toHaveLength(20);
  });

  it("never repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, newRecoveryCode));
    expect(seen.size).toBe(200);
  });

  it("avoid characters that look like each other", () => {
    // I, L, O and U are absent by design — someone reads this off paper a
    // year later.
    const codes = Array.from({ length: 100 }, newRecoveryCode).join("");
    expect(codes).not.toMatch(/[ILOU]/);
  });

  it("forgives how a person actually types it back", () => {
    const code = newRecoveryCode();
    const canonical = normaliseRecoveryCode(code);
    expect(normaliseRecoveryCode(code.toLowerCase())).toBe(canonical);
    expect(normaliseRecoveryCode(code.replace(/-/g, " "))).toBe(canonical);
    expect(normaliseRecoveryCode(`  ${code}  `)).toBe(canonical);
  });

  it("reads look-alike characters as what was meant", () => {
    expect(normaliseRecoveryCode("O0O0O")).toBe("00000");
    expect(normaliseRecoveryCode("IL1")).toBe("111");
    expect(normaliseRecoveryCode("U")).toBe("V");
  });
});

describe("createVault", () => {
  it("stores nothing the server could use", () => {
    const { vault } = createVault(PW, newRecoveryCode());
    const blob = JSON.stringify(vault);
    expect(blob).not.toContain(PW);
    expect(blob).not.toContain("correct horse");
  });

  it("gives two different users different identities for the same password", () => {
    const a = createVault(PW, newRecoveryCode());
    const b = createVault(PW, newRecoveryCode());
    expect(a.vault.identity_pub).not.toBe(b.vault.identity_pub);
    // And different salts, so one cracked password says nothing about another.
    expect(a.vault.salt_pw).not.toBe(b.vault.salt_pw);
  });

  it("publishes the public keys of the identity it wrapped", () => {
    const { vault, identity } = createVault(PW, newRecoveryCode());
    expect(vault.identity_pub).toBe(toB64(identity.boxPub));
    expect(vault.signing_pub).toBe(toB64(identity.signPub));
  });
});

describe("openVault", () => {
  it("opens with the password", () => {
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const opened = openVault(made.vault, { kind: "password", secret: PW });
    expect(opened).not.toBeNull();
    expect(opened!.seed).toEqual(made.seed);
  });

  it("opens with the recovery code, reaching the SAME identity", () => {
    // If these diverged, recovering would orphan every message received.
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const opened = openVault(made.vault, { kind: "recovery", secret: code });
    expect(opened).not.toBeNull();
    expect(opened!.seed).toEqual(made.seed);
    expect(toB64(opened!.identity.boxPub)).toBe(made.vault.identity_pub);
  });

  it("opens with a sloppily typed recovery code", () => {
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const typed = code.toLowerCase().replace(/-/g, " ");
    expect(openVault(made.vault, { kind: "recovery", secret: typed })).not.toBeNull();
  });

  it("refuses the wrong password", () => {
    const made = createVault(PW, newRecoveryCode());
    expect(openVault(made.vault, { kind: "password", secret: "nearly right" })).toBeNull();
  });

  it("refuses the wrong recovery code", () => {
    const made = createVault(PW, newRecoveryCode());
    expect(openVault(made.vault, { kind: "recovery", secret: newRecoveryCode() })).toBeNull();
  });

  it("refuses a vault whose identity does not match its seed", () => {
    // A corrupted or hand-edited row must not send messages under a key
    // nobody can answer.
    const made = createVault(PW, newRecoveryCode());
    const other = createVault(PW, newRecoveryCode());
    const tampered = { ...made.vault, identity_pub: other.vault.identity_pub };
    expect(openVault(tampered, { kind: "password", secret: PW })).toBeNull();
  });

  it("refuses a vault with a corrupted seed", () => {
    const made = createVault(PW, newRecoveryCode());
    const tampered = { ...made.vault, seed_wrapped: createVault(PW, newRecoveryCode()).vault.seed_wrapped };
    expect(openVault(tampered, { kind: "password", secret: PW })).toBeNull();
  });
});

describe("rewrapForPassword", () => {
  it("keeps the identity and the history after a password change", () => {
    const code = newRecoveryCode();
    const made = createVault(PW, code);

    const next = rewrapForPassword(made.vault, { kind: "password", secret: PW }, "a brand new password");
    expect(next).not.toBeNull();
    const updated = { ...made.vault, ...next! };

    const opened = openVault(updated, { kind: "password", secret: "a brand new password" });
    expect(opened).not.toBeNull();
    expect(opened!.seed).toEqual(made.seed);
  });

  it("leaves the recovery code working", () => {
    // A password change must not quietly burn the one route back in.
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const next = rewrapForPassword(made.vault, { kind: "password", secret: PW }, "new one")!;
    const updated = { ...made.vault, ...next };

    expect(openVault(updated, { kind: "recovery", secret: code })).not.toBeNull();
  });

  it("stops the old password working", () => {
    const made = createVault(PW, newRecoveryCode());
    const next = rewrapForPassword(made.vault, { kind: "password", secret: PW }, "new one")!;
    const updated = { ...made.vault, ...next };

    expect(openVault(updated, { kind: "password", secret: PW })).toBeNull();
  });

  it("can be driven by the recovery code — the path after a reset", () => {
    // A reset does not know the old password, so this is the only way to
    // re-attach a new one without losing everything.
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const next = rewrapForPassword(made.vault, { kind: "recovery", secret: code }, "set at reset")!;
    const updated = { ...made.vault, ...next };

    const opened = openVault(updated, { kind: "password", secret: "set at reset" });
    expect(opened!.seed).toEqual(made.seed);
  });

  it("refuses when the current secret is wrong", () => {
    const made = createVault(PW, newRecoveryCode());
    expect(rewrapForPassword(made.vault, { kind: "password", secret: "wrong" }, "new")).toBeNull();
  });
});

describe("rewrapForRecovery", () => {
  it("issues a new code that reaches the same identity", () => {
    const code = newRecoveryCode();
    const made = createVault(PW, code);
    const fresh = newRecoveryCode();

    const next = rewrapForRecovery(made.vault, { kind: "password", secret: PW }, fresh)!;
    const updated = { ...made.vault, ...next };

    const opened = openVault(updated, { kind: "recovery", secret: fresh });
    expect(opened!.seed).toEqual(made.seed);
    // And the spent one stops working.
    expect(openVault(updated, { kind: "recovery", secret: code })).toBeNull();
    // While the password is untouched.
    expect(openVault(updated, { kind: "password", secret: PW })).not.toBeNull();
  });

  it("refuses when the current secret is wrong", () => {
    const made = createVault(PW, newRecoveryCode());
    expect(rewrapForRecovery(made.vault, { kind: "recovery", secret: newRecoveryCode() }, newRecoveryCode())).toBeNull();
  });
});
