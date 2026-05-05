"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    RefreshCw,
    Shield,
    ShieldCheck,
    Users,
    XCircle,
    type LucideIcon,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type UserRole = "superadmin" | "admin" | "member";
type BotStatus = "active" | "paused" | "error" | "maintenance";

type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    createdAt: number;
};

type BotRecord = {
    slug: string;
    name: string;
    role: string;
    status: BotStatus;
    reliabilityPct: number;
    tasksCompleted: number;
    lastActivityAt: number;
};

const roleStyles: Record<UserRole, string> = {
    superadmin: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
    admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    member: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const botStatusStyles: Record<BotStatus, string> = {
    active: "text-emerald-600",
    paused: "text-amber-500",
    error: "text-rose-600",
    maintenance: "text-slate-500",
};

const ago = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
};

export default function TenantSuperAdminPage() {
    const [authorized, setAuthorized] = useState<boolean | null>(null);
    const [users, setUsers] = useState<UserPublic[]>([]);
    const [bots, setBots] = useState<BotRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

    const showToast = (ok: boolean, message: string) => {
        setToast({ ok, message });
        setTimeout(() => setToast(null), 3200);
    };

    const checkAccess = useCallback(async () => {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok) {
            setAuthorized(false);
            return;
        }
        const data = await res.json();
        setAuthorized(data?.user?.role === "superadmin");
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, botsRes] = await Promise.all([
                fetch("/api/admin/users", { cache: "no-store" }),
                fetch("/api/admin/bots", { cache: "no-store" }),
            ]);

            const usersData = await usersRes.json();
            const botsData = await botsRes.json();

            if (!usersRes.ok) throw new Error(usersData.error ?? "Failed to load users");
            if (!botsRes.ok) throw new Error(botsData.error ?? "Failed to load bots");

            setUsers(usersData.users ?? []);
            setBots(botsData.bots ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load tenant controls");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    useEffect(() => {
        if (authorized) loadData();
    }, [authorized, loadData]);

    const changeRole = async (userId: string, role: UserRole) => {
        setSavingUserId(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(false, data.error ?? "Failed to update role");
                return;
            }
            setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
            showToast(true, "Role updated.");
        } catch {
            showToast(false, "Network error while updating role.");
        } finally {
            setSavingUserId(null);
        }
    };

    const metrics = useMemo(() => {
        return {
            superadmins: users.filter((u) => u.role === "superadmin").length,
            admins: users.filter((u) => u.role === "admin").length,
            members: users.filter((u) => u.role === "member").length,
            activeBots: bots.filter((b) => b.status === "active").length,
            botIssues: bots.filter((b) => b.status === "error" || b.status === "maintenance").length,
        };
    }, [users, bots]);

    if (authorized === false) {
        return (
            <div className="site-shell min-h-screen flex items-center justify-center p-6">
                <div className="max-w-lg rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 p-6 text-center">
                    <div className="mx-auto mb-3 flex justify-center">
                        <PremiumIcon icon={XCircle} tone="rose" containerClassName="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-5 h-5" />
                    </div>
                    <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">Tenant superadmin access required</h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This page is for per-customer tenant controls only.</p>
                    <Link href="/admin" className="mt-4 inline-flex items-center rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900">Return to Admin Console</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="site-shell min-h-screen">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-2 text-sm font-semibold ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.message}
                </div>
            )}

            <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-200 mb-4">
                        <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-5 h-5 rounded-md bg-violet-300/15 text-violet-200 border-violet-200/30" iconClassName="w-3 h-3" />
                        Tenant Superadmin
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Customer tenant governance</h1>
                    <p className="mt-2 text-violet-100 max-w-3xl">Manage users and monitor bots inside this customer tenant. AgentFarm company portal is separated at /company.</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <button onClick={loadData} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60">
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
                        </button>
                        <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20">Back to Admin</Link>
                        <Link href="/company" className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-300/40 px-3.5 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500/30">Company Portal</Link>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <MetricCard label="Super Admins" value={String(metrics.superadmins)} icon={ShieldCheck} tone="fuchsia" />
                    <MetricCard label="Admins" value={String(metrics.admins)} icon={Shield} tone="violet" />
                    <MetricCard label="Members" value={String(metrics.members)} icon={Users} tone="slate" />
                    <MetricCard label="Active Bots" value={String(metrics.activeBots)} icon={CheckCircle2} tone="emerald" />
                    <MetricCard label="Bot Issues" value={String(metrics.botIssues)} icon={AlertTriangle} tone="rose" />
                </div>

                {error && <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Tenant Users</h2>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Role management within customer tenant</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Name</th>
                                        <th className="text-left px-4 py-3">Email</th>
                                        <th className="text-left px-4 py-3">Company</th>
                                        <th className="text-left px-4 py-3">Current Role</th>
                                        <th className="text-left px-4 py-3">Set Role</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{user.name}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{user.email}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{user.company}</td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${roleStyles[user.role]}`}>
                                                    {user.role === "superadmin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Member"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <select value={user.role} onChange={(e) => changeRole(user.id, e.target.value as UserRole)} disabled={savingUserId === user.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 px-2.5 py-1.5 disabled:opacity-60">
                                                    <option value="superadmin">Super Admin</option>
                                                    <option value="admin">Admin</option>
                                                    <option value="member">Member</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Tenant Bot Health</h2>
                        </div>
                        <div className="p-4 space-y-3 max-h-[520px] overflow-auto">
                            {bots.map((bot) => (
                                <div key={bot.slug} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{bot.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{bot.role}</p>
                                        </div>
                                        <div className="inline-flex items-center gap-1 text-xs font-semibold">
                                            <PremiumIcon icon={Activity} tone="slate" containerClassName={`w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 ${botStatusStyles[bot.status]}`} iconClassName="w-3.5 h-3.5" />
                                            <span className="capitalize text-slate-600 dark:text-slate-300">{bot.status}</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="inline-flex items-center gap-1"><PremiumIcon icon={Bot} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />{bot.tasksCompleted} tasks</span>
                                        <span>{bot.reliabilityPct}% reliable</span>
                                        <span>{ago(bot.lastActivityAt)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    icon: Icon,
    tone,
}: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone: "fuchsia" | "violet" | "slate" | "emerald" | "rose";
}) {
    const styleMap: Record<typeof tone, string> = {
        fuchsia: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
        violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
        slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    };

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <PremiumIcon icon={Icon} tone="sky" containerClassName={`w-9 h-9 rounded-xl ${styleMap[tone]}`} iconClassName="w-4 h-4" />
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
        </div>
    );
}
