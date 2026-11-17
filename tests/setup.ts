import { installKv } from "@hypefy/core/kv";
import { webKv } from "@/lib/kv-web";

/**
 * Web storage, when the Node running the suite has taken the name.
 *
 * Node 22 added a built-in `localStorage`, and from Node 26 it is present
 * on every run: a global whose getter warns and returns `undefined` unless
 * the process was started with `--localstorage-file`. Vitest's jsdom
 * environment copies jsdom's window properties onto the existing global
 * object — `window === globalThis` under it — and that collision is won by
 * Node, so `localStorage` ends up undefined and jsdom's real one is not
 * reachable from anywhere.
 *
 * The symptom is brutal out of proportion to the cause: `localStorage` is
 * undefined rather than throwing, so every `beforeEach` that clears it dies
 * with "Cannot read properties of undefined", and 219 tests across 23 files
 * fail for a reason none of them are about.
 *
 * CI pins Node 20, which has no such global, so this never fired there —
 * the suite was green in CI and red on a developer's machine, which is the
 * worst way round. Rather than pin Node locally and let the drift sit, the
 * suite supplies its own storage when and only when the global is missing.
 * On Node 20 the branch below does nothing and jsdom's real Storage is
 * used, exactly as before.
 *
 * This is a stand-in for a missing global, not a change of behaviour: the
 * Storage jsdom provides is itself in-memory and per-realm, so what the
 * tests exercise is the same.
 */
function installWebStorage(): void {
  const g = globalThis as Record<string, unknown>;

  /*
   * Only where there is a document.
   *
   * Files that declare `@vitest-environment node` — fcm-service-account and
   * chat-video-ssr — run server code and must not be handed web storage
   * they would never have in production.
   *
   * This guard is belt-and-braces now rather than load-bearing, and the
   * mutation run says so: removing it breaks nothing. It was load-bearing
   * against an earlier version of this code that patched the existing
   * `Storage.prototype`, which threw "Cannot redefine property: length"
   * against Node's own `Storage` and stopped those files collecting at all
   * — no failing assertion, just no tests. The class below touches no
   * existing prototype, so that failure is gone. The guard stays because
   * handing server-environment code a localStorage is wrong regardless of
   * whether anything currently notices.
   */
  if (typeof document === "undefined") return;

  const names = ["localStorage", "sessionStorage"] as const;
  // Both present and usable: do nothing at all. This is the CI path, and
  // the path on any Node that has not claimed either name.
  if (names.every((n) => g[n])) return;

  /*
   * All or nothing, deliberately.
   *
   * Node 26 is inconsistent about these two: `sessionStorage` works in
   * memory, while `localStorage` warns and is undefined unless the process
   * was started with `--localstorage-file`. Replacing only the missing one
   * left `sessionStorage` as Node's instance while the global `Storage`
   * became the class below, so `sessionStorage instanceof Storage` was
   * false and `Storage.prototype.setItem = …` in a test reached nothing it
   * would ever call.
   *
   * show-carry-celebrate's "storage being unavailable loses the sticker"
   * is exactly that test, and it failed by passing a write through that it
   * had every reason to believe was broken. So once either is replaced,
   * both are, and the invariant the tests rely on holds: both storages are
   * instances of the one global `Storage`.
   */

  const cellsFor = new WeakMap<object, Map<string, string>>();
  const cells = (self: object): Map<string, string> => {
    let m = cellsFor.get(self);
    if (!m) {
      m = new Map();
      cellsFor.set(self, m);
    }
    return m;
  };

  /*
   * A class, and `globalThis.Storage` is replaced with it rather than the
   * existing one being patched.
   *
   * Reusing whatever `Storage` happened to be there did not work: Node 22+
   * provides a `Storage` global of its own beside jsdom's, and the one
   * visible from a test file was not the one visible during setup, so
   * `Object.getPrototypeOf(sessionStorage) === Storage.prototype` came out
   * FALSE and a prototype patch in a test reached nothing. Owning the
   * identity outright is the only way to make that equality hold.
   *
   * Class methods live on the prototype and instances carry none of their
   * own. tests/chat-outbox.test.ts spies on `Storage.prototype.getItem` and
   * show-carry-celebrate assigns `Storage.prototype.setItem` directly, so
   * both depend on the instances inheriting rather than owning those
   * methods.
   *
   * Not mutation-proven, and said plainly rather than left to look proven:
   * a mutant that gave the instance its own methods was not caught, because
   * the only shadowing mutant worth writing still delegated to the
   * prototype and so the spies still fired. A mutant that shadowed WITHOUT
   * delegating would be caught, but it is also not a mistake anyone would
   * make. The prototype placement is the right shape; the tests above
   * constrain it less tightly than the rest of this file is constrained.
   */
  class MemoryStorage {
    get length(): number {
      return cells(this).size;
    }
    key(index: number): string | null {
      return [...cells(this).keys()][index] ?? null;
    }
    getItem(key: string): string | null {
      // Spec: a missing key is null, never undefined. Modules here branch
      // on `=== null`, so undefined would quietly change behaviour.
      const m = cells(this);
      const k = String(key);
      return m.has(k) ? (m.get(k) as string) : null;
    }
    setItem(key: string, value: string): void {
      // Spec: both are stringified. A test that stores a number and reads
      // a string back is relying on this.
      cells(this).set(String(key), String(value));
    }
    removeItem(key: string): void {
      cells(this).delete(String(key));
    }
    clear(): void {
      cells(this).clear();
    }
  }

  Object.defineProperty(globalThis, "Storage", {
    value: MemoryStorage,
    configurable: true,
    writable: true,
  });

  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      // Separate instances, so clearing one does not clear the other.
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }
}

installWebStorage();

/**
 * The web's key-value store, installed for the whole suite.
 *
 * The modules that moved into @hypefy/core behind the Kv interface read
 * through `kv()`, which returns a store that remembers nothing until one is
 * installed. Their existing tests clear `localStorage` in beforeEach and
 * expect localStorage-backed behaviour, and the point of the move was that
 * NONE of those tests should need changing — the same property Phase 2's
 * acceptance rested on. So the store is installed here, once, exactly as
 * the browser app installs it in the root layout.
 *
 * jsdom provides localStorage, so webKv is the real implementation rather
 * than a stand-in, and the tests go on exercising the same storage they
 * always did.
 *
 * A test that wants an uninstalled store, or an isolated one, calls
 * resetKv() or installKv(memoryKv()) itself — see tests/kv.test.ts.
 */
installKv(webKv);
