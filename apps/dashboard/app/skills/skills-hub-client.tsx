'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import {
    ShoppingBag, Search, Play, BarChart2, Layers,
    Shield, Users, RefreshCw, AlertCircle,
} from 'lucide-react';
import { SkillMarketplacePanel } from '../components/skill-marketplace-panel';
import { SkillInvokePanel } from '../components/skill-invoke-panel';
import { SkillSearchPanel } from '../components/skill-search-panel';
import SkillPipelinesPanel from '../components/skill-pipelines-panel';
import { InternalSkillCatalogPanel } from '../components/internal-skill-catalog-panel';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'marketplace' | 'search' | 'invoke' | 'telemetry' | 'pipelines' | 'catalog' | 'roles';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'marketplace', label: 'Marketplace',    icon: ShoppingBag, desc: 'Browse, install, and manage skills'         },
    { key: 'search',      label: 'Skill Search',   icon: Search,      desc: 'Full-text search across skill catalog'      },
    { key: 'invoke',      label: 'Invoke',         icon: Play,        desc: 'Directly call any skill from the dashboard' },
    { key: 'telemetry',   label: 'Telemetry',      icon: BarChart2,   desc: 'Usage stats and performance per skill'      },
    { key: 'pipelines',   label: 'Pipelines',      icon: Layers,      desc: 'Build, run and view multi-skill pipelines'  },
    { key: 'catalog',     label: 'Admin Catalog',   icon: Shield,      desc: 'Admin-only view of all registered skills'   },
    { key: 'roles',       label: 'Role Skills',    icon: Users,       desc: 'Role-based skill recommendations'           },
];

// ── Telemetry tab — built fresh (no existing component) ───────────────────────

type SkillTelemetry = {
    skill_id: string;
    invocation_count: number;
    success_rate: number;
    avg_latency_ms: number;
    last_used_at: string | null;
    error_count: number;
};

function TelemetryTab({ botId, workspaceId }: { botId: string; workspaceId: string }) {
    const [skills, setSkills] = useState<SkillTelemetry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/telemetry?workspace_id=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' });
            const data = (await res.json()) as { skills?: SkillTelemetry[]; error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to load telemetry'); return; }
            setSkills(data.skills ?? []);
        } catch { setError('Network error loading telemetry.'); }
        finally { setLoading(false); }
    }, [botId, workspaceId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>Skill Usage Telemetry</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Invocation counts, success rates, and latency per skill for this agent</div>
                </div>
                <button onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 10, background: 'rgba(196,22,28,0.07)', border: '1px solid rgba(196,22,28,0.2)', color: '#c4161c', fontSize: 13 }}>
                    <AlertCircle size={13} /> {error}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[1,2,3].map(i => <div key={i} style={{ height: 60, borderRadius: 12, background: 'var(--bg-deep)' }} />)}
                </div>
            ) : skills.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 16 }}>
                    <BarChart2 size={32} color="var(--ink-muted)" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No telemetry data yet</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>Skill usage stats appear here once your agent starts invoking skills.</p>
                </div>
            ) : (
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
                                {['Skill', 'Invocations', 'Success Rate', 'Avg Latency', 'Errors', 'Last Used'].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {skills.map(s => {
                                const successColor = s.success_rate >= 0.9 ? '#1a7a4a' : s.success_rate >= 0.7 ? '#b45309' : '#c4161c';
                                return (
                                    <tr key={s.skill_id} style={{ borderBottom: '1px solid var(--bg)' }}>
                                        <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--ink)' }}>{s.skill_id}</td>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)' }}>{s.invocation_count.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 50, height: 4, borderRadius: 9999, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${s.success_rate * 100}%`, background: successColor, borderRadius: 9999 }} />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: successColor }}>{(s.success_rate * 100).toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>{s.avg_latency_ms}ms</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: s.error_count > 0 ? '#c4161c' : 'var(--ink-muted)' }}>{s.error_count}</span>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink-muted)' }}>
                                            {s.last_used_at ? new Date(s.last_used_at).toLocaleString() : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Role-based skills tab — curated skill recommendations per agent role ───────

function RolesTab() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '16px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Users size={16} color="#0066cc" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Role-Based Skill Recommendations</div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55 }}>
                            Each agent role (Developer, DevOps, Sales, Recruiter, etc.) has a curated set of recommended skills.
                            This view shows which skills are most useful per role and lets you filter the marketplace by agent type.
                        </p>
                    </div>
                </div>
            </div>

            {/* Role cards — 12 agent roles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {[
                    { id: 'developer',    label: 'Developer',            icon: '💻', skills: ['code_review', 'test_generation', 'pr_draft', 'ci_triage'] },
                    { id: 'fsd',          label: 'Full-Stack Dev',        icon: '🖥️', skills: ['ui_generation', 'api_design', 'code_review', 'deploy_check'] },
                    { id: 'devops',       label: 'DevOps',               icon: '⚙️', skills: ['incident_triage', 'deploy_check', 'cost_analysis', 'alerting'] },
                    { id: 'tester',       label: 'Tester',               icon: '🧪', skills: ['test_generation', 'bug_reproduction', 'regression_scan'] },
                    { id: 'pm',           label: 'Project Manager',      icon: '🗂️', skills: ['sprint_planning', 'status_report', 'risk_assessment'] },
                    { id: 'ba',           label: 'Business Analyst',     icon: '📊', skills: ['requirements_draft', 'stakeholder_summary', 'spec_review'] },
                    { id: 'tw',           label: 'Technical Writer',     icon: '✍️', skills: ['doc_generation', 'api_docs', 'readme_update'] },
                    { id: 'sales',        label: 'Sales',                icon: '🤝', skills: ['outreach_draft', 'lead_scoring', 'proposal_gen'] },
                    { id: 'marketing',    label: 'Marketing',            icon: '📣', skills: ['content_generation', 'seo_check', 'campaign_brief'] },
                    { id: 'cs',           label: 'Customer Support',     icon: '🎧', skills: ['ticket_triage', 'reply_draft', 'escalation_detect'] },
                    { id: 'recruiter',    label: 'Recruiter',            icon: '🔍', skills: ['jd_writing', 'candidate_screen', 'interview_prep'] },
                    { id: 'ca',           label: 'Corporate Asst.',      icon: '🗓️', skills: ['email_draft', 'meeting_summary', 'calendar_plan'] },
                ].map(({ id, label, icon, skills }) => (
                    <div key={id} style={{ padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</div>
                                <div style={{ fontSize: 10, color: 'var(--ink-muted)', fontFamily: 'monospace' }}>{id}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {skills.map(s => (
                                <span key={s} style={{ fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace', padding: '2px 7px', borderRadius: 6, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.18)', color: '#0066cc' }}>{s}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Tab shell ─────────────────────────────────────────────────────────────────

function TabShell({ title, icon: Icon, description, children }: {
    title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="#0066cc" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                {children}
            </div>
        </div>
    );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function SkillsHubClient({
    workspaceId, botId, tenantId: _tenantId,
}: {
    workspaceId: string; botId: string; tenantId: string;
}) {
    const [activeTab, setActiveTab] = useState<Tab>('marketplace');

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "var(--font-inter), -apple-system, sans-serif", display: 'flex', flexDirection: 'column' }}>

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <header style={{ height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Skill Marketplace</span>
                </div>
                <div style={{ marginLeft: 8, display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 9999, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.2)', color: '#0066cc', fontWeight: 600, fontFamily: 'monospace' }}>ws: {workspaceId.slice(0, 18)}</span>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 9999, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.2)', color: '#0066cc', fontWeight: 600, fontFamily: 'monospace' }}>bot: {botId.slice(0, 14)}</span>
                </div>
            </header>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '13px 14px', background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? '#0066cc' : 'transparent'}`, cursor: 'pointer', color: active ? '#0066cc' : 'var(--ink-muted)', fontSize: 13, fontWeight: active ? 600 : 500, transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap' }}>
                            <Icon size={13} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>

                {activeTab === 'marketplace' && (
                    <TabShell icon={ShoppingBag} title="Skill Marketplace"
                        description="Browse the full catalogue of available skills. Install with one click — entitlements control what's available for your workspace.">
                        <SkillMarketplacePanel workspaceId={workspaceId} botId={botId} />
                    </TabShell>
                )}

                {activeTab === 'search' && (
                    <TabShell icon={Search} title="Skill Search"
                        description="Full-text search across the entire skill catalog — find skills by name, category, tag, or description.">
                        <SkillSearchPanel workspaceId={workspaceId} botId={botId} />
                    </TabShell>
                )}

                {activeTab === 'invoke' && (
                    <TabShell icon={Play} title="Invoke a Skill"
                        description="Directly call any installed skill from the dashboard — test it, provide inputs, and see the raw output. Useful for debugging and exploration.">
                        <SkillInvokePanel workspaceId={workspaceId} botId={botId} />
                    </TabShell>
                )}

                {activeTab === 'telemetry' && (
                    <TabShell icon={BarChart2} title="Skill Telemetry"
                        description="Usage statistics per skill — invocation counts, success rate, average latency, and error counts. Use this to identify underperforming or heavily-used skills.">
                        <TelemetryTab botId={botId} workspaceId={workspaceId} />
                    </TabShell>
                )}

                {activeTab === 'pipelines' && (
                    <TabShell icon={Layers} title="Skill Pipelines"
                        description="Chain multiple skills into automated pipelines. Build a sequence of skill invocations, schedule them, and monitor run history.">
                        <SkillPipelinesPanel />
                    </TabShell>
                )}

                {activeTab === 'catalog' && (
                    <TabShell icon={Shield} title="Admin Skill Catalog"
                        description="Admin-only view of all registered skills across the platform. Shows full metadata, entitlements, and installation status per skill.">
                        <InternalSkillCatalogPanel defaultWorkspaceId={workspaceId} defaultBotId={botId} />
                    </TabShell>
                )}

                {activeTab === 'roles' && (
                    <RolesTab />
                )}
            </div>
        </div>
    );
}
