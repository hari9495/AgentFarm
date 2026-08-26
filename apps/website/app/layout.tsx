import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/shared/ToastProvider";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import CookieConsent from "@/components/shared/CookieConsent";
import ScrollToTop from "@/components/shared/ScrollToTop";
import CartProvider from "@/components/shared/CartProvider";
import MotionProvider from "@/components/shared/MotionProvider";
import MarketingShell from "@/components/layout/MarketingShell";
import { organizationSchema, websiteSchema, softwareApplicationSchema } from "@/lib/seo-schemas";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://agentfarms.in";
const BRAND = "AgentFarms";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

// Operations Console redesign — characterful display + evidence mono.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1c" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  // ── Title template ──────────────────────────────────────────────────────────
  title: {
    default: `${BRAND} — AI Workers That Ship With Human Control`,
    template: `%s | ${BRAND}`,
  },

  // ── Core meta ───────────────────────────────────────────────────────────────
  description:
    "Deploy governed AI workers that execute real tasks inside your tools, stop at approval boundaries, and leave a full evidence trail. 12 roles, 18 connectors.",
  keywords: [
    "AI workers", "AI agents platform", "governed AI", "AI automation",
    "AI staffing platform", "AI backend developer", "AI QA engineer",
    "AI project manager", "AI customer support", "approval gates AI",
    "human in the loop AI", "AI evidence trail", "enterprise AI workers",
    "AgentFarms", "AI workforce", "autonomous AI agents India",
    "AI worker deployment", "AI tool connectors", "AI task execution",
  ],
  authors: [{ name: `${BRAND} Team`, url: `${BASE_URL}/about` }],
  creator: BRAND,
  publisher: BRAND,
  category: "Technology",
  classification: "Business Software / AI Platform",

  // ── Robots ──────────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ── Open Graph ──────────────────────────────────────────────────────────────
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: BASE_URL,
    siteName: BRAND,
    title: `${BRAND} — AI Workers That Ship With Human Control`,
    description:
      "Deploy governed AI workers that execute tasks inside your tools, stop at approval boundaries, and leave a full evidence trail. 12 specialist roles, 18 connectors.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND} — Governed AI Workers Platform`,
        type: "image/png",
      },
    ],
  },

  // ── Twitter / X ─────────────────────────────────────────────────────────────
  twitter: {
    card: "summary_large_image",
    site: "@agentfarms",
    creator: "@agentfarms",
    title: `${BRAND} — AI Workers That Ship With Human Control`,
    description:
      "Deploy governed AI workers that execute tasks inside your tools, stop at approval boundaries, and leave a full evidence trail.",
    images: ["/opengraph-image.png"],
  },

  // ── Alternates ──────────────────────────────────────────────────────────────
  alternates: {
    canonical: BASE_URL,
    types: {
      "application/rss+xml": `${BASE_URL}/blog/feed.xml`,
    },
  },

  // ── App links ───────────────────────────────────────────────────────────────
  applicationName: BRAND,

  // ── Manifest / icons ────────────────────────────────────────────────────────
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },

  // ── Other ───────────────────────────────────────────────────────────────────
  formatDetection: { email: false, address: false, telephone: false },
};

// ─── Global JSON-LD (organization, website, product) ─────────────────────────
const globalSchemas = [organizationSchema, websiteSchema, softwareApplicationSchema];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${inter.variable} ${bricolage.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Respect saved dark mode preference — external script avoids inline JS penalty */}
        <script src="/theme-init.js" />

        {/* Sitemap reference for crawlers */}
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />

        {/* DNS prefetch for external resources */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />

        {/* OpenSearch description for browser search bar integration */}
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title={BRAND}
          href="/opensearch.xml"
        />

        {/* Global JSON-LD — Organization + WebSite + SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalSchemas) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="site-shell antialiased"
      >
        <div aria-hidden className="site-ambient" />
        <div aria-hidden className="site-grid" />
        <ThemeProvider>
          <MotionProvider>
            <CartProvider>
              <MarketingShell>{children}</MarketingShell>
              <ToastProvider />
              <CookieConsent />
              <ScrollToTop />
            </CartProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
