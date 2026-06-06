export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full bg-black">
      {/* Light beam — fixed so it stays while scrolling */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-1/3 right-0 h-[120%] w-[70%] origin-top animate-beam bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.16),_transparent_55%)] blur-2xl" />
        <div className="absolute -top-1/4 left-1/2 h-[80%] w-[40%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_60%)] blur-3xl" />
      </div>

      {/*
        Scrollable column — critical for mobile:
        When the soft keyboard opens it shrinks the viewport, so a
        flex-centered layout gets clipped. Using a scrollable block with
        auto vertical padding lets the form stay fully visible and reachable.
      */}
      <div className="relative z-10 flex min-h-dvh w-full flex-col items-center overflow-y-auto px-5 py-12">
        <div className="my-auto w-full max-w-[360px]">{children}</div>
      </div>
    </div>
  );
}
