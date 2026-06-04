import { redirect } from 'next/navigation';
import { getSessionPayload } from '../../lib/internal-session';
import SsoSettingsClient from './sso-settings-client';

export const metadata = { title: 'SSO / SAML · AgentFarm' };

export default async function SsoSettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/settings/sso');
    return <SsoSettingsClient />;
}
