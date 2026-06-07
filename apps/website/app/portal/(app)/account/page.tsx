"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, LogOut, User, Lock, Settings } from "lucide-react";

type Me = { accountId: string; tenantId: string; email: string; displayName: string | null; role: string };

function StatusMsg({ text, ok }: { text: string; ok: boolean }) {
    return (
        <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                ok
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
            }`}
        >
            {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {text}
        </div>
    );
}

const inputClass =
    "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition";
const labelClass = "block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5";
const cardClass = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4";

export default function AccountSettingsPage() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    const [displayName, setDisplayName] = useState("");
    const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [profileSaving, setProfileSaving] = useState(false);

    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        fetch("/api/portal/auth/me", { credentials: "same-origin" })
            .then(async (r) => {
                if (!r.ok) { router.replace("/portal/login"); return; }
                const data = (await r.json()) as Me;
                setMe(data);
                setDisplayName(data.displayName ?? "");
            })
            .catch(() => router.replace("/portal/login"))
            .finally(() => setLoading(false));
    }, [router]);

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileMsg(null);
        setProfileSaving(true);
        try {
            const res = await fetch("/api/portal/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ displayName: displayName.trim() || null }),
            });
            if (res.ok) {
                const data = (await res.json()) as { displayName: string | null };
                setMe((m) => (m ? { ...m, displayName: data.displayName } : m));
                setProfileMsg({ text: "Display name updated.", ok: true });
            } else {
                const b = (await res.json().catch(() => ({}))) as { message?: string };
                setProfileMsg({ text: b.message ?? "Update failed.", ok: false });
            }
        } catch {
            setProfileMsg({ text: "Unable to connect.", ok: false });
        } finally {
            setProfileSaving(false);
        }
    };

    const changePassword = async (e: FormEvent) => {
        e.preventDefault();
        setPwMsg(null);
        if (newPw !== confirmPw) { setPwMsg({ text: "Passwords do not match.", ok: false }); return; }
        if (newPw.length < 8) { setPwMsg({ text: "New password must be at least 8 characters.", ok: false }); return; }
        setPwSaving(true);
        try {
            const res = await fetch("/api/portal/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            if (res.ok) {
                setPwMsg({ text: "Password changed successfully.", ok: true });
                setCurrentPw(""); setNewPw(""); setConfirmPw("");
            } else {
                const b = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
                setPwMsg({ text: b.message ?? (b.error === "invalid_credentials" ? "Current password is incorrect." : "Password change failed."), ok: false });
            }
        } catch {
            setPwMsg({ text: "Unable to connect.", ok: false });
        } finally {
            setPwSaving(false);
        }
    };

    const signOut = async () => {
        await fetch("/api/portal/auth/logout", { method: "POST", credentials: "same-origin" });
        router.push("/portal/login");
    };

    if (loading) {
        return <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>;
    }

    return (
        <div className="max-w-xl space-y-5">
            <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Account settings</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your profile and security</p>
            </div>

            {/* Account info (read-only) */}
            <div className={cardClass}>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Account info</p>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        { label: "Email", value: me?.email ?? "" },
                        { label: "Tenant ID", value: me?.tenantId ?? "", mono: true },
                        { label: "Role", value: me?.role ?? "" },
                        { label: "Account ID", value: `${(me?.accountId ?? "").slice(0, 16)}…`, mono: true },
                    ].map(({ label, value, mono }) => (
                        <div key={label}>
                            <p className="text-[0.65rem] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                            <p className={`text-sm text-slate-700 dark:text-slate-300 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Profile */}
            <form onSubmit={(e) => void saveProfile(e)} className={cardClass}>
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <User className="h-3.5 w-3.5" /> Profile
                </p>
                {profileMsg && <StatusMsg {...profileMsg} />}
                <div>
                    <label htmlFor="acct-display-name" className={labelClass}>Display name</label>
                    <input
                        id="acct-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name (shown in the portal)"
                        className={inputClass}
                    />
                </div>
                <button
                    type="submit"
                    disabled={profileSaving}
                    className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-semibold shadow-sm transition-colors"
                >
                    {profileSaving ? "Saving…" : "Save changes"}
                </button>
            </form>

            {/* Change password */}
            <form onSubmit={(e) => void changePassword(e)} className={cardClass}>
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <Lock className="h-3.5 w-3.5" /> Change password
                </p>
                {pwMsg && <StatusMsg {...pwMsg} />}
                <div>
                    <label htmlFor="acct-current-pw" className={labelClass}>Current password</label>
                    <input id="acct-current-pw" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" className={inputClass} />
                </div>
                <div>
                    <label htmlFor="acct-new-pw" className={labelClass}>New password</label>
                    <input id="acct-new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoComplete="new-password" minLength={8} placeholder="Min. 8 characters" className={inputClass} />
                </div>
                <div>
                    <label htmlFor="acct-confirm-pw" className={labelClass}>Confirm new password</label>
                    <input id="acct-confirm-pw" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" className={inputClass} />
                </div>
                <button
                    type="submit"
                    disabled={pwSaving || !currentPw || newPw.length < 8 || newPw !== confirmPw}
                    className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60"
                >
                    {pwSaving ? "Updating…" : "Update password"}
                </button>
            </form>

            {/* Session */}
            <div className={cardClass}>
                <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <Settings className="h-3.5 w-3.5" /> Session
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Sign out from your portal session on this device.</p>
                <button
                    type="button"
                    onClick={() => void signOut()}
                    className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-sm font-semibold hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                </button>
            </div>
        </div>
    );
}
