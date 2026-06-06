import type { ReactNode } from 'react';
import { PortalNav } from './portal-nav';

export default function PortalLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <PortalNav />
            {children}
        </>
    );
}
