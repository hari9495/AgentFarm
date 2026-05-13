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

const navItems = [
    { href: "/portal/agents", label: "Agents", icon: Bot },
    { href: "/portal/usage", label: "Usage", icon: BarChart3 },
    { href: "/portal/billing", label: "Billing", icon: CreditCard },
    { href: "/portal/profile", label: "Profile", icon: User },
];

export default async function PortalAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) {
        redirect("/portal/login");
    }

    const session = await getSession(token);

    if (!session) {
        redirect("/portal/login");
    }

    const displayName = session.displayName ?? session.email;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Top nav */}
            <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center px-4 sm:px-6 gap-4">
                <Link
                    href="/portal/agents"
                    className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity"
                >
                    <LayoutDashboard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-sm">AgentFarm Portal</span>
                </Link>

                <div className="flex-1" />

                <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                    {session.tenantId}
                </span>

                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                    {displayName}
                </span>

                <form action="/api/portal/auth/logout" method="POST">
                    <button
                        type="submit"
                        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors px-2 py-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign out</span>
                    </button>
                </form>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <nav className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 pt-4 pb-8 px-3 gap-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                        >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                {/* Mobile bottom nav */}
                <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 py-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex flex-col items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors px-3 py-1"
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
