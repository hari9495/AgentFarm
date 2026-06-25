'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    ShieldCheck, TrendingUp, GitBranch, ShieldAlert,
    Zap, Eye, RotateCcw, Database, Puzzle, Bot,
    ExternalLink, ShieldBan, FileText,
} from 'lucide-react';
import { GovernanceKPIPanel } from '../components/governance-kpis-panel';
import { GovernanceWorkflowPanel } from '../components/governance-workflow-panel';
import { WorkflowBuilderPanel } from '../components/workflow-builder-panel';
import KillSwitchPanel from '../components/kill-switch-panel';
import CircuitBreakersPanel from '../components/circuit-breakers-panel';
import { DisclosureSettingsPanel } from '../components/disclosure-settings-panel';
import RetentionPolicyPanel from '../components/retention-policy-panel';
import GovernancePolicyPanel from '../components/governance-policy-panel';
import PolicyDocumentsPanel from '../components/policy-documents-panel';
import { PluginLoadingPanel } from '../components/plugin-loading-panel';

// ── Tab definition ────────────────────────────────────────────────────────────

type Tab = 'kpis' | 'workflows' | 'role-policies' | 'policy-docs' | 'kill-switches' | 'circuit-breakers' | 'disclosure' | 'retention' | 'plugins';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string; needsBot?: boolean }[] = [
    { key: 'kpis',             label: 'KPIs',             icon: TrendingUp,  desc: 'Approval rate, decision latency, SLA compliance'      },
    { key: 'workflows',        label: 'Workflows',        icon: GitBranch,   desc: 'Multi-step governance flows'                          },
    { key: 'role-policies',    label: 'Policies',         icon: ShieldBan,   desc: 'Per-role/tenant action, connector & MCP guardrails'   },
    { key: 'policy-docs',      label: 'Policy Docs',      icon: FileText,    desc: 'Upload policy documents → extract & apply rules'      },
    { key: 'kill-switches',    label: 'Kill Switches',    icon: ShieldAlert, desc: 'Emergency stop per workspace + resume'                },
    { key: 'circuit-breakers', label: 'Circuit Breakers', icon: Zap,         desc: 'Per-service breaker status + manual reset'            },
    { key: 'disclosure',       label: 'Disclosure',       icon: Eye,         desc: 'What each agent is permitted to disclose',  needsBot: true },
    { key: 'retention',        label: 'Retention',        icon: Database,    desc: 'Data TTL policies per workspace and type'             },
    { key: 'plugins',          label: 'Plugins',          icon: Puzzle,      desc: 'Enable/disable governance plugins'                    },
];

// ── Bot ID input (reused for disclosure) ──────────────────────────────────────

function BotIdInput({ botId, setBotId }: { botId: string; setBotId: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.15)', borderRadius: 12, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={14} color="var(--accent)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Bot ID required</div>
                <input
                    value={botId} onChange={e => setBotId(e.target.value)}
                    placeholder="Enter a Bot ID to load disclosure settings…"
                    style={{ width: '100%', maxWidth: 360, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                    autoFocus
                />
            </div>
        </div>
    );
}

// ── Tab shell ─────────────────────────────────────────────────────────────────

function TabShell({ title, icon: Icon, description, extra, children }: {
    title: string; icon: React.ElementType; description: string;
    extra?: React.ReactNode; children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <Icon size={16} color="var(--accent)" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
                        <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{description}</p>
                    </div>
                </div>
                {extra}
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {children}
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GovernanceHubClient({
    tenantId,
    workspaceId,
}: {
    tenantId: string;
    workspaceId: string;
}) {
    const [activeTab, setActiveTab] = useState<Tab>('kpis');
    const [botId, setBotId] = useState('');

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--bg)',
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            display: 'flex', flexDirection: 'column',
        }}>

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
                flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
                    ← Dashboard
                </Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck size={14} color="var(--accent)" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Governance</span>
                </div>

                {/* Quick link to approval queue */}
                <Link href="/?tab=approvals" style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8, padding: '5px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Approval Queue
                </Link>

                {/* Active bot pill */}
                {botId.trim() && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', fontSize: 12, color: 'var(--accent)', fontWeight: 600, fontFamily: 'monospace' }}>
                        <Bot size={11} color="var(--accent)" />
                        {botId.slice(0, 16)}{botId.length > 16 ? '…' : ''}
                        <button onClick={() => setBotId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: 13 }}>×</button>
                    </div>
                )}
            </header>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon, needsBot }) => {
                    const active = activeTab === key;
                    const unset  = needsBot && !botId.trim();
                    return (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '13px 14px', background: 'transparent', border: 'none',
                            borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                            cursor: 'pointer', color: active ? 'var(--accent)' : unset ? 'var(--ink-muted)' : 'var(--ink-muted)',
                            fontSize: 13, fontWeight: active ? 600 : 500,
                            transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap',
                        }}>
                            <Icon size={13} />
                            {label}
                            {unset && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--line-strong)', flexShrink: 0 }} />}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>

                {activeTab === 'kpis' && (
                    <TabShell icon={TrendingUp} title="Governance KPIs" description="Real-time animated counters across approvals, audit, budget, providers and execution.">
                        <GovernanceKPIPanel workspaceId={workspaceId} />
                    </TabShell>
                )}

                {activeTab === 'workflows' && (
                    <TabShell icon={GitBranch} title="Governance Workflows" description="Monitor active multi-step governance flows, SLA status, and configure new workflow templates.">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <GovernanceWorkflowPanel workspaceId={workspaceId} />
                            <div style={{ borderTop: '1px solid #f0f0f2', paddingTop: 20 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Workflow Builder</div>
                                <WorkflowBuilderPanel workspaceId={workspaceId} />
                            </div>
                        </div>
                    </TabShell>
                )}

                {activeTab === 'role-policies' && (
                    <TabShell icon={ShieldBan} title="Policies" description="Author guardrails per role or tenant: block action types, restrict connectors to read-only or deny specific verbs, and block MCP tools. All rules tighten the built-in defaults — they can never grant access.">
                        <GovernancePolicyPanel />
                    </TabShell>
                )}

                {activeTab === 'policy-docs' && (
                    <TabShell icon={FileText} title="Policy Documents" description="Upload a policy document (PDF, DOCX, Markdown…). It is embedded for agent grounding and an LLM extracts candidate governance rules. Review the candidates and apply the ones you approve — only then are they enforced.">
                        <PolicyDocumentsPanel />
                    </TabShell>
                )}

                {activeTab === 'kill-switches' && (
                    <TabShell
                        icon={ShieldAlert}
                        title="Kill Switches"
                        description="Emergency stop controls per workspace or bot. Immediately halts all task execution in the affected scope."
                    >
                        <KillSwitchPanel />
                    </TabShell>
                )}

                {activeTab === 'circuit-breakers' && (
                    <TabShell icon={Zap} title="Circuit Breakers" description="Per-service circuit breakers with current status and manual reset controls.">
                        <CircuitBreakersPanel tenantId={tenantId} />
                    </TabShell>
                )}

                {activeTab === 'disclosure' && (
                    <TabShell
                        icon={Eye}
                        title="Disclosure Settings"
                        description="Configure what each agent is permitted to disclose to users, with full audit log."
                    >
                        {!botId.trim()
                            ? <BotIdInput botId={botId} setBotId={setBotId} />
                            : <DisclosureSettingsPanel botId={botId} />
                        }
                    </TabShell>
                )}

                {activeTab === 'retention' && (
                    <TabShell icon={Database} title="Retention Policies" description="Set data TTL policies per workspace and data type. Controls auto-deletion of tasks, logs, and evidence.">
                        <RetentionPolicyPanel tenantId={tenantId} />
                    </TabShell>
                )}

                {activeTab === 'plugins' && (
                    <TabShell icon={Puzzle} title="Governance Plugins" description="Enable or disable governance plugins with a full audit trail. Controls which plugins are permitted to run.">
                        <PluginLoadingPanel workspaceId={workspaceId} />
                    </TabShell>
                )}
            </div>
        </div>
    );
}
