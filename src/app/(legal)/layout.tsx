import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16">
      <header className="sticky top-0 z-10 -mx-5 flex items-center gap-2 chrome-bar px-3 pb-3 pt-[calc(0.75rem+var(--sat))]">
        <Link
          href="/"
          aria-label="Back to Hypefy"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <ChevronLeft size={22} />
        </Link>
        <span className="text-sm font-bold">Hypefy</span>
      </header>
      <article className="prose-hypefy mt-2 flex flex-col gap-4 text-sm leading-relaxed text-foreground/85 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-foreground [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
