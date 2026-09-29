/**
 * Ask the app shell to open the encryption setup or unlock sheet.
 *
 * A thread's composer and its locked bubbles know something needs doing but
 * do not own the sheet that does it — that lives in the app shell so it works
 * from anywhere. An event keeps the two apart: the thread says "someone
 * should help with this", and whichever state the account is actually in
 * decides what opens.
 */
export const E2EE_OPEN_SETUP = "hypefy:e2ee-open-setup";

export function openEncryptionSetup(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(E2EE_OPEN_SETUP));
}
