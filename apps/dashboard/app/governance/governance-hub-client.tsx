'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UiKit, Masthead, Tabs } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';
import {
    ShieldCheck, TrendingUp, GitBranch, ShieldAlert,
    Zap, Eye, RotateCcw, Database, Puzzle, Bot,
    ExternalLink, ShieldBan, FileText, ClipboardCheck,
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
import ComplianceExportPanel from '../components/compliance-export-panel';
import PolicySimulatorPanel from '../components/policy-simulator-panel';
import RoleBaselineBlocksPanel from '../components/role-baseline-blocks-panel';
import { PluginLoadingPanel } from '../components/plugin-loading-panel';

// ── Tab definition ────────────────────────────────────────────────────────────

type Tab = 'kpis' | 'workflows' | 'role-policies' | 'policy-docs' | 'compliance' | 'kill-switches' | 'circuit-breakers' | 'disclosure' | 'retention' | 'plugins';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string; needsBot?: boolean }[] = [
    { key: 'kpis',             label: 'KPIs',             icon: TrendingUp,  desc: 'Approval rate, decision latency, SLA compliance'      },
    { key: 'workflows',        label: 'Workflows',        icon: GitBranch,   desc: 'Multi-step governance flows'                          },
    { key: 'role-policies',    label: 'Policies',         icon: ShieldBan,   desc: 'Per-role/tenant action, connector & MCP guardrails'   },
    { key: 'policy-docs',      label: 'Policy Docs',      icon: FileText,    desc: 'Upload policy documents → extract & apply rules'      },
    { key: 'compliance',       label: 'Compliance',       icon: ClipboardCheck, desc: 'Active policies, applied docs & violation history'  },
    { key: 'kill-switches',    label: 'Kill Switches',    icon: ShieldAlert, desc: 'Emergency stop per workspace + resume'                },
    { key: 'circuit-breakers', label: 'Circuit Breakers', icon: Zap,         desc: 'Per-service breaker status + manual reset'            },
    { key: 'disclosure',       label: 'Disclosure',       icon: Eye,         desc: 'What each agent is permitted to disclose',  needsBot: true },
    { key: 'retention',        label: 'Retention',        icon: Database,    desc: 'Data TTL policies per workspace and type'             },
    { key: 'plugins',          label: 'Plugins',          icon: Puzzle,      desc: 'Enable/disable governance plugins'                    },
];

// ── Bot ID input (reused for disclosure) ──────────────────────────────────────

function BotIdInput({ botId, setBotId }: { botId: string; setBotId: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(37, 99, 235,0.04)', border: '1px solid rgba(37, 99, 235,0.15)', borderRadius: 3, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(37, 99, 235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, padding: 20, boxShadow: 'none' }}>
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
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Governance & Compliance"
                title="Governance"
                actions={<>
                    <Link href="/" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Dashboard</Link>
                    <WfThemeToggle />
                    <Link href="/?tab=approvals" className="uk-btn uk-btn--ghost uk-btn--sm" style={{ textDecoration: 'none' }}>
                        <ExternalLink size={11} /> Approval Queue
                    </Link>
                    {botId.trim() && (
                        <span className="uk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 11 }}>
                            <Bot size={11} />{botId.slice(0, 16)}{botId.length > 16 ? '…' : ''}
                            <button onClick={() => setBotId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: 13 }}>×</button>
                        </span>
                    )}
                </>}
            />

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ padding: '0 28px' }}>
                <Tabs
                    tabs={TABS.map(t => ({ key: t.key, label: t.label, icon: <t.icon size={13} /> }))}
                    active={activeTab}
                    onChange={setActiveTab}
                />
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 28, overflow: 'auto' }}>

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
                        <RoleBaselineBlocksPanel />
                        <PolicySimulatorPanel />
                    </TabShell>
                )}

                {activeTab === 'policy-docs' && (
                    <TabShell icon={FileText} title="Policy Documents" description="Upload a policy document (PDF, DOCX, Markdown…). It is embedded for agent grounding and an LLM extracts candidate governance rules. Review the candidates and apply the ones you approve — only then are they enforced.">
                        <PolicyDocumentsPanel />
                    </TabShell>
                )}

                {activeTab === 'compliance' && (
                    <TabShell icon={ClipboardCheck} title="Compliance Export" description="A point-in-time report of this tenant's governance posture: active policies across all scopes, uploaded policy documents, and the recorded policy-violation history. Download as JSON for audits.">
                        <ComplianceExportPanel />
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
        </UiKit>
    );
}
