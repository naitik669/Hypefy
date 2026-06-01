export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-black px-6">
      {/* Light beam sweeping from the top-right, per the reference */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-1/3 right-0 h-[120%] w-[70%] origin-top animate-beam bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.16),_transparent_55%)] blur-2xl" />
        <div className="absolute -top-1/4 left-1/2 h-[80%] w-[40%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_60%)] blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[360px]">{children}</div>
    </div>
  );
}
