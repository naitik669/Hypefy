// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act, useState } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { DateOfBirthPicker } from "@/components/ui/DateOfBirthPicker";

/**
 * The date-of-birth wheel keeps the pick, and never offers a date that does
 * not exist.
 *
 * It used to clamp the draft back into state from two effects. That was
 * wrong twice over: a setState in an effect body re-renders the whole sheet
 * for every move of a drum, and the first of those renders draws the
 * impossible date before the effect corrects it — and, worse for the person
 * using it, writing the clamp back DESTROYED the pick. Choose the 31st, pass
 * through February, come back to March, and the 31 had become 28.
 *
 * The clamp is derived now, so the illegal combination is withheld while the
 * number the person chose is still there to return to.
 */

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  /*
   * jsdom has no scrollTo, and the wheel calls it on the way to committing a
   * value — so without this, tapping a row throws before onChange is reached
   * and every assertion below fails against a correct component. It cost a
   * confused half hour: the browser looked like it had the same bug, but
   * there the sheet had simply been closed rather than confirmed, which
   * resets the draft by design.
   *
   * The stub moves scrollTop as a real scroll would, so the wheel's own
   * feedback guard sees what it expects.
   */
  Element.prototype.scrollTo = function (this: Element, opts?: unknown) {
    if (opts && typeof opts === "object" && "top" in opts) {
      this.scrollTop = Number((opts as { top: number }).top);
    }
  } as Element["scrollTo"];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** The picker with a value of its own, as every caller uses it. */
function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return createElement(DateOfBirthPicker, { value, onChange: setValue });
}

const texts = (sel: string) => [...document.body.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? "");

const openSheet = async () => {
  const trigger = document.body.querySelector("button[aria-haspopup=dialog]") as HTMLButtonElement;
  await act(async () => trigger.click());
};

/**
 * The wheel column with this accessible name.
 *
 * Searched from document.body rather than the render container: BottomSheet
 * renders through a portal, so none of the sheet is inside the root this
 * test mounted.
 */
function column(name: string): HTMLElement {
  const el = document.body.querySelector(`[aria-label="${name}"]`);
  if (!el) throw new Error(`no ${name} column on screen`);
  return el as HTMLElement;
}

async function pick(name: string, label: string) {
  const option = [...column(name).querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!option) throw new Error(`${name} has no option ${label}`);
  await act(async () => option.click());
}

const dayOptions = () => texts('[aria-label="Day"] button');
const confirmLabel = () =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Use "))?.textContent ?? "";

describe("the day a month cannot have", () => {
  it("offers 31 in March and only 28 in February", async () => {
    await act(async () => root.render(createElement(Harness, { initial: "2000-03-31" })));
    await openSheet();
    expect(dayOptions()).toContain("31");

    await pick("Month", "Feb");
    // 2000 is a leap year, so February really does have 29 — using a real
    // month length rather than a flat 28 is the point of daysInMonth.
    expect(dayOptions()).toContain("29");
    expect(dayOptions(), "February offered a day it does not have").not.toContain("30");
    expect(dayOptions()).not.toContain("31");
  });

  it("never names an impossible date on the button that commits it", async () => {
    /*
     * The frame the old effect could not prevent. The button says what will
     * be stored, so if it can read "Use Feb 31, 2000" for even one render,
     * a fast tap stores it.
     */
    await act(async () => root.render(createElement(Harness, { initial: "2000-03-31" })));
    await openSheet();
    await pick("Month", "Feb");
    expect(confirmLabel()).toBe("Use Feb 29, 2000");
  });

  it("gives the 31st back when the month can hold it again", async () => {
    /*
     * The behaviour the old clamp destroyed, and the reason this is a fix
     * rather than a tidy-up: the pick survives the journey.
     */
    await act(async () => root.render(createElement(Harness, { initial: "2000-03-31" })));
    await openSheet();
    await pick("Month", "Feb");
    expect(confirmLabel()).toBe("Use Feb 29, 2000");
    await pick("Month", "Mar");
    expect(confirmLabel(), "the 31 was overwritten rather than withheld").toBe("Use Mar 31, 2000");
  });

  it("the drum highlights the day that will actually be stored", async () => {
    /*
     * Added after a mutation survived: showing the raw draft in the day
     * column passed every other test here. It is not cosmetic — the wheel
     * resolves an unknown value to index 0, so the drum would sit on the 1st
     * while the button underneath said the 29th, and whichever one the
     * person believes, the other is lying.
     */
    await act(async () => root.render(createElement(Harness, { initial: "2000-03-31" })));
    await openSheet();
    await pick("Month", "Feb");
    const selected = [...column("Day").querySelectorAll("button")].filter(
      (b) => b.getAttribute("aria-selected") === "true",
    );
    expect(selected.map((b) => b.textContent?.trim())).toEqual(["29"]);
  });

  it("withholds a month that has not happened yet this year", async () => {
    /*
     * The other half of "legal", and the case none of the above reached:
     * the month list is truncated in the CURRENT year, so a draft of
     * December survives a switch to this year and has to be clamped by the
     * same derivation. A mutation that built the day column from the
     * unclamped month survived until this existed.
     */
    const now = new Date();
    const thisYear = now.getFullYear();
    await act(async () => root.render(createElement(Harness, { initial: "2000-12-31" })));
    await openSheet();
    await pick("Year", String(thisYear));

    const months = texts('[aria-label="Month"] button');
    expect(months.length, "the whole year was offered before it happened").toBe(now.getMonth() + 1);

    // Both drums clamp: the month to the last one that has started, and the
    // day to today — a birthday cannot be in the future.
    const lastMonth = months[months.length - 1];
    const days = dayOptions();
    expect(days.length).toBe(now.getDate());
    expect(confirmLabel()).toBe(`Use ${lastMonth} ${now.getDate()}, ${thisYear}`);
  });

  it("commits the legal date, not the draft behind it", async () => {
    /*
     * The one that would be a data defect rather than a visual one. The
     * draft still holds 31 while February is showing; committing must store
     * what the button says, or the field ends up with 2000-02-31 — which
     * parseDob refuses, so the person is told their own pick is invalid.
     */
    await act(async () => root.render(createElement(Harness, { initial: "2000-03-31" })));
    await openSheet();
    await pick("Month", "Feb");
    const confirm = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Use "),
    ) as HTMLButtonElement;
    await act(async () => confirm.click());
    const trigger = document.body.querySelector("button[aria-haspopup=dialog]") as HTMLButtonElement;
    expect(trigger.textContent).toContain("February 29, 2000");
  });
});

describe("the sheet does not render the illegal state at all", () => {
  it("clamps without a second render, so no effect writes the draft back", () => {
    /*
     * Source-read on purpose: "it settled on the right value" cannot
     * distinguish deriving from correcting, because both end up correct.
     * What separates them is whether a render happened in between, and the
     * absence of the write is what says so.
     */
    const src = readFileSync("src/components/ui/DateOfBirthPicker.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src, "the clamp went back into an effect").not.toMatch(/useEffect/);
    expect(src).toMatch(/const mSafe = Math\.min/);
    expect(src).toMatch(/const dSafe = Math\.min/);
    expect(src, "the raw draft is still what gets stored").toMatch(
      /composeDob\(y, mSafe, dSafe\)/,
    );
  });
});
