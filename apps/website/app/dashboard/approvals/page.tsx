import type { Metadata } from "next";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth-store";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";

export const metadata: Metadata = {
    title: "Approvals - AgentFarms Dashboard",
    description: "Org-wide approval inbox for all pending high-risk actions.",
};

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function DashboardApprovalsPage() {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    const user = token ? await getSessionUser(token) : null;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                Approvals
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Pending Actions</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Approval Inbox</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">All pending approval requests across your organisation.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <ApprovalsQueue
                    scope="org"
                    headerTitle="Approval Inbox"
                    headerSubtitle="All pending approval requests across your org"
                    userRole={user?.role}
                />

            </div>
        </div>
    );
}
