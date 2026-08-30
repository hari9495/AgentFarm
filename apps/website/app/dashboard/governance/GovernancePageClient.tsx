"use client";

import { useCallback, useEffect, useState } from "react";
import {
    TrendingUp, GitBranch, Puzzle, Plus, RefreshCw,
    CheckCircle2, AlertTriangle, Clock, ChevronRight,
    Trash2, ToggleLeft, ToggleRight, Shield, Zap, Eye, X,
    Database, Calendar, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "kpis" | "workflows" | "plugins" | "retention";

type KpiData = {
    sla_compliance_pct?: number;
    approvals?: { p95_latency_ms?: number; auto_approved_pct?: number; escalation_rate_pct?: number; total_pending?: number; sla_breach_count?: number; total_approved?: number };
    audit?: { completeness_pct?: number; events_last_24h?: number };
    execution?: { success_rate_pct?: number; tasks_completed_today?: number; tasks_failed_today?: number };
    budget?: { tokens_remaining?: number; cost_usd_today?: number; overage_risk?: string };
};

type WorkflowStage = { name: string; role: string; sla_seconds: number; on_miss: "escalate" | "deny" };
type WorkflowTemplate = { id: string; name: string; policy_version?: string; stages?: WorkflowStage[]; created_at?: string };

type Plugin = {
    key: string;
    name: string;
    description: string;
    category: "compliance" | "security" | "audit" | "custom";
    enabled: boolean;
    required?: boolean;
};

// ── Helper ─────────────────────────────────────────────────────────────────────

function n(v: number | undefined | null): number { return v ?? 0; }
function pct(v: number | undefined | null): string { return `${n(v).toFixed(1)}%`; }

function Bar({ value, color }: { value: number; color: string }) {
    return (
        <div className="h-1.5 rounded-full bg-[var(--line)] dark:bg-[var(--card)] overflow-hidden mt-1">
            <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
    );
}

// ── KPI Section ───────────────────────────────────────────────────────────────

function KpiSection({ data, loading }: { data: KpiData | null; loading: boolean }) {
    if (loading) return (
        <div className="space-y-4 pt-2">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}
        </div>
    );

    const sla = n(data?.sla_compliance_pct);
    const slaColor = sla >= 98 ? "text-[color:var(--ok)]" : sla >= 90 ? "text-[color:var(--warn)]" : "text-[color:var(--danger)]";
    const slaBg = sla >= 98 ? "from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--ok)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/20" : sla >= 90 ? "from-[color-mix(in_srgb,var(--warn)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--warn)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/20" : "from-[color-mix(in_srgb,var(--danger)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--danger)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/20";
    const barColor = sla >= 98 ? "bg-[var(--ok)]" : sla >= 90 ? "bg-[var(--warn)]" : "bg-[var(--danger)]";

    return (
        <div className="space-y-5">
            {/* SLA hero */}
            <div className={`rounded-[4px] border bg-gradient-to-br ${slaBg} dark:bg-[var(--card)] p-6`}>
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1">Overall SLA Compliance</p>
                        <p className={`text-5xl font-black tabular-nums tracking-tight ${slaColor}`}>{sla.toFixed(1)}<span className="text-2xl">%</span></p>
                        <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">
                            {sla >= 98 ? "✓ Meeting your governance targets" : sla >= 90 ? "⚠ Approaching SLA threshold" : "✗ Below 90% — review escalation rules"}
                        </p>
                    </div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${sla >= 98 ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]" : sla >= 90 ? "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]"}`}>
                        {sla >= 98 ? "On target" : sla >= 90 ? "Watch" : "Breached"}
                    </div>
                </div>
                <Bar value={sla} color={barColor} />
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    {
                        icon: Clock, label: "P95 Approval Latency", why: "Agent wait time",
                        value: n(data?.approvals?.p95_latency_ms) === 0 ? "—" : `${(n(data?.approvals?.p95_latency_ms) / 1000).toFixed(1)}s`,
                        sub: n(data?.approvals?.p95_latency_ms) < 5000 ? "Within SLA" : "Above target — bottleneck risk",
                        color: "text-[color:var(--accent)]", bg: "from-[color-mix(in_srgb,var(--accent)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--accent)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/20",
                    },
                    {
                        icon: Zap, label: "Auto-approved", why: "Efficiency signal",
                        value: pct(data?.approvals?.auto_approved_pct),
                        sub: n(data?.approvals?.auto_approved_pct) >= 70 ? "Good — humans on high-risk only" : "Low — many manual decisions",
                        color: "text-[color:var(--accent)]", bg: "from-[color-mix(in_srgb,var(--accent)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--accent)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/20",
                    },
                    {
                        icon: TrendingUp, label: "Escalation rate", why: "Operators empowered?",
                        value: pct(data?.approvals?.escalation_rate_pct),
                        sub: n(data?.approvals?.escalation_rate_pct) < 10 ? "Healthy" : "High — review decision authority",
                        color: "text-[color:var(--warn)]", bg: "from-[color-mix(in_srgb,var(--warn)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--warn)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/20",
                    },
                    {
                        icon: CheckCircle2, label: "Audit completeness", why: "Every decision traceable?",
                        value: pct(data?.audit?.completeness_pct),
                        sub: `${n(data?.audit?.events_last_24h).toLocaleString()} events in 24h`,
                        color: "text-[color:var(--ok)]", bg: "from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--ok)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/20",
                    },
                    {
                        icon: CheckCircle2, label: "Task success rate", why: "Approved actions succeeding?",
                        value: pct(data?.execution?.success_rate_pct),
                        sub: `${n(data?.execution?.tasks_completed_today)} tasks today · ${n(data?.execution?.tasks_failed_today)} failed`,
                        color: "text-[color:var(--ok)]", bg: "from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--ok)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/20",
                    },
                    {
                        icon: AlertTriangle, label: "SLA breaches", why: "Overdue decisions",
                        value: String(n(data?.approvals?.sla_breach_count)),
                        sub: n(data?.approvals?.sla_breach_count) === 0 ? "All decisions within SLA" : "Review overdue approvals",
                        color: n(data?.approvals?.sla_breach_count) === 0 ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]",
                        bg: n(data?.approvals?.sla_breach_count) === 0 ? "from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--ok)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/20" : "from-[color-mix(in_srgb,var(--danger)_14%,transparent)]/10 to-[color-mix(in_srgb,var(--danger)_14%,transparent)]/5 border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/20",
                    },
                ].map(({ icon: Icon, label, why, value, sub, color, bg }) => (
                    <div key={label} className={`rounded-[4px] border bg-gradient-to-br ${bg} dark:bg-[var(--card)] p-4`}>
                        <div className="flex items-center gap-2 mb-3">
                            <Icon className={`w-3.5 h-3.5 ${color}`} />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{label}</span>
                        </div>
                        <p className={`text-2xl font-black tabular-nums tracking-tight ${color}`}>{value}</p>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">{sub}</p>
                        <p className="text-[10px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] mt-0.5 italic">{why}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Workflow Template Form ─────────────────────────────────────────────────────

function WorkflowTemplateForm({ onSave, onCancel }: { onSave: (t: Partial<WorkflowTemplate>) => Promise<void>; onCancel: () => void }) {
    const [name, setName] = useState("");
    const [stages, setStages] = useState<WorkflowStage[]>([
        { name: "Initial review", role: "operator", sla_seconds: 900, on_miss: "escalate" },
    ]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addStage = () => setStages(s => [...s, { name: "", role: "manager", sla_seconds: 1800, on_miss: "escalate" }]);
    const removeStage = (i: number) => setStages(s => s.filter((_, idx) => idx !== i));
    const updateStage = (i: number, patch: Partial<WorkflowStage>) =>
        setStages(s => s.map((st, idx) => idx === i ? { ...st, ...patch } : st));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError("Template name is required."); return; }
        if (stages.length === 0) { setError("Add at least one stage."); return; }
        setSaving(true); setError(null);
        try { await onSave({ name: name.trim(), stages }); }
        catch (err) { setError(err instanceof Error ? err.message : "Failed to save."); }
        finally { setSaving(false); }
    };

    const inputCls = "w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]";

    return (
        <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 p-6">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">New Approval Workflow</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Define who approves, in what order, with what SLA</p>
                </div>
                <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-[var(--line)] dark:hover:bg-[var(--card)] text-[color:var(--ink-muted)] transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={submit} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5">Template name</label>
                    <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Production Change Approval" />
                </div>

                {/* Stages */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider">Approval Stages</label>
                        <button type="button" onClick={addStage} className="flex items-center gap-1 text-xs font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Add stage
                        </button>
                    </div>

                    <div className="space-y-3">
                        {stages.map((stage, i) => (
                            <div key={i} className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)]/60 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                                    <span className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Stage {i + 1}</span>
                                    {stages.length > 1 && (
                                        <button type="button" onClick={() => removeStage(i)} className="ml-auto text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] hover:text-[color:var(--danger)] transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-[color:var(--ink-muted)] mb-1">Stage name</label>
                                        <input value={stage.name} onChange={e => updateStage(i, { name: e.target.value })} className={inputCls} placeholder="e.g. Manager review" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-[color:var(--ink-muted)] mb-1">Required role</label>
                                        <select value={stage.role} onChange={e => updateStage(i, { role: e.target.value })} className={inputCls}>
                                            <option value="operator">Operator</option>
                                            <option value="manager">Manager</option>
                                            <option value="admin">Admin</option>
                                            <option value="legal">Legal</option>
                                            <option value="security">Security</option>
                                            <option value="cto">CTO / VP</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-[color:var(--ink-muted)] mb-1">SLA (minutes)</label>
                                        <input
                                            type="number" min={1}
                                            value={Math.round(stage.sla_seconds / 60)}
                                            onChange={e => updateStage(i, { sla_seconds: Number(e.target.value) * 60 })}
                                            className={inputCls}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-[color:var(--ink-muted)] mb-1">If SLA missed</label>
                                        <select value={stage.on_miss} onChange={e => updateStage(i, { on_miss: e.target.value as "escalate" | "deny" })} className={inputCls}>
                                            <option value="escalate">Auto-escalate to next stage</option>
                                            <option value="deny">Auto-deny the action</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Flow preview */}
                {stages.length > 0 && (
                    <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)] mb-2">Flow preview</p>
                        <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs text-[color:var(--ink-muted)] bg-[var(--card)] dark:bg-[var(--card)] rounded-[3px] px-2 py-1 border border-[color:var(--line)] dark:border-[color:var(--line)]">Agent action</span>
                            {stages.map((st, i) => (
                                <>
                                    <ChevronRight key={`arr-${i}`} className="w-3.5 h-3.5 text-[color:var(--ink-muted)] flex-shrink-0" />
                                    <span key={`st-${i}`} className="text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 rounded-[3px] px-2 py-1 border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/50">
                                        {st.name || `Stage ${i + 1}`} ({st.role}, {Math.round(st.sla_seconds / 60)}m SLA)
                                    </span>
                                </>
                            ))}
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-muted)] flex-shrink-0" />
                            <span className="text-xs text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 rounded-[3px] px-2 py-1 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 font-semibold">✓ Approved</span>
                        </div>
                    </div>
                )}

                {error && <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 rounded-[3px] px-4 py-2">{error}</p>}

                <div className="flex gap-3 pt-1">
                    <button type="button" onClick={onCancel} className="flex-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] py-2.5 text-sm font-semibold hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving} className="flex-1 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 text-white py-2.5 text-sm font-bold transition-colors">
                        {saving ? "Saving…" : "Create Workflow"}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ── Workflows Section ─────────────────────────────────────────────────────────

function WorkflowsSection() {
    const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/governance/workflows");
            const body = (await res.json()) as { templates?: { templates?: WorkflowTemplate[] } };
            setTemplates(body.templates?.templates ?? []);
        } catch { /* silent */ } finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const save = async (tpl: Partial<WorkflowTemplate>) => {
        const res = await fetch("/api/governance/workflows", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tpl),
        });
        if (!res.ok) { const b = (await res.json()) as { message?: string }; throw new Error(b.message ?? "Failed to save."); }
        setShowForm(false);
        await load();
    };

    if (loading) return <div className="space-y-3 pt-2">{[1, 2].map(i => <div key={i} className="h-24 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>;

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Approval Workflow Templates</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                        Templates define the multi-step process agents must go through for high-risk actions.
                        Each template specifies who approves at each stage, the SLA, and what happens if a stage is missed.
                    </p>
                </div>
                <button onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] text-white px-4 py-2 text-sm font-bold transition-colors flex-shrink-0">
                    <Plus className="w-4 h-4" /> New workflow
                </button>
            </div>

            {showForm && <WorkflowTemplateForm onSave={save} onCancel={() => setShowForm(false)} />}

            {templates.length === 0 && !showForm ? (
                <div className="rounded-[4px] border-2 border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] p-12 text-center">
                    <div className="w-14 h-14 rounded-[4px] bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
                        <GitBranch className="w-7 h-7 text-[color:var(--accent)]" />
                    </div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">No workflows yet</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] max-w-sm mx-auto mb-5">
                        Without workflows, all approvals are flat single-person decisions.
                        Create a template to enforce multi-stage reviews for high-stakes actions.
                    </p>
                    <button onClick={() => setShowForm(true)} className="rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] text-white px-5 py-2.5 text-sm font-bold transition-colors">
                        Create your first workflow
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {templates.map((t) => (
                        <div key={t.id} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-[3px] bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                                        <GitBranch className="w-5 h-5 text-[color:var(--accent)]" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{t.name}</p>
                                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                                            {t.stages?.length ?? 0} stage{(t.stages?.length ?? 0) !== 1 ? "s" : ""} ·
                                            {t.policy_version ? ` v${t.policy_version}` : " draft"}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 rounded-full px-2.5 py-1">Active</span>
                            </div>

                            {t.stages && t.stages.length > 0 && (
                                <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                                    {t.stages.map((st, i) => (
                                        <>
                                            {i > 0 && <ChevronRight key={`a${i}`} className="w-3.5 h-3.5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] flex-shrink-0" />}
                                            <div key={st.name} className="text-xs rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5">
                                                <span className="font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">{st.name || `Stage ${i + 1}`}</span>
                                                <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] ml-1">· {st.role} · {Math.round(st.sla_seconds / 60)}m SLA</span>
                                            </div>
                                        </>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Plugins Section ───────────────────────────────────────────────────────────

const AVAILABLE_PLUGINS: Plugin[] = [
    { key: "hipaa-checker", name: "HIPAA Compliance Checker", description: "Validates that agent actions comply with HIPAA requirements before approval. Required for healthcare workspaces.", category: "compliance", enabled: false },
    { key: "sox-audit", name: "SOX Audit Trail", description: "Enforces Sarbanes-Oxley-compliant audit logging for all financial actions and approvals.", category: "compliance", enabled: false },
    { key: "gdpr-filter", name: "GDPR Data Filter", description: "Prevents agents from processing EU personal data without appropriate consent checks.", category: "compliance", enabled: false },
    { key: "pii-redactor", name: "PII Redactor", description: "Automatically redacts personally identifiable information from evidence bundles and audit logs.", category: "security", enabled: false },
    { key: "rate-guard", name: "Rate Guard", description: "Blocks agents from exceeding configurable action rates — prevents runaway automation.", category: "security", enabled: false },
    { key: "dual-control", name: "Dual Control", description: "Requires two independent approvers for any action touching production data or infrastructure.", category: "audit", enabled: false },
];

function PluginsSection() {
    const [plugins, setPlugins] = useState<Plugin[]>(AVAILABLE_PLUGINS);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);
    const [result, setResult] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

    useEffect(() => {
        fetch("/api/governance/plugins")
            .then(r => r.json())
            .then((body: unknown) => {
                const b = body as { plugins?: { key: string; enabled: boolean }[] };
                if (b.plugins) {
                    setPlugins(prev => prev.map(p => {
                        const found = b.plugins!.find(r => r.key === p.key);
                        return found ? { ...p, enabled: found.enabled } : p;
                    }));
                }
            })
            .catch(() => { /* use defaults */ })
            .finally(() => setLoading(false));
    }, []);

    const toggle = async (plugin: Plugin) => {
        if (plugin.required) return;
        setToggling(plugin.key);
        setResult(null);
        try {
            const res = await fetch("/api/governance/plugins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plugin_key: plugin.key, enabled: !plugin.enabled }),
            });
            if (res.ok) {
                setPlugins(prev => prev.map(p => p.key === plugin.key ? { ...p, enabled: !p.enabled } : p));
                setResult({ key: plugin.key, ok: true, msg: `${plugin.name} ${!plugin.enabled ? "enabled" : "disabled"} — change logged to audit trail.` });
            } else {
                const b = (await res.json()) as { message?: string };
                setResult({ key: plugin.key, ok: false, msg: b.message ?? "Failed to update plugin." });
            }
        } catch { setResult({ key: plugin.key, ok: false, msg: "Network error." }); }
        finally { setToggling(null); }
    };

    const categoryLabel = (c: Plugin["category"]) =>
        ({ compliance: "Compliance", security: "Security", audit: "Audit", custom: "Custom" }[c]);
    const categoryColor = (c: Plugin["category"]) =>
        ({ compliance: "text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", security: "text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40", audit: "text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", custom: "text-[color:var(--ink-soft)] bg-[var(--bg-deep)] dark:text-[color:var(--ink-muted)] dark:bg-[var(--card)]" }[c]);

    const enabledCount = plugins.filter(p => p.enabled).length;

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Compliance Plugins</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                        Enable the plugins that match your compliance requirements. Every change is logged to the audit trail — who enabled what, and when.
                    </p>
                </div>
                <div className="flex-shrink-0 text-right">
                    <p className="text-2xl font-black text-[color:var(--ink)] dark:text-[color:var(--ink)] tabular-nums">{enabledCount}</p>
                    <p className="text-xs text-[color:var(--ink-muted)]">{enabledCount === 1 ? "plugin" : "plugins"} active</p>
                </div>
            </div>

            {result && (
                <div className={`rounded-[3px] px-4 py-3 text-sm font-medium ${result.ok ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 text-[color:var(--ok)] dark:text-[color:var(--ok)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 text-[color:var(--danger)] dark:text-[color:var(--danger)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40"}`}>
                    {result.ok ? "✓ " : "⚠ "}{result.msg}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>
            ) : (
                <div className="space-y-3">
                    {plugins.map(plugin => (
                        <div key={plugin.key} className={`rounded-[4px] border ${plugin.enabled ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/30 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)]"} p-5 transition-colors`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={`w-9 h-9 rounded-[3px] flex items-center justify-center flex-shrink-0 ${plugin.enabled ? "bg-[var(--accent)]/15" : "bg-[var(--bg-deep)] dark:bg-[var(--card)]"}`}>
                                        {plugin.category === "compliance" ? <Shield className={`w-4.5 h-4.5 ${plugin.enabled ? "text-[color:var(--accent)]" : "text-[color:var(--ink-muted)]"}`} /> :
                                         plugin.category === "security" ? <Zap className={`w-4.5 h-4.5 ${plugin.enabled ? "text-[color:var(--accent)]" : "text-[color:var(--ink-muted)]"}`} /> :
                                         <Eye className={`w-4.5 h-4.5 ${plugin.enabled ? "text-[color:var(--accent)]" : "text-[color:var(--ink-muted)]"}`} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] text-sm">{plugin.name}</p>
                                            <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${categoryColor(plugin.category)}`}>
                                                {categoryLabel(plugin.category)}
                                            </span>
                                            {plugin.required && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40">Required</span>}
                                        </div>
                                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1 leading-relaxed">{plugin.description}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => void toggle(plugin)}
                                    disabled={!!plugin.required || toggling === plugin.key}
                                    className={`flex-shrink-0 transition-opacity ${plugin.required ? "opacity-40 cursor-not-allowed" : "hover:opacity-80"}`}
                                    title={plugin.required ? "This plugin is required and cannot be disabled" : plugin.enabled ? "Disable plugin" : "Enable plugin"}
                                >
                                    {toggling === plugin.key ? (
                                        <div className="w-10 h-6 rounded-full bg-[var(--bg-deep)] dark:bg-[var(--bg-deep)] animate-pulse" />
                                    ) : plugin.enabled ? (
                                        <ToggleRight className="w-8 h-8 text-[color:var(--accent)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" />
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Retention Policies Section ────────────────────────────────────────────────

type RetentionPolicy = {
    id: string;
    name: string;
    description?: string;
    scope: "tenant" | "workspace" | "role";
    action: "delete" | "archive" | "never_delete";
    retentionDays: number | null;
    workspaceId?: string;
    roleKey?: string;
    createdAt?: string;
};

type RetentionResponse = {
    policies?: RetentionPolicy[];
    error?: string;
    message?: string;
};

const DATA_TYPES = [
    { value: "task_logs",        label: "Task Execution Logs",     desc: "Logs of every task run by an agent" },
    { value: "evidence",         label: "Evidence Bundles",        desc: "Files, screenshots, and context attached to approvals" },
    { value: "transcripts",      label: "Conversation Transcripts",desc: "Full LLM conversation history" },
    { value: "approvals",        label: "Approval Records",        desc: "Every human decision made on agent actions" },
    { value: "audit_events",     label: "Audit Events",            desc: "All platform activity and config changes" },
    { value: "memory",           label: "Agent Memory",            desc: "Episodic and semantic memory records" },
];

const RETENTION_PRESETS = [
    { label: "30 days",  days: 30,   tag: "Standard — good for task logs" },
    { label: "90 days",  days: 90,   tag: "GDPR — personal data maximum" },
    { label: "1 year",   days: 365,  tag: "Typical compliance" },
    { label: "7 years",  days: 2555, tag: "SOX / HIPAA requirement" },
    { label: "Forever",  days: null, tag: "Never delete" },
];

function RetentionSection() {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading]   = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError]       = useState<string | null>(null);

    // form state
    const [name, setName]             = useState("");
    const [dataType, setDataType]     = useState("task_logs");
    const [scope, setScope]           = useState<"tenant" | "workspace">("tenant");
    const [retentionDays, setRetDays] = useState<number | null>(90);
    const [saving, setSaving]         = useState(false);
    const [formError, setFormError]   = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/governance/retention");
            const body = (await res.json()) as RetentionResponse;
            setPolicies(body.policies ?? []);
        } catch { /* silent */ } finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setFormError("Name is required."); return; }
        setSaving(true); setFormError(null);
        try {
            const res = await fetch("/api/governance/retention", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: `${DATA_TYPES.find(d => d.value === dataType)?.label} — ${retentionDays ? `${retentionDays} day` : "never delete"}`,
                    scope,
                    action: retentionDays === null ? "never_delete" : "delete",
                    retentionDays,
                    roleKey: dataType,
                }),
            });
            const body = (await res.json()) as RetentionResponse;
            if (!res.ok) { setFormError(body.message ?? body.error ?? "Failed to save."); return; }
            setShowForm(false);
            setName(""); setDataType("task_logs"); setScope("tenant"); setRetDays(90);
            await load();
        } catch { setFormError("Network error."); }
        finally { setSaving(false); }
    };

    const deletePolicy = async (id: string) => {
        setDeleting(id); setError(null);
        try {
            const res = await fetch(`/api/governance/retention?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            if (res.ok) { await load(); }
            else { const b = (await res.json()) as RetentionResponse; setError(b.message ?? "Failed to delete."); }
        } catch { setError("Network error."); }
        finally { setDeleting(null); }
    };

    const inputCls = "w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]";

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Data Retention Policies</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                        Control how long AgentFarm keeps your data. Each policy sets a TTL (time-to-live) on
                        a specific data type — after which records are automatically deleted.
                    </p>
                </div>
                <button onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-1.5 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] text-white px-4 py-2 text-sm font-bold transition-colors flex-shrink-0">
                    <Plus className="w-4 h-4" /> New policy
                </button>
            </div>

            {/* Info callout */}
            <div className="rounded-[4px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 px-5 py-4 flex gap-3">
                <Info className="w-4 h-4 text-[color:var(--accent)] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[color:var(--accent)] dark:text-[color:var(--accent)] space-y-1">
                    <p className="font-semibold">Why this matters for your compliance</p>
                    <ul className="text-xs text-[color:var(--accent)] dark:text-[color:var(--accent)] space-y-0.5 list-disc list-inside">
                        <li><strong>GDPR:</strong> Personal data must not be kept longer than necessary — typically 90 days</li>
                        <li><strong>HIPAA:</strong> Medical records require 7-year (2,555 day) minimum retention</li>
                        <li><strong>SOX:</strong> Financial audit records require 7-year retention</li>
                        <li><strong>Default (no policy):</strong> Data is kept indefinitely — costs grow and breach surface expands</li>
                    </ul>
                </div>
            </div>

            {/* Create form */}
            {showForm && (
                <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/40 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">New Retention Policy</h3>
                            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Set how long a specific type of data should be kept</p>
                        </div>
                        <button onClick={() => setShowForm(false)} className="rounded-full p-1.5 hover:bg-[var(--line)] dark:hover:bg-[var(--card)] text-[color:var(--ink-muted)] transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <form onSubmit={save} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5">Policy name</label>
                            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. GDPR - 90 day task log deletion" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5">Data type to apply this to</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {DATA_TYPES.map(dt => (
                                    <button key={dt.value} type="button" onClick={() => setDataType(dt.value)}
                                        className={`text-left rounded-[3px] border px-3 py-2.5 transition-colors ${dataType === dt.value ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line-strong)]"}`}>
                                        <p className="text-sm font-semibold">{dt.label}</p>
                                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">{dt.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5">Scope</label>
                            <div className="flex gap-2">
                                {[{ v: "tenant" as const, l: "Entire workspace" }, { v: "workspace" as const, l: "This workspace only" }].map(({ v, l }) => (
                                    <button key={v} type="button" onClick={() => setScope(v)}
                                        className={`flex-1 rounded-[3px] border py-2.5 text-sm font-semibold transition-colors ${scope === v ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line-strong)]"}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5">How long to keep it</label>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {RETENTION_PRESETS.map(p => (
                                    <button key={p.label} type="button" onClick={() => setRetDays(p.days)}
                                        className={`rounded-[3px] border px-3 py-2.5 text-center transition-colors ${retentionDays === p.days ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line-strong)]"}`}>
                                        <p className="text-sm font-bold">{p.label}</p>
                                        <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5">{p.tag}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 px-4 py-3 text-sm">
                            <span className="font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Preview: </span>
                            <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                {DATA_TYPES.find(d => d.value === dataType)?.label} records
                                {retentionDays ? ` older than ${retentionDays} days will be automatically deleted` : ` will never be automatically deleted`}
                                {scope === "workspace" ? " (this workspace only)" : " (all workspaces)"}.
                            </span>
                        </div>

                        {formError && <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 rounded-[3px] px-4 py-2">{formError}</p>}

                        <div className="flex gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] py-2.5 text-sm font-semibold">Cancel</button>
                            <button type="submit" disabled={saving} className="flex-1 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 text-white py-2.5 text-sm font-bold transition-colors">
                                {saving ? "Saving…" : "Create Policy"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {error && <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 rounded-[3px] px-4 py-2">{error}</p>}

            {/* Policy list */}
            {loading ? (
                <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>
            ) : policies.length === 0 && !showForm ? (
                <div className="rounded-[4px] border-2 border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] p-12 text-center">
                    <div className="w-14 h-14 rounded-[4px] bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
                        <Database className="w-7 h-7 text-[color:var(--accent)]" />
                    </div>
                    <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">No retention policies yet</h3>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] max-w-sm mx-auto mb-5">
                        Without policies, all data is kept indefinitely. Create your first policy to
                        control costs and meet your compliance requirements.
                    </p>
                    <button onClick={() => setShowForm(true)} className="rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] text-white px-5 py-2.5 text-sm font-bold transition-colors">
                        Create your first policy
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {policies.map(p => {
                        const dt = DATA_TYPES.find(d => d.value === p.roleKey);
                        return (
                            <div key={p.id} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-[3px] bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                                            <Database className="w-5 h-5 text-[color:var(--accent)]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{p.name}</p>
                                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                                                {dt?.label ?? p.roleKey} ·{" "}
                                                {p.retentionDays ? `${p.retentionDays} days` : "Never delete"} ·{" "}
                                                {p.scope === "workspace" ? "This workspace" : "All workspaces"}
                                            </p>
                                            {p.description && <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">{p.description}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-[color:var(--ink-muted)]" />
                                            <span className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                {p.retentionDays ? `${p.retentionDays}d TTL` : "∞ Forever"}
                                            </span>
                                        </div>
                                        <span className="text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 rounded-full px-2.5 py-1">Active</span>
                                        <button onClick={() => void deletePolicy(p.id)} disabled={deleting === p.id}
                                            className="rounded-[3px] p-1.5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] hover:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 transition-colors disabled:opacity-40">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main client component ─────────────────────────────────────────────────────

const TABS = [
    { id: "kpis" as Tab,       label: "KPIs",       icon: TrendingUp },
    { id: "workflows" as Tab,  label: "Workflows",  icon: GitBranch  },
    { id: "plugins" as Tab,    label: "Plugins",    icon: Puzzle     },
    { id: "retention" as Tab,  label: "Retention",  icon: Database   },
];

export default function GovernancePageClient() {
    const [activeTab, setActiveTab] = useState<Tab>("kpis");
    const [kpiData, setKpiData] = useState<KpiData | null>(null);
    const [kpiLoading, setKpiLoading] = useState(true);

    useEffect(() => {
        fetch("/api/governance/kpis")
            .then(r => r.json())
            .then((b: KpiData) => setKpiData(b))
            .catch(() => { /* silently use null */ })
            .finally(() => setKpiLoading(false));
    }, []);

    const refreshKpis = useCallback(() => {
        setKpiLoading(true);
        fetch("/api/governance/kpis")
            .then(r => r.json())
            .then((b: KpiData) => setKpiData(b))
            .catch(() => { /* silent */ })
            .finally(() => setKpiLoading(false));
    }, []);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-[4px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 mb-8 max-w-full overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-5 py-2.5 rounded-[3px] text-sm font-semibold whitespace-nowrap shrink-0 transition-all ${activeTab === id ? "bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] shadow-sm" : "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)]"}`}>
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === "kpis" && (
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-lg font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Governance Health</h2>
                            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Is your oversight system working? Auto-refreshes every 30s.</p>
                        </div>
                        <button onClick={refreshKpis} disabled={kpiLoading} className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)] transition-colors">
                            <RefreshCw className={`w-4 h-4 ${kpiLoading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                    </div>
                    <KpiSection data={kpiData} loading={kpiLoading} />
                </div>
            )}

            {activeTab === "workflows" && (
                <div>
                    <WorkflowsSection />
                </div>
            )}

            {activeTab === "plugins" && (
                <div>
                    <PluginsSection />
                </div>
            )}

            {activeTab === "retention" && (
                <div>
                    <RetentionSection />
                </div>
            )}
        </div>
    );
}
