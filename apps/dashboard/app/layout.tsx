import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import { SubscriptionBanner } from './components/subscription-banner';
import { SuspensionWall } from './components/suspension-wall';
import { getSessionPayload } from './lib/internal-session';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
});

const plexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-plex-mono',
});

// NOTE: despite the legacy "internal" naming on the session cookie/helpers in
// ./lib/internal-session.ts (a holdover from when this app was staff-only),
// this is the primary CUSTOMER/operator product dashboard — tenant admins and
// their teams log in here to run their AI agent fleet (agents, connectors,
// billing, governance, support, etc). AgentFarm staff also use it (with
// `scope: "internal"` sessions) for cross-tenant operations, but ordinary
// paying customers are the primary audience. The title/description below
// reflect that — do not revert to "Internal Dashboard" branding, which
// confused customers into thinking this was a staff-only console.
export const metadata: Metadata = {
    title: 'AgentFarms Dashboard',
    description: 'Manage your AI agent workspace — agents, connectors, billing, governance, and support.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
    const session = await getSessionPayload();
    const tenantId = session?.tenantId ?? '';
    return (
        <html lang="en" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
            <body suppressHydrationWarning className="ops-shell">
                <SuspensionWall tenantId={tenantId}>
                    <SubscriptionBanner tenantId={tenantId} />
                    {children}
                </SuspensionWall>
                <Toaster richColors position="bottom-right" />
            </body>
        </html>
    );
}
