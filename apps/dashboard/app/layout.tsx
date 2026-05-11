import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import { SubscriptionBanner } from './components/subscription-banner';
import { SuspensionWall } from './components/suspension-wall';
import { getSessionPayload } from './lib/internal-session';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-space-grotesk',
});

const plexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-plex-mono',
});

export const metadata: Metadata = {
    title: 'AgentFarm Internal Dashboard',
    description: 'Internal operations dashboard for runtime, approvals, and evidence monitoring.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
    const session = await getSessionPayload();
    const tenantId = session?.tenantId ?? '';
    return (
        <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable}`} suppressHydrationWarning>
            <body suppressHydrationWarning className="ops-shell">
                <div aria-hidden className="ops-ambient" />
                <div aria-hidden className="ops-grid" />
                <div aria-hidden className="ops-noise" />
                <SuspensionWall tenantId={tenantId}>
                    <SubscriptionBanner tenantId={tenantId} />
                    {children}
                </SuspensionWall>
            </body>
        </html>
    );
}
