"use client";

import { CheckSquare, RefreshCw, Shield, Users } from "lucide-react";
import { useState, useEffect } from "react";
import PremiumIcon from "@/components/shared/PremiumIcon";

const modules = ["Workspace", "Agents", "Approvals", "Audit Log", "Billing", "Integrations"];
const roles = [
    { name: "Org Admin", values: ["Full", "Full", "Full", "Full", "Full", "Full"] },
    { name: "Engineering Lead", values: ["Edit", "Full", "Approve", "View", "View", "Edit"] },
    { name: "Security Reviewer", values: ["View", "View", "Approve", "Full", "None", "View"] },
    { name: "Finance Admin", values: ["View", "None", "View", "View", "Full", "None"] },
    { name: "Developer", values: ["View", "Run", "Request", "View", "None", "View"] },
];

const classFor = (value: string) => {
    if (value === "Full") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    if (value === "Approve") return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
    if (value === "Edit") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    if (value === "Run") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    if (value === "Request") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (value === "View") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
};

export default function AdminRolesPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Simulate data loading - replace with actual API call when backend is ready
        setLoading(false);
        setError(null);
    }, []);

    // Data is currently hardcoded; will be replaced with API call
    const hasData = !loading && !error && roles.length > 0;
    return (
        <div className="site-shell min-h-screen">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                    <PremiumIcon icon={Shield} tone="violet" containerClassName="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-5 h-5" />
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Roles & Permissions</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">RBAC matrix for custom team roles</p>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load roles</p>
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                        >
                            <PremiumIcon icon={RefreshCw} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="space-y-6">
                        <div className="grid md:grid-cols-3 gap-4 animate-pulse">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                    <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                                    <div className="h-8 w-12 rounded bg-slate-200 dark:bg-slate-700" />
                                </div>
                            ))}
                        </div>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse">
                            <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-700 mb-4" />
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
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
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No roles configured</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No role data available right now.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Defined roles</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{roles.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Permission modules</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{modules.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Users assigned</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">28</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5"><PremiumIcon icon={Users} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" /> Permission Matrix</h2>
                                <button className="rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1.5 text-xs font-semibold">Create custom role</button>
                            </div>
                            {/* Legend */}
                            <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                                {[
                                    { label: "Full", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                                    { label: "Approve", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
                                    { label: "Edit", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
                                    { label: "Run", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
                                    { label: "View", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
                                    { label: "None", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
                                ].map((item) => (
                                    <span key={item.label} className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.cls}`}>{item.label}</span>
                                ))}
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">— hover a row to highlight</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[840px] text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                                            <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">Role</th>
                                            {modules.map((m) => (
                                                <th key={m} className="text-left px-3 py-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{m}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                        {roles.map((role) => (
                                            <tr key={role.name} className="hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-colors group">
                                                <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-sky-50 dark:group-hover:bg-sky-900/10 z-10 transition-colors">{role.name}</td>
                                                {role.values.map((value, idx) => (
                                                    <td key={`${role.name}-${idx}`} className="px-3 py-3">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${classFor(value)}`}>{value}</span>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300 inline-flex items-start gap-2">
                            <PremiumIcon icon={CheckSquare} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mt-0.5" iconClassName="w-3.5 h-3.5" />
                            New roles are enforced immediately and logged in audit history.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
