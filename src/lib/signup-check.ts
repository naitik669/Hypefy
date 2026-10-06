/**
 * What stands between a filled-in sign-up form and its button.
 */

/**
 * The shortest password a new account may have.
 *
 * Sign-up took six characters while changing or resetting a password
 * demanded eight, so the weakest passwords in the system were the ones
 * people chose first. One number for all three now. Existing accounts with a
 * shorter password can still sign in: this is only asked of new ones.
 */
export const MIN_PASSWORD = 8;

/**
 * Why Create account is not available yet, in words, or null when it is.
 *
 * The button was simply greyed out until a date of birth and the consent box
 * were both in, with nothing saying which was missing. One thing at a time,
 * in the order the form asks for them. Being under 13 has its own line on
 * the form and is not repeated here.
 */
export function signupMissing(form: {
  email: string;
  password: string;
  dob: string;
  age: number | null;
  consent: boolean;
}): string | null {
  if (!form.email.trim()) return "Add your email to continue.";
  if (form.password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (!form.dob || form.age === null) return "Add your date of birth to continue.";
  if (form.age < 13) return null;
  if (!form.consent) return "Tick the box to agree to the terms.";
  return null;
}
