import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { PlatformSettingsProvider } from "@/lib/platform-context";
import { AuthProvider } from "@/lib/auth-context";
import { LocationProvider } from "@/lib/location-context";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { LocationSelectorModal } from "@/components/layout/LocationSelectorModal";

export const metadata: Metadata = {
  metadataBase: new URL("https://55mosa.com"),
  title: {
    default: "55 MOSA — Global Community Commerce & Ground Discovery Network",
    template: "%s | 55 MOSA",
  },
  description:
    "Independent business discovery platform pioneering micro-enterprise visibility, authentic price transparency, and street-level landmark navigation worldwide.",
  alternates: {
    canonical: "https://55mosa.com",
  },
  openGraph: {
    title: "55 MOSA — Global Community Commerce & Ground Discovery Network",
    description:
      "Independent business discovery platform pioneering micro-enterprise visibility, authentic price transparency, and street-level landmark navigation worldwide.",
    url: "https://55mosa.com",
    siteName: "55 MOSA",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/mosa-logo.png",
        width: 512,
        height: 512,
        alt: "55 MOSA Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "55 MOSA — Global Community Commerce & Ground Discovery Network",
    description:
      "Independent business discovery platform pioneering micro-enterprise visibility, authentic price transparency, and street-level landmark navigation worldwide.",
    images: ["/mosa-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  keywords: [
    "55 MOSA",
    "MOSA",
    "Community Commerce",
    "Global Business Discovery",
    "Ground Discovery",
    "Micro Enterprise",
    "Authentic Price Intelligence",
    "Local Street Commerce",
  ],
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

import { TextSizeProvider } from "@/lib/text-size-context";
import { LightboxProvider } from "@/lib/lightbox-context";
import { CasualProtectionProvider } from "@/components/common/CasualProtectionProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://55mosa.com/#organization",
        name: "55 MOSA",
        url: "https://55mosa.com",
        logo: "https://55mosa.com/mosa-logo.png",
        description:
          "Independent business discovery platform pioneering micro-enterprise visibility, authentic price transparency, and street-level landmark navigation worldwide.",
      },
      {
        "@type": "WebSite",
        "@id": "https://55mosa.com/#website",
        url: "https://55mosa.com",
        name: "55 MOSA",
        publisher: { "@id": "https://55mosa.com/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://55mosa.com/search?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html lang="rw" data-text-size="normal">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased text-slate-900 bg-slate-50 font-sans selection:bg-emerald-100 selection:text-emerald-900 overflow-x-hidden">
        <TextSizeProvider>
          <PlatformSettingsProvider>
            <LanguageProvider>
              <AuthProvider>
                <LocationProvider>
                  <LightboxProvider>
                    <CasualProtectionProvider>
                      <OfflineBanner />
                      <Navbar />
                      <LocationSelectorModal />
                      <main className="flex-1 w-full overflow-x-hidden">{children}</main>
                      <Footer />
                    </CasualProtectionProvider>
                  </LightboxProvider>
                </LocationProvider>
              </AuthProvider>
            </LanguageProvider>
          </PlatformSettingsProvider>
        </TextSizeProvider>
      </body>
    </html>
  );
}
