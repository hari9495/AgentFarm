/**
 * Server-side helper for reading the portal_session cookie and verifying it
 * against the api-gateway.  Used in Server Components to guard portal pages.
 */
import { cookies } from 'next/headers';

type PortalSessionPayload = {
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
};

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export const getPortalSessionPayload = async (): Promise<PortalSessionPayload | null> => {
    const cookieStore = await cookies();
    const raw = cookieStore.get('portal_session');
    if (!raw?.value) return null;

    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/portal/auth/me`, {
            method: 'GET',
            headers: { Cookie: `portal_session=${raw.value}` },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        return (await res.json()) as PortalSessionPayload;
    } catch {
        return null;
    }
};
