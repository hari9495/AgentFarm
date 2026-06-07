import AppSidebar from "@/components/layout/AppSidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, isCompanyOperatorEmail, listApprovals, countUnreadNotifications } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    if (!token) {
        redirect("/login");
    }

    const user = await getSessionUser(token!);
    if (!user) {
        redirect("/login");
    }

    const showCompanyPortal = isCompanyOperatorEmail(user.email);

    // Live badge counts — fetched server-side so they're accurate on every navigation
    const [pendingApprovals, unreadNotifications] = await Promise.all([
        listApprovals({
            status: "pending",
            tenantId: user.tenantId ?? undefined,
            limit: 100,
        }),
        countUnreadNotifications({ userId: user.id, tenantId: user.tenantId }),
    ]);
    const badges = {
        approvals: pendingApprovals.length,
        notifications: unreadNotifications,
    };

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            <AppSidebar userName={user.name} userRole={user.role} showCompanyPortal={showCompanyPortal} badges={badges} />
            <div className="flex-1 min-w-0 overflow-auto">
                {children}
            </div>
        </div>
    );
}
