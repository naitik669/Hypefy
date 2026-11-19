import { Redirect } from "expo-router";

/**
 * The bar's create button needs a route to hang on; this is it.
 *
 * The button in `_layout.tsx` pushes `/create` itself, so this screen is
 * only reached if something navigates to the slot directly — a deep link,
 * or a restored navigation state. It redirects rather than rendering,
 * because landing on a blank tab is worse than arriving where you meant
 * to go.
 */
export default function CreateSlot() {
  return <Redirect href="/create" />;
}
