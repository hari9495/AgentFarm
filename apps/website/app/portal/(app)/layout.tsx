import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
    Bot,
    BarChart3,
    CreditCard,
    User,
    LayoutDashboard,
    LogOut,
    Plug,
    LifeBuoy,
    Settings,
} from "lucide-react";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface SessionData {
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
}

interface BrandingData {
    company_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    portal_title: string | null;
    favicon_url: string | null;
    configured: boolean;
}

async function getSession(token: string): Promise<SessionData | null> {
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as SessionData;
    } catch {
        return null;
    }
}

async function getBranding(tenantId: string): Promise<BrandingData | null> {
    try {
        const res = await fetch(
            `${GATEWAY_URL}/portal/data/branding?tenant_id=${encodeURIComponent(tenantId)}`,
            { cache: "no-store" },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { branding?: BrandingData };
        return data.branding ?? null;
    } catch {
        return null;
    }
}

const navItems = [
    { href: "/portal/agents",     label: "Agents",       icon: Bot },
    { href: "/portal/connectors", label: "Integrations", icon: Plug },
    { href: "/portal/usage",      label: "Usage",        icon: BarChart3 },
    { href: "/portal/billing",    label: "Billing",      icon: CreditCard },
    { href: "/portal/support",    label: "Support",      icon: LifeBuoy },
    { href: "/portal/profile",    label: "Profile",      icon: User },
    { href: "/portal/account",    label: "Account",      icon: Settings },
];

export default async function PortalAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) redirect("/portal/login");

    const session = await getSession(token);
    if (!session) redirect("/portal/login");

    const branding = await getBranding(session.tenantId);

    const primaryColor = branding?.primary_color ?? "#2563eb"; // brand blue (op-indigo) default
    const companyName = branding?.company_name ?? "AgentFarms Portal";
    const portalTitle = branding?.portal_title ?? companyName;
    const logoUrl = branding?.logo_url;

    const displayName = session.displayName ?? session.email;

    // Build CSS variables for brand color shades
    const brandCss = `
        :root {
            --portal-primary: ${primaryColor};
            --portal-primary-light: ${primaryColor}1a;
            --portal-primary-ring: ${primaryColor}4d;
        }
        .portal-brand-bg  { background-color: var(--portal-primary) !important; }
        .portal-brand-text { color: var(--portal-primary) !important; }
        .portal-brand-border { border-color: var(--portal-primary) !important; }
    `;

    return (
        <div className="editorial-app min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col">
            {/* Inject brand CSS */}
            <style dangerouslySetInnerHTML={{ __html: brandCss }} />

            {/* Top nav */}
            <header className="sticky top-0 z-30 h-14 bg-[var(--card)] dark:bg-[var(--card)]/90 backdrop-blur-md border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center px-4 sm:px-6 gap-4">
                <Link
                    href="/portal/agents"
                    className="flex items-center gap-2 font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)] hover:opacity-80 transition-opacity"
                >
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt={companyName} style={{ height: 28, objectFit: "contain" }} />
                    ) : (
                        <LayoutDashboard className="h-4 w-4" style={{ color: primaryColor }} />
                    )}
                    <span className="text-sm">{portalTitle}</span>
                </Link>

                <div className="flex-1" />

                <span className="hidden sm:block text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                    {session.tenantId}
                </span>

                <span className="text-sm font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hidden sm:block">
                    {displayName}
                </span>

                <form action="/api/portal/auth/logout" method="POST">
                    <button
                        type="submit"
                        className="flex items-center gap-1.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--danger)] dark:hover:text-[color:var(--danger)] transition-colors px-2 py-1 rounded-[2px] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign out</span>
                    </button>
                </form>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <nav className="hidden md:flex flex-col w-56 shrink-0 bg-[var(--card)] dark:bg-[var(--card)] border-r border-[color:var(--line)] dark:border-[color:var(--line)] pt-4 pb-8 px-3 gap-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-3 px-3 py-2 rounded-[3px] text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] hover:text-[color:var(--ink)] dark:hover:text-[color:var(--ink)] transition-colors"
                        >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* Mobile bottom nav */}
                <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--card)] dark:bg-[var(--card)] border-t border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-around px-2 py-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex flex-col items-center gap-0.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--accent)] dark:hover:text-[color:var(--accent)] transition-colors px-3 py-1"
                        >
                            <item.icon className="h-5 w-5" />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                {/* Main content */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
