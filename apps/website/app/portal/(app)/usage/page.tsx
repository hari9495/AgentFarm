import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BarChart3, AlertCircle, TrendingUp, DollarSign, Zap } from "lucide-react";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface DayBucket {
    date: string;
    count: number;
}

interface UsageResponse {
    totalTasks: number;
    successRate: number;
    totalCostUsd: number;
    tasksByDay: DayBucket[];
}

function StatCard({
    label,
    value,
    icon: Icon,
    sub,
}: {
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    sub?: string;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {label}
                </span>
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            {sub && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>
            )}
        </div>
    );
}

export default async function PortalUsagePage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) {
        redirect("/portal/login");
    }

    let usage: UsageResponse | null = null;
    let fetchError = false;

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/usage`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });

        if (res.status === 401) {
            redirect("/portal/login");
        }

        if (res.ok) {
            usage = (await res.json()) as UsageResponse;
        } else {
            fetchError = true;
        }
    } catch {
        fetchError = true;
    }

    const fmt = new Intl.NumberFormat("en-US");
    const fmtCost = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    });

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Usage</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Task execution and cost summary for your tenant
                </p>
            </div>

            {fetchError && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 mb-6">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load usage data. Please refresh the page.
                </div>
            )}

            {!fetchError && usage && (
                <>
                    {/* Stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <StatCard
                            label="Total Tasks Run"
                            value={fmt.format(usage.totalTasks)}
                            icon={Zap}
                        />
                        <StatCard
                            label="Total Cost"
                            value={fmtCost.format(usage.totalCostUsd)}
                            icon={DollarSign}
                            sub="Estimated spend across all agents"
                        />
                        <StatCard
                            label="Success Rate"
                            value={`${(usage.successRate * 100).toFixed(1)}%`}
                            icon={TrendingUp}
                            sub="Last 30 days"
                        />
                    </div>

                    {/* Daily breakdown table */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Daily Task Breakdown
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                Tasks executed per day over the last 30 days
                            </p>
                        </div>

                        {usage.tasksByDay.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    No usage data yet
                                </p>
                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                    Usage will appear here once your agents start running tasks.
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            Date
                                        </th>
                                        <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            Tasks
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {usage.tasksByDay.map((row) => (
                                        <tr
                                            key={row.date}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                        >
                                            <td className="px-5 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                                                {new Date(row.date).toLocaleDateString(undefined, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </td>
                                            <td className="px-5 py-3 text-right text-slate-900 dark:text-slate-100 font-medium tabular-nums">
                                                {fmt.format(row.count)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {!fetchError && !usage && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 px-4 text-center">
                    <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No usage data yet</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Usage will appear here once your agents start running tasks.
                    </p>
                </div>
            )}
        </div>
    );
}
