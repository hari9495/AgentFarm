export const runtime = 'edge'

import AppSidebar from "@/components/layout/AppSidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, isCompanyOperatorEmail } from "@/lib/auth-store";

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    if (!token) {
        redirect("/login");
    }

    const user = await getSessionUser(token);
    if (!user) {
        redirect("/login");
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
        redirect("/dashboard");
    }

    const showCompanyPortal = isCompanyOperatorEmail(user.email);

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            <AppSidebar section="admin" userName={user.name} userRole={user.role} showCompanyPortal={showCompanyPortal} />
            <div className="flex-1 min-w-0 overflow-auto">
                {children}
            </div>
        </div>
    );
}
