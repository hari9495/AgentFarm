"use client";

import { useState } from "react";
import { Mail, Shield, ShieldCheck, UserCheck, UserMinus, Users } from "lucide-react";
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
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("") || "U";

const roleBadge: Record<"superadmin" | "admin" | "member", { label: string; className: string; icon: typeof Shield }> = {
    superadmin: { label: "Super Admin", className: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", icon: ShieldCheck },
    admin: { label: "Org Admin", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", icon: Shield },
    member: { label: "Member", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", icon: Users },
};

export default function TeamRosterClient({
    initialMembers,
    currentUserId,
    canManage,
}: {
    initialMembers: UserPublic[];
    currentUserId: string;
    canManage: boolean;
}) {
    const [members, setMembers] = useState<UserPublic[]>(initialMembers);
    const [updating, setUpdating] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

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
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (res.ok) {
                setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role: newRole } : m)));
                showToast(newRole === "admin" ? "Teammate promoted to Org Admin." : "Teammate demoted to Member.", true);
            } else {
                showToast(data.error ?? "Failed to update role.", false);
            }
        } catch {
            showToast("Network error.", false);
        } finally {
            setUpdating(null);
        }
    };

    const adminCount = members.filter((m) => m.role === "admin" || m.role === "superadmin").length;
    const memberCount = members.length - adminCount;

    return (
        <>
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.ok
                        ? <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />
                        : <PremiumIcon icon={ShieldCheck} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />}
                    {toast.message}
                </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <span className="text-white font-bold">{members.length}</span>
                    {members.length === 1 ? "teammate" : "teammates"}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <span className="text-white font-bold">{adminCount}</span>
                    {adminCount === 1 ? "admin" : "admins"}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <span className="text-white font-bold">{memberCount}</span>
                    {memberCount === 1 ? "member" : "members"}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Roster</h2>
                    <span className="inline-flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2.5 py-1">
                        {members.length} {members.length === 1 ? "member" : "members"}
                    </span>
                </div>

                {members.length === 0 ? (
                    <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                        No teammates found yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <th className="text-left px-5 py-3">Name</th>
                                    <th className="text-left px-4 py-3">Email</th>
                                    <th className="text-left px-4 py-3">Role</th>
                                    <th className="text-left px-4 py-3">Joined</th>
                                    {canManage && <th className="text-left px-4 py-3">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                {members.map((m) => {
                                    const badge = roleBadge[m.role];
                                    const BadgeIcon = badge.icon;
                                    const joined = new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                    const isSuperAdmin = m.role === "superadmin";
                                    const isAdmin = m.role === "admin";
                                    const isSelf = m.id === currentUserId;
                                    const busy = updating === m.id;
                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-bold shrink-0">
                                                        {initials(m.name)}
                                                    </span>
                                                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                                                        {m.name}
                                                        {isSelf && <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">(you)</span>}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                                                    {m.email}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${badge.className}`}>
                                                    <BadgeIcon className="w-3 h-3" />
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-400 dark:text-slate-500 text-xs">{joined}</td>
                                            {canManage && (
                                                <td className="px-4 py-3.5">
                                                    {isSuperAdmin ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 dark:border-fuchsia-900/50 px-2.5 py-1.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
                                                            <ShieldCheck className="w-3.5 h-3.5" />
                                                            Protected role
                                                        </span>
                                                    ) : isSelf ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                                            Cannot change your own role
                                                        </span>
                                                    ) : isAdmin ? (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(m.id, "member")}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                            {busy ? "Saving…" : "Demote to Member"}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(m.id, "admin")}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-700 px-2.5 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <UserCheck className="w-3.5 h-3.5" />
                                                            {busy ? "Saving…" : "Promote to Admin"}
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
