import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/shared/ToastProvider";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import CookieConsent from "@/components/shared/CookieConsent";
import ScrollToTop from "@/components/shared/ScrollToTop";
import { Analytics } from "@vercel/analytics/react";
import CartProvider from "@/components/shared/CartProvider";
import MotionProvider from "@/components/shared/MotionProvider";
import MarketingShell from "@/components/layout/MarketingShell";

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
  title: "AgentFarm — Hire AI Employees for Your Engineering Team",
  description:
    "Deploy AI developers, QA engineers, and DevOps agents that work directly inside your GitHub and Slack.",
  openGraph: {
    title: "AgentFarm — Hire AI Employees for Your Engineering Team",
    description:
      "Deploy AI developers, QA engineers, and DevOps agents that work directly inside your GitHub and Slack.",
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
    "AI workforce platform for engineering teams. Deploy AI developers, QA engineers, and DevOps agents.",
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
    <html lang="en" className={`${manrope.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Prevent dark-mode flash of unstyled content */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('agentfarm-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
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


