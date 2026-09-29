/**
 * Whether end-to-end encryption is switched on.
 *
 * Off by default. Hypefy launches on standard client-server encryption —
 * TLS in transit, encryption at rest, access controls — because E2EE blocks
 * the server-side moderation an app store and a young audience require, and
 * puts people's message history one lost recovery code away from gone.
 *
 * The E2EE implementation is parked, not deleted. With this off nothing is
 * sealed, no setup sheet or recovery screen appears, and no thread claims
 * anything about encryption; every module under lib/e2ee still works and
 * still has its tests. Turning it back on is `NEXT_PUBLIC_E2EE=on` and a
 * redeploy (the value is inlined at build time).
 *
 * Do not read the environment anywhere else. One constant means one place to
 * find out whether the feature is live.
 */
export const E2EE_ENABLED = process.env.NEXT_PUBLIC_E2EE === "on";
