import { router } from "expo-router";
import { IntroCarousel } from "@/onboarding/IntroCarousel";

/**
 * The signed-out front door, as the web has it at /onboarding.
 *
 * The three ways out now go where the web's go. "Get Hyped" on the last
 * slide and "Skip" both lead to sign-up, which is what the web's finale
 * asks for; "Sign in" goes to sign-in; and "look around first" is the way
 * in that is not a form.
 *
 * **Looking around first does not work yet**, and the carousel says so
 * rather than appearing to offer it: the feed behind it needs a session to
 * read anything, so the anonymous shell is its own piece of work. It sends
 * people to sign-up for now, which is a worse answer than the web's and is
 * recorded as one instead of being dressed up.
 */
export default function Onboarding() {
  return (
    <IntroCarousel
      onFinish={() => router.replace("/signup")}
      onSignIn={() => router.replace("/signin")}
    />
  );
}
