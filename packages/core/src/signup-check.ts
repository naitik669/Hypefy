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

/** The youngest Hypefy will take an account from. */
export const MIN_AGE = 13;

/**
 * Whole years old today, from a `YYYY-MM-DD` date of birth, or null when
 * there is no usable date.
 *
 * This lived inside AuthCard as an inline closure. It is here because the
 * phone asks the same question and `signupMissing` already takes `age` as
 * an input — so with the calculation left in the web component there were
 * two of it, and the one that matters most is the age gate. "Not yet had
 * this year's birthday" is the part that is easy to get wrong and silent
 * when it is: a thirteen-year-old whose birthday is next month would be
 * let in a year early.
 */
export function ageFromDob(dob: string, now: Date = new Date()): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getFullYear() - born.getFullYear();
  const months = now.getMonth() - born.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

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
  if (form.age < MIN_AGE) return null;
  if (!form.consent) return "Tick the box to agree to the terms.";
  return null;
}
