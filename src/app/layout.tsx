import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { ReferralTracker } from "@/components/growth/ReferralTracker";
import { ClientErrorReporter } from "@/components/pwa/ClientErrorReporter";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  // Render immediately with a system stack if the web font is slow/unavailable.
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.hypefy.chat"),
  title: {
    default: "Hypefy",
    template: "%s · Hypefy",
  },
  description: "Where your personality lives.",
  applicationName: "Hypefy",
  icons: {
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
        {/* Page views + custom events. Renders nothing and no-ops off
            Vercel, so local dev and the Android build are unaffected.
            The native shell loads app.hypefy.chat, so app traffic is measured
            here too rather than needing a separate mobile SDK. */}
        <Analytics />
        <RegisterSW />
        <ReferralTracker />
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
