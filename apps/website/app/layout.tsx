import type { Metadata } from "next";
import { Inter, Manrope, Sora } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/shared/ToastProvider";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import CookieConsent from "@/components/shared/CookieConsent";
import ScrollToTop from "@/components/shared/ScrollToTop";
import { Analytics } from "@vercel/analytics/react";
import CartProvider from "@/components/shared/CartProvider";
import MotionProvider from "@/components/shared/MotionProvider";
import MarketingShell from "@/components/layout/MarketingShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentfarm.ai"
  ),
  title: "AgentFarm — Trusted AI Teammates for Engineering Teams",
  description:
    "Augment engineering teams with secure AI teammates for development, QA, and operations with approval gates and audit-ready workflows.",
  openGraph: {
    title: "AgentFarm — Trusted AI Teammates for Engineering Teams",
    description:
      "Augment engineering teams with secure AI teammates for development, QA, and operations with approval gates and audit-ready workflows.",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AgentFarm",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description:
    "Trusted AI teammate platform for engineering teams. Run development, QA, and operations workflows with approvals and auditable evidence.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentfarm.ai",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free 14-day trial, no credit card required.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Default to dark mode — respect user preference or saved theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('agentfarm-theme');if(t==='light'){return}if(t==='dark'||!t){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning className="site-shell antialiased text-slate-900 dark:text-slate-50">
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
        <Analytics />
      </body>
    </html>
  );
}


