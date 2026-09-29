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
  },
});
