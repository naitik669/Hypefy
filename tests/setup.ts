import { installKv } from "@hypefy/core/kv";
import { webKv } from "@/lib/kv-web";

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
