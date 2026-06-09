import AppSidebar from "@/components/layout/AppSidebar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isCompanyOperatorEmail } from "@/lib/auth-store";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface PortalMe {
    accountId?: string;
    tenantId?: string;
    email?: string;
    displayName?: string;
    role?: string;
}

async function getPortalSession(token: string): Promise<PortalMe | null> {
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as PortalMe;
    } catch {
        return null;
    }
}

async function getPendingApprovals(token: string): Promise<number> {
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/approvals?status=pending&limit=100`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return 0;
        const data = (await res.json()) as { approvals?: unknown[] };
        return data.approvals?.length ?? 0;
    } catch {
        return 0;
    }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;
    if (!token) {
        redirect("/login");
    }

    const me = await getPortalSession(token!);
    if (!me) {
        redirect("/login");
    }

    if (me.role !== "admin" && me.role !== "superadmin") {
        redirect("/dashboard");
    }

    const showCompanyPortal = me.email ? isCompanyOperatorEmail(me.email) : false;

    const pendingApprovals = await getPendingApprovals(token!);
    const badges = {
        approvals: pendingApprovals,
        notifications: 0,
    };

    const sidebarRole: "superadmin" | "admin" | "member" | "owner" =
        me.role === "superadmin" ? "superadmin"
        : me.role === "owner"    ? "owner"
        : me.role === "admin"    ? "admin"
        : "member";

    const displayName =
        me.displayName?.trim() ||
        me.email?.split("@")[0] ||
        "Account";

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            <AppSidebar
                userName={displayName}
                userRole={sidebarRole}
                tenantId={me.tenantId}
                showCompanyPortal={showCompanyPortal}
                badges={badges}
            />
            <div className="flex-1 min-w-0 overflow-auto">
                {children}
            </div>
        </div>
    );
}
