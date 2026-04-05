import type { Metadata } from "next";
import Script from "next/script";
import { Outfit, Playfair_Display } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GrainOverlay } from "@/components/layout/GrainOverlay";
import { Interactions } from "@/components/layout/Interactions";
import { SignalFlow } from "@/components/signal-flow/SignalFlow";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { SITE } from "@/lib/constants";
import { organizationSchema } from "@/lib/structured-data";
import { CookieNotice } from "@/components/layout/CookieNotice";
import { ConsentAnalytics } from "@/components/layout/ConsentAnalytics";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dreamfree — Websites That Convert | The Signal Method",
    template: "%s — Dreamfree",
  },
  description: SITE.description,
  metadataBase: new URL(SITE.url),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${playfair.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <Script
          id="org-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema()),
          }}
        />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ConvexClientProvider>
          <GrainOverlay />
          <Interactions />
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
          <SignalFlow />
          <CookieNotice />
          <ConsentAnalytics />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
