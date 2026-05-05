import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
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

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable}`} suppressHydrationWarning>
            <body suppressHydrationWarning className="ops-shell">
                <div aria-hidden className="ops-ambient" />
                <div aria-hidden className="ops-grid" />
                <div aria-hidden className="ops-noise" />
                {children}
            </body>
        </html>
    );
}
