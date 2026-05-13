import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Bot, AlertCircle, Clock, CheckCircle2, XCircle, Pause } from "lucide-react";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface AgentRecord {
    id: string;
    role: string;
    status: string;
    createdAt: string;
    workspace: { name: string } | null;
}

interface AgentsResponse {
    agents: AgentRecord[];
    total?: number;
}

const STATUS_CONFIG: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
    active: {
        label: "Active",
        icon: CheckCircle2,
        className: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    },
    paused: {
        label: "Paused",
        icon: Pause,
        className: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
    },
    error: {
        label: "Error",
        icon: XCircle,
        className: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40",
    },
};

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? {
        label: status,
        icon: Clock,
        className: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800",
    };
    const Icon = cfg.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
        >
            <Icon className="h-3 w-3" />
            {cfg.label}
        </span>
    );
}

export default async function PortalAgentsPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) {
        redirect("/portal/login");
    }

    let agents: AgentRecord[] = [];
    let fetchError = false;

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/agents?limit=50`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });

        if (res.status === 401) {
            redirect("/portal/login");
        }

        if (res.ok) {
            const data = (await res.json()) as AgentsResponse;
            agents = data.agents ?? [];
        } else {
            fetchError = true;
        }
    } catch {
        fetchError = true;
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Agents</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    AI agents running in your workspace
                </p>
            </div>

            {fetchError && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 mb-6">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load agents. Please refresh the page.
                </div>
            )}

            {!fetchError && agents.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 px-4 text-center">
                    <Bot className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No agents yet</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Agents will appear here once provisioned for your tenant.
                    </p>
                </div>
            )}

            {agents.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    Role
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">
                                    Workspace
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    Status
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">
                                    Created
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {agents.map((agent) => (
                                <tr
                                    key={agent.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center shrink-0">
                                                <Bot className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                            </div>
                                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[12rem]">
                                                {agent.role}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                                        {agent.workspace?.name ?? "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={agent.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">
                                        {new Date(agent.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
