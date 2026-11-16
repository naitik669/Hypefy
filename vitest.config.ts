import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    /*
     * Vitest resolves these itself — it does not read tsconfig `paths`, which
     * is why adding a path there is not enough on its own and both files have
     * to agree.
     *
     * Ordered, and @hypefy/core comes first: Vite takes the first `find` that
     * matches and does not fall through, so a broader alias listed above a
     * narrower one would swallow it.
     */
    alias: [
      {
        find: "@hypefy/tokens",
        replacement: fileURLToPath(new URL("./packages/tokens/src/index.ts", import.meta.url)),
      },
      {
        find: "@hypefy/core",
        replacement: fileURLToPath(new URL("./packages/core/src", import.meta.url)),
      },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    /*
     * Installs the web key-value store for the whole suite, the same way the
     * root layout installs it in the browser. The modules that moved into
     * @hypefy/core behind the Kv interface read through `kv()`, and without
     * this their existing tests would have had to be edited to install one —
     * which is exactly what the move was not allowed to require.
     */
    setupFiles: ["./tests/setup.ts"],
    // The E2EE modules are parked in the app (flag.ts defaults to off) but
    // still have to be proven correct, so their tests run with it on. The
    // one file that checks the OFF behaviour re-imports with the flag "off".
    env: { NEXT_PUBLIC_E2EE: "on" },
    // The heaviest of these render the whole chat thread in jsdom. Alone
    // they take a couple of seconds; run alongside everything else on a
    // busy machine they would pass five and fail on the clock rather than
    // on anything they were checking. A test that has genuinely hung still
    // fails — it just has room to be slow first.
    testTimeout: 30_000,
  },
});
