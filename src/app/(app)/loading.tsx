/**
 * The fallback for any page without a loading shape of its own (Settings,
 * Marketplace, Saved, Premium…).
 *
 * It used to draw a whole Home feed, which is the wrong page for all of them.
 * Now it draws nothing at first: most of these load in well under half a
 * second, and a placeholder that flashes for 100ms makes a fast page feel
 * slow. Only if the wait runs past 0.4s do three small dots fade in.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex min-h-[60dvh] items-center justify-center">
      <span className="loading-late flex gap-1.5">
        {[0, 0.15, 0.3].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-muted/70" style={{ animationDelay: `${d}s` }} />
        ))}
      </span>
    </div>
  );
}
