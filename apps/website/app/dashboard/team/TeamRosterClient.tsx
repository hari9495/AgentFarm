"use client";

import { useState } from "react";
import { Mail, Plus, Shield, ShieldCheck, UserCheck, UserMinus, Users, X } from "lucide-react";
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
    superadmin: { label: "Super Admin", className: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]", icon: ShieldCheck },
    admin: { label: "Org Admin", className: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]", icon: Shield },
    member: { label: "Member", className: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]", icon: Users },
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

    // Add member form
    const [showAddForm, setShowAddForm] = useState(false);
    const [addName, setAddName] = useState("");
    const [addEmail, setAddEmail] = useState("");
    const [addPassword, setAddPassword] = useState("");
    const [addRole, setAddRole] = useState<"admin" | "member">("member");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const showToast = (message: string, ok: boolean) => {
        setToast({ message, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const changeRole = async (userId: string, newRole: "admin" | "member") => {
        setUpdating(userId);
        try {
            const res = await fetch(`/api/team/members/${userId}`, {
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

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setAddError(null);
        try {
            const res = await fetch("/api/team/members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: addName.trim(), email: addEmail.trim(), password: addPassword, role: addRole }),
            });
            const data = (await res.json()) as { ok?: boolean; member?: UserPublic; error?: string };
            if (!res.ok) {
                setAddError(data.error ?? `Error ${res.status}`);
                return;
            }
            if (data.member) {
                setMembers((prev) => [...prev, data.member!]);
            }
            setShowAddForm(false);
            setAddName(""); setAddEmail(""); setAddPassword(""); setAddRole("member");
            showToast(`${addName} added to your team.`, true);
        } catch {
            setAddError("Network error. Please try again.");
        } finally {
            setAdding(false);
        }
    };

    const adminCount = members.filter((m) => m.role === "admin" || m.role === "superadmin").length;
    const memberCount = members.length - adminCount;

    return (
        <>
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-[3px] px-4 py-3 text-sm font-semibold shadow-lg transition-all ${toast.ok ? "bg-[var(--ok)] text-white" : "bg-[var(--danger)] text-white"}`}>
                    {toast.ok
                        ? <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3.5 h-3.5" />
                        : <PremiumIcon icon={ShieldCheck} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3.5 h-3.5" />}
                    {toast.message}
                </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--line)] pt-4">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                        <span className="text-[color:var(--ink)] font-bold">{members.length}</span>
                        {members.length === 1 ? "teammate" : "teammates"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                        <span className="text-[color:var(--ink)] font-bold">{adminCount}</span>
                        {adminCount === 1 ? "admin" : "admins"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                        <span className="text-[color:var(--ink)] font-bold">{memberCount}</span>
                        {memberCount === 1 ? "member" : "members"}
                    </div>
                </div>
                {canManage && (
                    <button
                        onClick={() => { setShowAddForm((v) => !v); setAddError(null); }}
                        className="inline-flex items-center gap-2 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] active:bg-[var(--accent)] text-white text-xs font-bold px-3.5 py-2 transition-colors"
                    >
                        {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        {showAddForm ? "Cancel" : "Add Member"}
                    </button>
                )}
            </div>

            {showAddForm && canManage && (
                <form
                    onSubmit={(e) => void handleAddMember(e)}
                    className="mt-6 rounded-[4px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/60 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 p-5 space-y-4"
                >
                    <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                        <PremiumIcon icon={Users} tone="violet" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        Add a new team member
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Full name <span className="text-[color:var(--danger)]">*</span></label>
                            <input
                                type="text"
                                placeholder="Jane Smith"
                                value={addName}
                                onChange={(e) => setAddName(e.target.value)}
                                required
                                className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Email <span className="text-[color:var(--danger)]">*</span></label>
                            <input
                                type="email"
                                placeholder="jane@company.com"
                                value={addEmail}
                                onChange={(e) => setAddEmail(e.target.value)}
                                required
                                className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Temporary password <span className="text-[color:var(--danger)]">*</span></label>
                            <input
                                type="password"
                                placeholder="Min. 8 characters"
                                value={addPassword}
                                onChange={(e) => setAddPassword(e.target.value)}
                                required
                                minLength={8}
                                className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Role</label>
                            <select
                                value={addRole}
                                onChange={(e) => setAddRole(e.target.value as "admin" | "member")}
                                className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                            >
                                <option value="member">Member — read-only access</option>
                                <option value="admin">Admin — full management access</option>
                            </select>
                        </div>
                    </div>
                    {addError && (
                        <p className="text-xs font-medium text-[color:var(--danger)] dark:text-[color:var(--danger)]">{addError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { setShowAddForm(false); setAddError(null); }}
                            className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-4 py-2 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={adding}
                            className="inline-flex items-center gap-2 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-60 text-white text-xs font-bold px-4 py-2 transition-colors"
                        >
                            {adding ? "Adding…" : "Add to team"}
                        </button>
                    </div>
                </form>
            )}

            <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                    <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Roster</h2>
                    <span className="inline-flex items-center justify-center text-xs font-bold bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded-full px-2.5 py-1">
                        {members.length} {members.length === 1 ? "member" : "members"}
                    </span>
                </div>

                {members.length === 0 ? (
                    <div className="px-5 py-12 text-center text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] text-sm">
                        No teammates found yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead>
                                <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                    <th className="text-left px-5 py-3">Name</th>
                                    <th className="text-left px-4 py-3">Email</th>
                                    <th className="text-left px-4 py-3">Role</th>
                                    <th className="text-left px-4 py-3">Joined</th>
                                    {canManage && <th className="text-left px-4 py-3">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                                {members.map((m) => {
                                    const badge = roleBadge[m.role];
                                    const BadgeIcon = badge.icon;
                                    const joined = new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                    const isSuperAdmin = m.role === "superadmin";
                                    const isAdmin = m.role === "admin";
                                    const isSelf = m.id === currentUserId;
                                    const busy = updating === m.id;
                                    return (
                                        <tr key={m.id} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] text-xs font-bold shrink-0">
                                                        {initials(m.name)}
                                                    </span>
                                                    <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">
                                                        {m.name}
                                                        {isSelf && <span className="ml-2 text-xs font-normal text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">(you)</span>}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] text-xs">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]" />
                                                    {m.email}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${badge.className}`}>
                                                    <BadgeIcon className="w-3 h-3" />
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] text-xs">{joined}</td>
                                            {canManage && (
                                                <td className="px-4 py-3.5">
                                                    {isSuperAdmin ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/50 px-2.5 py-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)]">
                                                            <ShieldCheck className="w-3.5 h-3.5" />
                                                            Protected role
                                                        </span>
                                                    ) : isSelf ? (
                                                        <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                            Cannot change your own role
                                                        </span>
                                                    ) : isAdmin ? (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(m.id, "member")}
                                                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                            {busy ? "Saving…" : "Demote to Member"}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => changeRole(m.id, "admin")}
                                                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
