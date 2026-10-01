// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ArchivedDiary } from "@/lib/diary";

/**
 * Opening a past page. Deleting is the part that matters: it cannot be undone
 * and there is no copy anywhere, so it must take two deliberate taps and must
 * never happen on the page you were only looking at.
 */

const PAGE: ArchivedDiary = {
  text: "late night drive",
  audience: "close",
  track: null,
  writtenAt: "2026-09-19T23:48:00.000Z",
  endedHow: "replaced",
  color: "plum",
  imageUrl: null,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

type Props = {
  page: ArchivedDiary | null;
  onClose?: () => void;
  onDelete?: (writtenAt: string) => void;
  deleting?: boolean;
};

async function open(props: Props) {
  const { PastPageView } = await import("@/components/diary/PastPageView");
  const render = (p: Props) =>
    act(async () =>
      root.render(
        createElement(PastPageView, {
          hue: 265,
          name: "Crazie",
          avatarUrl: null,
          onClose: () => {},
          onDelete: () => {},
          ...p,
        }),
      ),
    );
  await render(props);
  return { render };
}

const view = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label^="Page from"]');
const button = (label: string) =>
  view()?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? null;
const byText = (text: string) =>
  [...(view()?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === text) ?? null;

describe("opening a past page", () => {
  it("shows nothing until a page is given", async () => {
    await open({ page: null });
    expect(view()).toBeNull();
  });

  it("shows the page's own words", async () => {
    await open({ page: PAGE });
    expect(view()!.textContent).toContain("late night drive");
    // And how it ended, which is the thing the archive cannot say in a tile.
    expect(view()!.textContent).toContain("Replaced by a newer page");
  });

  it("asks before deleting, and does nothing if you keep it", async () => {
    const onDelete = vi.fn();
    await open({ page: PAGE, onDelete });
    await act(async () => button("Delete this page for good")!.click());
    expect(onDelete).not.toHaveBeenCalled();
    expect(view()!.textContent).toContain("Gone for good");

    await act(async () => byText("Keep")!.click());
    expect(onDelete).not.toHaveBeenCalled();
    expect(view()!.textContent).not.toContain("Gone for good");
  });

  it("deletes the page you are looking at, once you have said so twice", async () => {
    const onDelete = vi.fn();
    await open({ page: PAGE, onDelete });
    await act(async () => button("Delete this page for good")!.click());
    await act(async () => button("Yes, delete this page for good")!.click());
    expect(onDelete).toHaveBeenCalledWith(PAGE.writtenAt);
  });

  it("does not carry a half-confirmed delete over to the next page you open", async () => {
    const onDelete = vi.fn();
    const { render } = await open({ page: PAGE, onDelete });
    await act(async () => button("Delete this page for good")!.click());
    expect(view()!.textContent).toContain("Gone for good");

    const other = { ...PAGE, writtenAt: "2026-09-18T10:00:00.000Z", text: "no thoughts" };
    await render({ page: other, onDelete });
    expect(view()!.textContent).not.toContain("Gone for good");
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    await open({ page: PAGE, onClose });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops listening for Escape once it is closed", async () => {
    const onClose = vi.fn();
    const { render } = await open({ page: PAGE, onClose });
    await render({ page: null, onClose });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
