import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json stays the configuration. This file exists for one value that a
 * static JSON file cannot hold: where google-services.json is.
 *
 * The file is not committed. It is an EAS environment variable of type
 * "file" named GOOGLE_SERVICES_JSON; on an EAS build that variable holds the
 * PATH of a temporary copy of the file, and this function hands that path to
 * `android.googleServicesFile`. Without it the build has no Firebase config,
 * `getDevicePushTokenAsync` rejects, and enablePush (src/notifications/push.ts)
 * reports "failed" on every device. Nothing else would say so.
 *
 * With no variable set, the path falls back to ./google-services.json, which
 * .gitignore keeps out of the repo, so a local prebuild works with a copy of
 * the file dropped next to this one. A build with neither does NOT quietly
 * produce an app without push: expo's prebuild throws "Cannot copy
 * google-services.json", which is the failure wanted.
 *
 * Firebase project: hypefy-4f6bb, the same one src/lib/fcm.ts sends through.
 */
export const GOOGLE_SERVICES_FALLBACK = "./google-services.json";

export function googleServicesFile(env: Record<string, string | undefined>): string {
  const fromEas = env.GOOGLE_SERVICES_JSON;
  return fromEas && fromEas.length > 0 ? fromEas : GOOGLE_SERVICES_FALLBACK;
}

export function withGoogleServices(
  config: ConfigContext["config"],
  env: Record<string, string | undefined>,
): ExpoConfig {
  return {
    ...config,
    android: { ...config.android, googleServicesFile: googleServicesFile(env) },
  } as ExpoConfig;
}

export default ({ config }: ConfigContext): ExpoConfig => withGoogleServices(config, process.env);
