"use client";

import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Globe,
    KeyRound,
    Lock,
    Monitor,
    Plus,
    RefreshCw,
    Shield,
    ShieldAlert,
    Smartphone,
    Trash2,
    X,
} from "lucide-react";
import { useState, useEffect } from "react";
import PremiumIcon from "@/components/shared/PremiumIcon";

const activeSessions = [
    { user: "Jane Doe", initials: "JD", role: "Admin", device: "Chrome · macOS", location: "New York, US", ip: "203.0.113.42", started: "Today 08:12", current: true },
    { user: "Alex Rivera", initials: "AR", role: "Admin", device: "Firefox · Windows 11", location: "Austin, TX", ip: "198.51.100.7", started: "Today 09:05", current: false },
    { user: "Priya Nair", initials: "PN", role: "Developer", device: "Safari · macOS", location: "Seattle, WA", ip: "192.0.2.18", started: "Today 07:30", current: false },
    { user: "Jordan Kim", initials: "JK", role: "Security Reviewer", device: "Chrome · Linux", location: "San Francisco, CA", ip: "10.0.1.5", started: "Yesterday 22:47", current: false },
];

const ipAllowlist = [
    { cidr: "203.0.113.0/24", label: "HQ Office", added: "Jan 15, 2026" },
    { cidr: "198.51.100.0/28", label: "Austin Dev Office", added: "Feb 1, 2026" },
    { cidr: "10.0.0.0/8", label: "VPN Range", added: "Mar 10, 2026" },
];

const securityEvents = [
    { ts: "Today 09:12", type: "warning", message: "Failed login attempt for jane@acme.io (3 attempts)", icon: AlertTriangle, color: "text-amber-500" },
    { ts: "Today 08:30", type: "info", message: "MFA successfully enrolled by Jordan Kim", icon: CheckCircle2, color: "text-emerald-500" },
    { ts: "Yesterday 22:47", type: "info", message: "New session started from 10.0.1.5 (Jordan Kim)", icon: Monitor, color: "text-sky-500" },
    { ts: "Yesterday 14:00", type: "info", message: "IP allowlist updated — added 10.0.0.0/8", icon: Globe, color: "text-slate-500" },
    { ts: "2 days ago", type: "warning", message: "Session expired without logout for sam@acme.io", icon: AlertTriangle, color: "text-amber-500" },
];

export default function SecurityPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Simulate data loading - replace with actual API call when backend is ready
        setLoading(false);
        setError(null);
    }, []);

    const hasData = !loading && !error && activeSessions.length > 0;
    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                    <PremiumIcon icon={Shield} tone="rose" containerClassName="h-9 w-9 rounded-xl bg-rose-100 dark:bg-rose-900/40 shrink-0 text-rose-600 dark:text-rose-400" iconClassName="w-5 h-5" />
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Security</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">MFA, sessions, IP allowlist, and security events</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load security data</p>
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                        >
                            <PremiumIcon icon={RefreshCw} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="space-y-8 animate-pulse">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[1, 2].map((i) => (
                                <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mb-4" />
                                    <div className="space-y-3">
                                        {[1, 2, 3].map((j) => (
                                            <div key={j} className="h-3 rounded bg-slate-200 dark:bg-slate-700" />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 mb-4" />
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : !hasData ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
                        <div className="mb-3 flex justify-center">
                            <PremiumIcon icon={Shield} tone="slate" containerClassName="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" iconClassName="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No security data available</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Security configuration will appear here.</p>
                    </div>
                ) : (
                    <>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <PremiumIcon icon={Smartphone} tone="emerald" containerClassName="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 shrink-0 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">MFA Enforcement</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Require MFA for all users</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { label: "Admins", enabled: true },
                                        { label: "Developers", enabled: true },
                                        { label: "Viewers", enabled: false },
                                    ].map(({ label, enabled }) => (
                                        <div key={label} className="flex items-center justify-between">
                                            <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${enabled ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                                                {enabled ? "Required" : "Optional"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <button className="mt-4 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    Edit MFA policy
                                </button>
                            </div>

                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <PremiumIcon icon={Clock3} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 shrink-0 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Session Policy</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Idle timeout and max age</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { label: "Idle timeout", value: "30 minutes" },
                                        { label: "Max session age", value: "8 hours" },
                                        { label: "Remember device", value: "Disabled" },
                                        { label: "Concurrent sessions", value: "3 max" },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="flex items-center justify-between">
                                            <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
                                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</span>
                                        </div>
                                    ))}
                                </div>
                                <button className="mt-4 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    Edit session policy
                                </button>
                            </div>
                        </div>

                        {/* Active sessions */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <PremiumIcon icon={Monitor} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Active Sessions</h2>
                                    <span className="text-xs text-slate-400">({activeSessions.length})</span>
                                </div>
                                <button className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline">Revoke all</button>
                            </div>
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[600px]">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                <th className="text-left px-5 py-3">User</th>
                                                <th className="text-left px-5 py-3">Device</th>
                                                <th className="text-left px-5 py-3">Location / IP</th>
                                                <th className="text-left px-5 py-3">Started</th>
                                                <th className="px-5 py-3" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                            {activeSessions.map((s) => (
                                                <tr key={s.user} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-[10px] font-bold text-sky-700 dark:text-sky-300 shrink-0">
                                                                {s.initials}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                                    {s.user}
                                                                    {s.current && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">You</span>}
                                                                </p>
                                                                <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.role}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">{s.device}</td>
                                                    <td className="px-5 py-3">
                                                        <p className="text-xs text-slate-600 dark:text-slate-400">{s.location}</p>
                                                        <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{s.ip}</p>
                                                    </td>
                                                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{s.started}</td>
                                                    <td className="px-5 py-3">
                                                        {!s.current && (
                                                            <button className="text-xs font-medium text-rose-500 hover:underline flex items-center gap-1">
                                                                <PremiumIcon icon={X} tone="rose" containerClassName="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3 h-3" /> Revoke
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>

                        {/* IP allowlist */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <PremiumIcon icon={Globe} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">IP Allowlist</h2>
                                </div>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors">
                                    <PremiumIcon icon={Plus} tone="sky" containerClassName="w-5 h-5 rounded-md bg-white/15 text-white border-white/30" iconClassName="w-3 h-3" /> Add CIDR
                                </button>
                            </div>
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                                {ipAllowlist.map((entry) => (
                                    <div key={entry.cidr} className="flex items-center justify-between px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <PremiumIcon icon={Lock} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3 h-3" />
                                            <div>
                                                <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">{entry.cidr}</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">{entry.label} · added {entry.added}</p>
                                            </div>
                                        </div>
                                        <button className="text-xs font-medium text-rose-500 hover:underline flex items-center gap-1">
                                            <PremiumIcon icon={Trash2} tone="rose" containerClassName="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3 h-3" /> Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Security events */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <PremiumIcon icon={ShieldAlert} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Recent Security Events</h2>
                            </div>
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                                {securityEvents.map((evt, i) => (
                                    <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                                        <PremiumIcon icon={evt.icon} tone="slate" containerClassName={`w-6 h-6 mt-0.5 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 ${evt.color}`} iconClassName="w-3.5 h-3.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-700 dark:text-slate-300">{evt.message}</p>
                                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{evt.ts}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>                    </>
                )}

            </div>
        </div>
    );
}
