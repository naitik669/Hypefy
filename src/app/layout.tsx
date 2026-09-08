import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { ReferralTracker } from "@/components/growth/ReferralTracker";
import { ClientErrorReporter } from "@/components/pwa/ClientErrorReporter";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { PostAuthTasks } from "@/components/auth/PostAuthTasks";
import { SavedAccountSync } from "@/components/auth/SavedAccountSync";

/**
 * Kept to things the app actually does. A splash is the first thing a new
 * account reads and a bad place to promise behaviour that does not exist.
 */
const SPLASH_FACTS = [
  "Shows disappear after a day. Your posts stay put.",
  "Hold the profile tab to switch accounts.",
  "Every profile carries a QR code. Scan to connect.",
  "Your profile is a canvas, not a template.",
  "Hype is applause you can actually see.",
];

/**
 * Decides the splash before anything is painted.
 *
 * Inline and blocking on purpose: any deferred check would land after first
 * paint, which is the single moment that matters. Route changes inside the
 * app do not re-render this layout, so a full document load is already a
 * decent proxy for "the app opened" — the session flag exists to catch
 * reloads and the hard navigation an account switch performs.
 */
const SPLASH_BOOT = `(function(){try{
if(/^\\/(privacy|terms|guidelines|gate)(\\/|$)/.test(location.pathname)
   || sessionStorage.getItem('hypefy_splash')==='1'){
  document.documentElement.dataset.splash='off';return;
}
sessionStorage.setItem('hypefy_splash','1');
}catch(e){}})();`;

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  // Render immediately with a system stack if the web font is slow/unavailable.
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.hypefy.chat"),
  title: {
    default: "Hypefy",
    template: "%s · Hypefy",
  },
  description: "Where your personality lives.",
  applicationName: "Hypefy",
  // Declaring `icons` at all switches off Next's file-convention
  // auto-linking, so src/app/icon.png would be served at /icon.png and
  // never referenced. Both entries have to be spelled out.
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    title: "Hypefy",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    siteName: "Hypefy",
    type: "website",
    title: "Hypefy",
    description: "Where your personality lives.",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hypefy",
    description: "Where your personality lives.",
    images: ["/og-default.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* The opening splash is removed for now, at request. Everything it
            needed is still here and unreferenced — SPLASH_BOOT, SPLASH_FACTS,
            AppSplash and the #hypefy-splash rules in globals.css — so putting
            it back is re-adding two lines rather than rebuilding it. */}
        {/* Page views + custom events. Renders nothing and no-ops off
            Vercel, so local dev and the Android build are unaffected.
            The native shell loads app.hypefy.chat, so app traffic is measured
            here too rather than needing a separate mobile SDK. */}
        <Analytics />
        <RegisterSW />
        <ReferralTracker />
        <ClientErrorReporter />
        {/* Finishes a Google sign-in that a full-page redirect cut short:
            the age gate for new accounts, and the session snapshot when
            adding one. Inert unless there is parked work. */}
        <PostAuthTasks />
        {/* Refresh-token rotation makes a stored account snapshot go stale
            the moment it is used; this keeps the switcher in step. */}
        <SavedAccountSync />
        {children}
      </body>
    </html>
  );
}
