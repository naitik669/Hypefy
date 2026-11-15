/**
 * The app's sign-in return link, registered in AndroidManifest.xml. Kept out
 * of native-auth.ts (a client module) so the server callback can use it too.
 */
export const NATIVE_AUTH_REDIRECT = "chat.hypefy://auth/callback";

/**
 * Where Google sign-in from the app returns to: the website's own callback,
 * which bounces the code into the app. Going through the site rather than
 * straight to chat.hypefy:// means the return only needs the site's callback
 * to be an allowed redirect in Supabase, which web sign-in already requires.
 * When the app link itself wasn't allowed, Supabase quietly sent people to
 * the website instead, and they ended up signed in to the browser tab.
 */
export function nativeReturnUrl(origin: string): string {
  return `${origin}/auth/callback?app=1`;
}
