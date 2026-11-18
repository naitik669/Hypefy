import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  MIN_AGE,
  MIN_PASSWORD,
  ageFromDob,
  signupMissing,
} from "../packages/core/src/signup-check";
import { composeDob, daysInMonth, parseDob, MIN_DOB_YEAR } from "../packages/core/src/dob";
import { dobFromParts, digitsOnly } from "../apps/mobile/src/auth/dob-parts";
import { entryFor, routeFor } from "../apps/mobile/src/auth/entry";
import { nativeReturnUrl, NATIVE_AUTH_REDIRECT } from "../packages/core/src/native-auth-link";

/**
 * The phone's sign-in and sign-up.
 *
 * The parity instruction applies here as everywhere else, but this screen
 * has something the onboarding slides did not: a GATE. The password floor
 * and the age limit decide who gets an account, so "the two clients agree
 * today" is not good enough — they have to be one rule. The tests below
 * check that they are by calling the shared rule, and check the UI against
 * the web's source the way the slides are checked.
 */

const WEB = "src/components/auth/AuthCard.tsx";
const NATIVE = "apps/mobile/src/auth/AuthCard.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Source with comments gone — the trap that keeps reappearing here.
 *
 * The line-comment pattern is guarded against a preceding colon, which the
 * version used on the onboarding slides is not. This file is full of URLs,
 * and `"https://app.hypefy.chat"` contains a `//`: the unguarded strip cut
 * every one of them down to `"https:` and an assertion about the default
 * site origin failed against a file that was perfectly correct.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the age gate is one rule, not two that agree", () => {
  it("the web imports the calculation rather than keeping its own", () => {
    /*
     * This was an inline closure in AuthCard, and `signupMissing` already
     * took `age` as an input — so the figure the gate turns on was computed
     * in the component while the rule lived in core. The phone needing the
     * same number is what surfaced it. If a second copy ever reappears in
     * the web component, this fails.
     */
    const web = code(WEB);
    expect(web, "the web no longer imports ageFromDob").toMatch(
      /import \{[^}]*ageFromDob[^}]*\} from "@\/lib\/signup-check"/,
    );
    expect(web, "the web is computing an age of its own again").not.toMatch(
      /now\.getFullYear\(\) - b\w*\.getFullYear\(\)/,
    );
    expect(code(NATIVE), "the phone is computing an age of its own").not.toMatch(
      /getFullYear\(\) -/,
    );
  });

  it("neither client hard-codes the minimum age any more", () => {
    for (const path of [WEB, NATIVE]) {
      const src = code(path);
      expect(src, `${path} no longer uses MIN_AGE`).toContain("MIN_AGE");
      expect(src, `${path} still hard-codes 13 in a comparison`).not.toMatch(
        /age\s*<\s*13\b/,
      );
    }
  });

  it("and the phone takes the floor and the gate from core, not its own copies", () => {
    const src = code(NATIVE);
    expect(src).toMatch(
      /import \{[\s\S]*?MIN_AGE,[\s\S]*?MIN_PASSWORD,[\s\S]*?ageFromDob,[\s\S]*?signupMissing,[\s\S]*?\} from "@hypefy\/core\/signup-check"/,
    );
    expect(src, "the phone declares a password floor of its own").not.toMatch(
      /MIN_PASSWORD = /,
    );
  });

  it("ageFromDob counts whole years, not calendar years", () => {
    // The one that is easy to get wrong and silent when it is: a birthday
    // later this year has NOT happened yet.
    const now = new Date("2026-06-15T12:00:00Z");
    expect(ageFromDob("2013-06-14", now)).toBe(13); // yesterday
    expect(ageFromDob("2013-06-15", now)).toBe(13); // today
    expect(ageFromDob("2013-06-16", now)).toBe(12); // tomorrow
    expect(ageFromDob("2013-12-31", now)).toBe(12); // later this year
    expect(ageFromDob("2013-01-01", now)).toBe(13); // earlier this year
  });

  it("and refuses what is not a date", () => {
    expect(ageFromDob("")).toBeNull();
    expect(ageFromDob("not a date")).toBeNull();
  });

  it("a thirteen-year-old is in and a twelve-year-old is out, by the shared rule", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const form = { email: "m@example.test", password: "longenough", consent: true };

    const justThirteen = "2013-06-15";
    expect(ageFromDob(justThirteen, now)).toBe(MIN_AGE);
    expect(signupMissing({ ...form, dob: justThirteen, age: MIN_AGE })).toBeNull();

    // A day short. signupMissing returns null for an under-age form on
    // purpose — the form has its own line for that — so the gate is the
    // comparison, and both clients make it against MIN_AGE.
    const dayShort = "2013-06-16";
    expect(ageFromDob(dayShort, now)).toBe(MIN_AGE - 1);
  });
});

describe("the date of birth composes the same string on both clients", () => {
  it("pads both parts, as the stored value is padded", () => {
    expect(composeDob(2000, 0, 5)).toBe("2000-01-05");
    expect(composeDob(1999, 11, 31)).toBe("1999-12-31");
  });

  it("round-trips through parseDob", () => {
    const back = parseDob("2000-01-05");
    expect(back).toEqual({ year: 2000, monthIndex: 0, day: 5 });
    expect(composeDob(back!.year, back!.monthIndex, back!.day)).toBe("2000-01-05");
  });

  it("knows February, including the leap rules a hand-written check misses", () => {
    expect(daysInMonth(2024, 1)).toBe(29); // divisible by 4
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(1900, 1)).toBe(28); // divisible by 100, not 400
    expect(daysInMonth(2000, 1)).toBe(29); // divisible by 400
  });

  it("every month has the length it should", () => {
    const lengths = Array.from({ length: 12 }, (_, m) => daysInMonth(2023, m));
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it("and a date that does not exist is not a date", () => {
    expect(parseDob("2023-02-29")).toBeNull();
    expect(parseDob("2023-13-01")).toBeNull();
    expect(parseDob("2023-00-10")).toBeNull();
    expect(parseDob("2023-04-31")).toBeNull();
    expect(parseDob("23-04-01")).toBeNull();
    expect(parseDob("")).toBeNull();
  });

  it("the web's picker and the phone's field use the same rule", () => {
    /*
     * The two controls are different ON PURPOSE — a wheel in a sheet
     * against three number fields — so what is shared is the only part
     * that can disagree silently: which dates exist.
     */
    for (const path of ["src/components/ui/DateOfBirthPicker.tsx", "apps/mobile/src/auth/DobField.tsx"]) {
      expect(code(path), `${path} does not use the shared dob rules`).toMatch(
        /from "@(hypefy\/core|\/lib)\/dob"/,
      );
      expect(code(path), `${path} still has a daysInMonth of its own`).not.toMatch(
        /(const|function) daysInMonth/,
      );
    }
  });

  it("and the phone publishes nothing until the date is complete and real", () => {
    /*
     * Called, not read. The first version of this asserted `onChange("")`
     * appeared in DobField — which was satisfied by one of its two
     * branches while the other published a made-up date. Mutation C3 found
     * it, so the composing moved into dob-parts.ts where a test can run it.
     *
     * A half-typed year matters more than it looks: `new Date("0002-01-01")`
     * is a real date in the year 2, so publishing as someone types would
     * hand the age gate a two-thousand-year-old for three keystrokes.
     */
    expect(dobFromParts({ d: "05", m: "01", y: "2000" })).toBe("2000-01-05");

    // Incomplete, in each of the three ways.
    expect(dobFromParts({ d: "05", m: "01", y: "200" })).toBe("");
    expect(dobFromParts({ d: "", m: "01", y: "2000" })).toBe("");
    expect(dobFromParts({ d: "05", m: "", y: "2000" })).toBe("");

    // Complete and impossible.
    expect(dobFromParts({ d: "29", m: "02", y: "2023" })).toBe("");
    expect(dobFromParts({ d: "31", m: "04", y: "2000" })).toBe("");
    expect(dobFromParts({ d: "00", m: "01", y: "2000" })).toBe("");
    expect(dobFromParts({ d: "01", m: "13", y: "2000" })).toBe("");
    expect(dobFromParts({ d: "01", m: "00", y: "2000" })).toBe("");

    // And the one that exists only every fourth year.
    expect(dobFromParts({ d: "29", m: "02", y: "2024" })).toBe("2024-02-29");

    expect(MIN_DOB_YEAR).toBe(1900);
  });

  it("the three fields take digits and nothing else", () => {
    // A paste of "12/05" into the day field should not become "1205".
    expect(digitsOnly("12/05", 2)).toBe("12");
    expect(digitsOnly("1e5", 4)).toBe("15");
    expect(digitsOnly("-5", 2)).toBe("5");
    expect(digitsOnly("20000", 4)).toBe("2000");
    expect(digitsOnly("abc", 2)).toBe("");
  });
});

describe("the copy is the website's copy, word for word", () => {
  /** The web's `copy` table, parsed. */
  const webCopy = (() => {
    const src = code(WEB);
    const block = src.slice(src.indexOf("const copy = {"), src.indexOf("export function AuthCard"));
    const modes: Record<string, Record<string, string>> = {};
    for (const mode of ["signin", "signup"]) {
      const start = block.indexOf(`${mode}: {`);
      expect(start, `the web no longer has copy for ${mode}`).toBeGreaterThan(-1);
      const chunk = block.slice(start, block.indexOf("}", start));
      modes[mode] = Object.fromEntries(
        [...chunk.matchAll(/(\w+): "([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
    }
    return modes;
  })();

  it("the web still declares both modes with six fields each", () => {
    for (const mode of ["signin", "signup"]) {
      expect(Object.keys(webCopy[mode]).sort()).toEqual([
        "cta",
        "footerHref",
        "footerLink",
        "footerText",
        "googleLabel",
        "subtitle",
        "title",
      ]);
    }
  });

  for (const mode of ["signin", "signup"] as const) {
    it(`${mode}: every line appears in the phone's own COPY`, () => {
      const src = code(NATIVE);
      const start = src.indexOf(`  ${mode}: {`);
      expect(start, `the phone has no copy for ${mode}`).toBeGreaterThan(-1);
      const chunk = src.slice(start, src.indexOf("},", start));
      for (const [key, value] of Object.entries(webCopy[mode])) {
        expect(chunk, `${mode}.${key} does not match the web`).toContain(`${key}: "${value}"`);
      }
    });
  }

  it("and the three sign-up gate messages are the web's, word for word", () => {
    /*
     * These are refusals, which are the lines people read most carefully
     * and quote back. Checked as the templates both sides write, so that
     * MIN_AGE and MIN_PASSWORD moving moves both.
     */
    const web = code(WEB);
    const native = code(NATIVE);
    const count = (src: string, needle: string) => src.split(needle).length - 1;
    for (const line of [
      "You must be at least ${MIN_AGE} years old to use Hypefy.",
      "Please accept the Terms, Privacy Policy, and Community Guidelines.",
      "Use at least ${MIN_PASSWORD} characters for your password.",
    ]) {
      expect(web, `the web no longer says: ${line}`).toContain(line);
      /*
       * Counted, not merely present. Two of these appear twice on each
       * side — once on the form's path and once on Google's, which is the
       * web's own arrangement — so `toContain` was satisfied by one of the
       * pair while the other had been reworded. Mutation D13 found it.
       */
      expect(count(native, line), `the phone says this ${count(native, line)} times, the web ${count(web, line)}`).toBe(
        count(web, line),
      );
    }
  });

  it("the consent text names the same three documents", () => {
    /*
     * Checked inside the consent control, not anywhere in the file: the
     * gate messages above also name all three, so a file-wide search
     * passed while the checkbox beside them had lost "Community".
     * Mutation D15 found that.
     */
    const web = code(WEB);
    const native = code(NATIVE);
    const start = native.indexOf("accessibilityRole=\"checkbox\"");
    expect(start, "the consent checkbox is gone").toBeGreaterThan(-1);
    const control = native.slice(start, native.indexOf("</Pressable>", start));
    for (const doc of ["Terms", "Privacy Policy", "Community Guidelines"]) {
      expect(web).toContain(doc);
      expect(control, `the consent box no longer names ${doc}`).toContain(doc);
      // Twice: in the label a screen reader gets and in the text on screen.
      expect(
        control.split(doc).length - 1,
        `${doc} should be in both the label and the visible text`,
      ).toBe(2);
    }
  });
});

describe("the measurements are the website's", () => {
  const SCALE: ReadonlyArray<readonly [string, RegExp, string]> = [
    ["max-w-[360px]", /CARD_W = 360/, "the card's width"],
    ["rounded-[28px]", /borderRadius: 28/, "the card's radius"],
    ["p-7", /padding: 28/, "the card's padding"],
    ["text-[15px]", /fontSize: 15/, "the wordmark stamp"],
    ["text-[26px]", /fontSize: 26/, "the title"],
    ["text-[13px]", /fontSize: 13/, "the subtitle"],
    ["rounded-xl", /borderRadius: 12/, "their radius"],
    ["pr-11", /paddingRight: 44/, "the room the eye button needs"],
    ["h-4", /height: 16/, "the consent checkbox"],
  ];

  const web = code(WEB);
  const native = code(NATIVE);

  for (const [cls, re, what] of SCALE) {
    it(`${cls} — ${what}`, () => {
      expect(web, `the web no longer uses ${cls}`).toContain(cls);
      expect(native, `${what} does not match`).toMatch(re);
    });
  }

  it("every h-12 element is 48 high, each checked in its own style", () => {
    /*
     * The web gives the email field, the password field, the submit and the
     * Google button all `h-12`. `/height: 48/` anywhere in the file was
     * satisfied by whichever of them was still right — mutation D4 shrank
     * the input alone and passed. Four styles, four assertions.
     */
    expect(web, "the web no longer uses h-12").toContain("h-12");
    expect([...web.matchAll(/h-12/g)].length, "the web's h-12 count has changed").toBe(4);
    for (const key of ["input", "submit", "google"]) {
      const start = native.indexOf(`  ${key}: {`);
      expect(start, `${key} is not a style in the phone's card`).toBeGreaterThan(-1);
      const entry = native.slice(start, native.indexOf("},", start));
      expect(entry, `${key} is not 48 high`).toMatch(/height: 48\b/);
    }
    // The date-of-birth fields take the same height, from their own file.
    expect(code("apps/mobile/src/auth/DobField.tsx")).toMatch(/height: 48\b/);
  });

  it("the submit is white with black text, as the web's is", () => {
    // The one button in the app that is not accent. Reaching for the
    // accent here would look more Hypefy and be wrong.
    expect(web).toContain("bg-white text-sm font-semibold text-black");
    expect(native).toMatch(/backgroundColor: "#ffffff"/);
    expect(native).toMatch(/submitText: \{ color: "#000000"/);
  });

  it("and it presses to the web's 0.99", () => {
    expect(web).toContain("active:scale-[0.99]");
    expect(native).toMatch(/scale: 0\.99/);
  });

  it("the translucent fills are the web's, as rgba", () => {
    const FILLS: ReadonlyArray<readonly [string, string]> = [
      ["bg-white/[0.04]", "rgba(255, 255, 255, 0.04)"],
      ["bg-white/[0.06]", "rgba(255, 255, 255, 0.06)"],
      ["border-white/10", "rgba(255, 255, 255, 0.1)"],
      ["border-white/5", "rgba(255, 255, 255, 0.05)"],
      ["text-foreground/60", "rgba(255, 255, 255, 0.6)"],
      ["text-foreground/90", "rgba(255, 255, 255, 0.9)"],
      ["bg-accent/10", "rgba(163, 230, 53, 0.1)"],
      ["border-accent/20", "rgba(163, 230, 53, 0.2)"],
    ];
    for (const [cls, rgba] of FILLS) {
      expect(web, `the web no longer uses ${cls}`).toContain(cls);
      expect(native, `${cls} is missing from the phone`).toContain(rgba);
    }
  });

  it("the frosted glass is left out rather than faked", () => {
    /*
     * The web's card is a translucent fill over `backdrop-blur-2xl`. React
     * Native has no filter, and expo-blur is a native module — a cloud
     * build and the end of over-the-air delivery, for a background. The
     * fill is the same; the blur is absent and recorded as absent.
     */
    expect(web).toContain("backdrop-blur-2xl");
    expect(native, "something is pretending to be the blur").not.toMatch(/blur/i);
    expect(read(NATIVE), "the missing blur is no longer explained").toMatch(
      /no filter in React Native/,
    );
  });
});

describe("Google sign-in goes out and comes back the way the web's does", () => {
  const native = code(NATIVE);

  it("returns through the SITE's callback, not straight to the app's scheme", () => {
    /*
     * The reason is in core: going through the site means the only
     * redirect Supabase has to allow is the one web sign-in already
     * requires. When the app's own link was not on that list, Supabase
     * quietly sent people to the website and they ended up signed in to a
     * browser tab.
     */
    expect(native).toMatch(/redirectTo: nativeReturnUrl\(siteOrigin\(\)\)/);
    expect(nativeReturnUrl("https://app.hypefy.chat")).toBe(
      "https://app.hypefy.chat/auth/callback?app=1",
    );
    expect(native, "the app is asking Supabase to redirect to its own scheme").not.toContain(
      NATIVE_AUTH_REDIRECT,
    );
  });

  it("asks for the URL rather than a redirect, because there is no browser here", () => {
    expect(native).toMatch(/skipBrowserRedirect: true/);
    expect(native).toMatch(/Linking\.openURL\(data\.url\)/);
    expect(native, "the app opens a URL it has not checked it can open").toMatch(
      /Linking\.canOpenURL\(data\.url\)/,
    );
  });

  it("the exchange needs PKCE, and the client asks for it explicitly", () => {
    /*
     * exchangeCodeForSession trades the code using a verifier written when
     * the flow started. On the implicit flow there is nothing to exchange,
     * so this is not a hardening choice — the deep link would simply fail.
     */
    expect(code("apps/mobile/src/supabase.ts")).toMatch(/flowType: "pkce"/);
  });

  it("the callback route exists at the path the website bounces to", () => {
    expect(NATIVE_AUTH_REDIRECT).toBe("chat.hypefy://auth/callback");
    // chat.hypefy://auth/callback resolves to app/auth/callback.tsx.
    expect(existsSync("apps/mobile/app/auth/callback.tsx")).toBe(true);
    const app = JSON.parse(read("apps/mobile/app.json"));
    expect(app.expo.scheme, "the app's scheme no longer matches the bounce").toBe(
      NATIVE_AUTH_REDIRECT.split("://")[0],
    );
  });

  it("the callback exchanges the code and reads the session back from the store", () => {
    const cb = code("apps/mobile/app/auth/callback.tsx");
    expect(cb).toMatch(/exchangeCodeForSession\(params\.code\)/);
    /*
     * Read back rather than trusted: within one process a SecureStore
     * write that silently failed is indistinguishable from one that
     * worked, and the symptom is the app signing the person out on the
     * next launch with nothing to point at.
     */
    expect(cb, "the callback trusts the response instead of the store").toMatch(
      /getSession\(\)/,
    );
    expect(cb).toMatch(/did not save/);
  });

  it("and says what went wrong instead of bouncing back silently", () => {
    const cb = code("apps/mobile/app/auth/callback.tsx");
    // Google's own refusal arrives as error + error_description, which is
    // exactly what the website's callback forwards.
    expect(cb).toMatch(/params\.error_description \|\| params\.error/);
    expect(cb).toMatch(/carried no code/);
  });

  it("the website still forwards only what the app needs", () => {
    const route = code("src/app/auth/callback/route.ts");
    const m = route.match(/for \(const key of \[([^\]]+)\]\)/);
    expect(m, "the website's app bounce no longer filters its parameters").toBeTruthy();
    const keys = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(keys).toEqual(["code", "error", "error_description"]);
  });
});

describe("the site origin is config, not a constant", () => {
  it("falls back to production rather than throwing", () => {
    /*
     * A wrong origin breaks Google sign-in; a missing one would break
     * startup. Those are not the same severity, and supabase.ts already
     * throws for the config that genuinely cannot be guessed.
     */
    const src = code("apps/mobile/src/site.ts");
    expect(src).toContain('DEFAULT_SITE = "https://app.hypefy.chat"');
    expect(src, "a missing site URL now throws").not.toMatch(/throw/);
    expect(src, "a trailing slash would double the path's separator").toMatch(
      /replace\(\/\\\/\+\$\/, ""\)/,
    );
  });

  it("and every EXPO_PUBLIC name the app reads is supplied by every build profile", () => {
    /*
     * The same accounting as the Supabase keys, extended: a variable added
     * to the app fails this until the profiles catch up. A build that
     * installs and then cannot sign in with Google costs a full cloud
     * round trip to discover.
     */
    const sources = ["apps/mobile/src/site.ts", "apps/mobile/src/supabase.ts"];
    const wanted = new Set<string>();
    for (const path of sources) {
      for (const m of read(path).matchAll(/process\.env\.(EXPO_PUBLIC_\w+)/g)) {
        wanted.add(m[1]);
      }
    }
    expect(wanted.size, "the app reads no EXPO_PUBLIC config at all").toBeGreaterThan(0);

    const eas = JSON.parse(read("apps/mobile/eas.json"));
    const profiles = Object.entries(eas.build as Record<string, { env?: Record<string, string> }>);
    expect(profiles.length).toBeGreaterThan(0);
    for (const [name, profile] of profiles) {
      for (const key of wanted) {
        expect(profile.env?.[key], `${name} does not supply ${key}`).toBeTruthy();
      }
    }
  });
});

describe("the front door leads somewhere now", () => {
  it("the entry screen routes signed-out to onboarding and signed-in to home", () => {
    const src = code("apps/mobile/app/index.tsx");
    expect(src).toMatch(/routeFor/);
    expect(src).toMatch(/router\.replace\(to\)/);
  });

  it("and a session that cannot be READ is not treated as a sign-out", () => {
    /*
     * Called, not read. The first version asserted `kind: "failed"` and
     * the heading both appeared in index.tsx — and mutation G2 deleted the
     * error branch entirely while the type and the words stayed, so it
     * passed. The decision is in @/auth/entry now, where it can be run.
     *
     * getSession failing and getSession returning nothing are different
     * things. Collapsing them is how a device ends up asking someone to
     * sign in on every launch with nothing to point at, and the happy path
     * looks identical, so nothing else would notice.
     */
    expect(entryFor({ session: { user: {} }, error: null })).toEqual({ kind: "home" });
    expect(entryFor({ session: null, error: null })).toEqual({ kind: "onboarding" });
    expect(entryFor({ session: null, error: { message: "keychain unavailable" } })).toEqual({
      kind: "failed",
      message: "keychain unavailable",
    });
    // An error WITH a session is still an error — it is not a licence to
    // carry on with whatever came back beside it.
    expect(entryFor({ session: { user: {} }, error: { message: "stale" } }).kind).toBe("failed");

    // And a failure navigates nowhere, so the message stays on screen.
    expect(routeFor({ kind: "failed", message: "x" })).toBeNull();
    expect(routeFor({ kind: "home" })).toBe("/home");
    expect(routeFor({ kind: "onboarding" })).toBe("/onboarding");
  });

  it("the screen uses that decision rather than making its own", () => {
    const src = code("apps/mobile/app/index.tsx");
    expect(src).toMatch(/entryFor\(\{ session: data\?\.session \?\? null, error \}\)/);
    expect(src).toMatch(/const to = routeFor\(next\)/);
    expect(src, "the screen is deciding for itself again").not.toMatch(/\? "\/home" :/);
  });

  it("the carousel's three ways out go to the web's three destinations", () => {
    const onboarding = code("apps/mobile/app/onboarding.tsx");
    expect(onboarding).toMatch(/onFinish=\{\(\) => router\.replace\("\/signup"\)\}/);
    expect(onboarding).toMatch(/onSignIn=\{\(\) => router\.replace\("\/signin"\)\}/);
  });

  it("and sign-in and sign-up each point at the other", () => {
    const native = code(NATIVE);
    // The footer link is the web's own footerHref, so this is the same
    // navigation the site offers rather than a pair of guesses.
    expect(native).toMatch(/router\.replace\(t\.footerHref\)/);
    for (const route of ["signin", "signup"]) {
      expect(existsSync(`apps/mobile/app/${route}.tsx`), `/${route} is missing`).toBe(true);
    }
  });
});

describe("what this screen deliberately does not do yet", () => {
  it("no second account, and no pretence of one", () => {
    /*
     * `?add=1` is reached from Settings, which this app does not have —
     * and the account switcher keeps refresh tokens in web storage, which
     * is a decision of its own before it is ported. The web's own flow is
     * untouched.
     */
    expect(code(WEB)).toContain("addMode");
    expect(code(NATIVE), "an add-account mode appeared without being announced").not.toMatch(
      /addMode/,
    );
  });

  it("no recovery-code screen, because the flag is off", () => {
    expect(code(NATIVE)).not.toMatch(/RecoveryCode|ensureEncryption/);
  });

  it("and looking around first is honest about where it goes", () => {
    /*
     * The web's "look around first" reaches an anonymous shell. There is
     * no anonymous shell on the phone yet, so the link goes to sign-up —
     * which is a worse answer than the web's, and is written down as one
     * rather than dressed up as working.
     */
    const onboarding = read("apps/mobile/app/onboarding.tsx");
    expect(onboarding).toMatch(/does not work yet/);
  });
});
