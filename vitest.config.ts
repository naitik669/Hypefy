import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
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
