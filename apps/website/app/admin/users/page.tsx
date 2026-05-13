"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Shield, ShieldCheck, UserCheck, UserMinus, Users } from "lucide-react";
import Link from "next/link";
import PremiumIcon from "@/components/shared/PremiumIcon";

type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: "superadmin" | "admin" | "member";
    createdAt: number;
};

const initials = (name: string) =>
    name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserPublic[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            const data = await res.json() as any;
            if (res.ok) setUsers(data.users ?? []);
            else setError(data.error ?? "Failed to load users");
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const showToast = (message: string, ok: boolean) => {
        setToast({ message, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const changeRole = async (userId: string, newRole: "admin" | "member") => {
        setUpdating(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: newRole }),
            });
            const data = await res.json() as any;
            if (res.ok) {
                setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
                showToast(
                    newRole === "admin" ? "User promoted to Admin." : "User demoted to Member.",
                    true,
                );
            } else {
                showToast(data.error ?? "Failed to update role.", false);
            }
        } catch {
            showToast("Network error.", false);
        } finally {
            setUpdating(null);
        }
    };

    const superAdminCount = users.filter((u) => u.role === "superadmin").length;
    const adminCount = users.filter((u) => u.role === "admin").length;
    const memberCount = users.filter((u) => u.role === "member").length;

    return (
        <div className="site-shell min-h-screen">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.ok
                        ? <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />
                        : <PremiumIcon icon={KeyRound} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />}
                    {toast.message}
                </div>
            )}

            {/* Page header */}
            <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-200 mb-4">
                        <PremiumIcon icon={Users} tone="violet" containerClassName="w-5 h-5 rounded-md bg-violet-300/15 text-violet-200 border-violet-200/30" iconClassName="w-3 h-3" />
                        Team &amp; Access
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight max-w-xl">
                        Manage members and roles
                    </h1>
                    <p className="mt-2 text-violet-200 max-w-lg">
                        Promote or demote workspace members. Role changes take effect on next login.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <div className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white">
                            <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-violet-200 border-white/30" iconClassName="w-4 h-4" />
                            {superAdminCount} Super Admin{superAdminCount !== 1 ? "s" : ""}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white">
                            <PremiumIcon icon={Shield} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-violet-200 border-white/30" iconClassName="w-4 h-4" />
                            {adminCount} Admin{adminCount !== 1 ? "s" : ""}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white">
                            <PremiumIcon icon={Users} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-violet-200 border-white/30" iconClassName="w-4 h-4" />
                            {memberCount} Member{memberCount !== 1 ? "s" : ""}
                        </div>
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/30 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                        >
                            Back to Admin
                        </Link>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Info banner */}
                <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3.5 flex items-start gap-3">
                    <PremiumIcon icon={KeyRound} tone="amber" containerClassName="w-6 h-6 mt-0.5 shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                        <strong>Env-var override:</strong> If <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">AGENTFARM_ADMIN_EMAILS</code> or <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">AGENTFARM_ADMIN_DOMAINS</code> are set, role assignments here are overridden on next login.
                    </p>
                </div>

                {/* Members table */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Workspace Members</h2>
                        {!loading && (
                            <span className="inline-flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2.5 py-1">
                                {users.length} member{users.length !== 1 ? "s" : ""}
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                            Loading members…
                        </div>
                    ) : error ? (
                        <div className="px-5 py-12 text-center text-rose-500 text-sm">{error}</div>
                    ) : users.length === 0 ? (
                        <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                            No users found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[640px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Member</th>
                                        <th className="text-left px-4 py-3">Email</th>
                                        <th className="text-left px-4 py-3">Company</th>
                                        <th className="text-left px-4 py-3">Current Role</th>
                                        <th className="text-left px-4 py-3">Joined</th>
                                        <th className="text-left px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {users.map((u) => {
                                        const ini = initials(u.name);
                                        const isSuperAdmin = u.role === "superadmin";
                                        const isAdmin = u.role === "admin";
                                        const busy = updating === u.id;
                                        const joined = new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                        return (
                                            <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-bold shrink-0">
                                                            {ini}
                                                        </span>
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{u.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{u.email}</td>
                                                <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{u.company}</td>
                                                <td className="px-4 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${isSuperAdmin
                                                        ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300"
                                                        : isAdmin
                                                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                                                        {isSuperAdmin ? <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-5 h-5 rounded-md bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300" iconClassName="w-3 h-3" /> : isAdmin ? <PremiumIcon icon={Shield} tone="violet" containerClassName="w-5 h-5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" iconClassName="w-3 h-3" /> : <PremiumIcon icon={Users} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" />}
                                                        {isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Member"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-400 dark:text-slate-500 text-xs">{joined}</td>
                                                <td className="px-4 py-3.5">
                                                    {isSuperAdmin ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 dark:border-fuchsia-900/50 px-2.5 py-1.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                                                            <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-5 h-5 rounded-md bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300" iconClassName="w-3 h-3" />Protected role
                                                        </span>
                                                    ) : isAdmin ? (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(u.id, "member")}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <PremiumIcon icon={UserMinus} tone="rose" containerClassName="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3 h-3" />
                                                            {busy ? "Saving…" : "Demote to Member"}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(u.id, "admin")}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-700 px-2.5 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <PremiumIcon icon={UserCheck} tone="violet" containerClassName="w-5 h-5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3 h-3" />
                                                            {busy ? "Saving…" : "Promote to Admin"}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Security note */}
                <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Security notes</h3>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
                        <li>The last admin cannot be demoted to prevent lock-out.</li>
                        <li>Super admin role is managed only from the Super Admin panel.</li>
                        <li>Admins cannot demote themselves.</li>
                        <li>If env-var admin policies are active, roles re-sync on each login regardless of manual changes here.</li>
                        <li>All role changes are effective on the user's next login session.</li>
                    </ul>
                </div>

            </div>
        </div>
    );
}

