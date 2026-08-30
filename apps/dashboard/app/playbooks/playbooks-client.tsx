'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    BookOpen, Search, X, ChevronRight, RefreshCw,
    AlertCircle, CheckCircle, Clock, Zap, Filter, Lock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type InputField = {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select';
    required: boolean;
    placeholder?: string;
    options?: string[];
};

type Template = {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    agentRole: string;
    promptTemplate: string;
    inputSchema: InputField[];
    exampleInputs: Record<string, string>;
    tags: string[];
    isBuiltIn: boolean;
    useCount: number;
    estimatedTime?: string;
    locked?: boolean;
};

type Bot = { id: string; role: string; status: string; workspaceId: string };

type DispatchResult = { dispatchId: string; taskDescription: string; status: string; queuedAt: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
    all: 'All',
    sales: 'Sales',
    recruiting: 'Recruiting',
    content: 'Content',
    technical: 'Technical',
    devops: 'DevOps',
    engineering: 'Engineering',
    support: 'Support',
    meetings: 'Meetings',
};

const CATEGORY_ICONS: Record<string, string> = {
    all: '🗂',
    sales: '💼',
    recruiting: '🧑‍💼',
    content: '✍️',
    technical: '📄',
    devops: '⚙️',
    engineering: '🔧',
    support: '🎧',
    meetings: '📋',
};

const ROLE_LABEL: Record<string, string> = {
    sales_agent: 'Sales',
    recruiter: 'Recruiter',
    content_writer: 'Content Writer',
    technical_writer: 'Technical Writer',
    devops: 'DevOps',
    tester: 'Tester',
    customer_support_executive: 'Support',
    meeting_agent: 'Meeting',
    full_stack_developer: 'Full-Stack Dev',
    developer: 'Developer',
    business_analyst: 'Business Analyst',
    project_manager: 'Project Manager',
    marketing_specialist: 'Marketing',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 9999,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                background: active ? 'var(--accent)' : 'var(--card)',
                color: active ? 'var(--card)' : 'var(--ink-soft)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
            }}
        >
            {label}
        </button>
    );
}

function TemplateCard({ template, onClick }: { template: Template; onClick: () => void }) {
    const locked = template.locked === true;
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
                padding: '18px 20px', borderRadius: 14,
                border: `1px solid ${locked ? 'var(--line)' : 'var(--line)'}`,
                background: locked ? 'var(--bg-deep)' : 'var(--card)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                opacity: locked ? 0.72 : 1,
                position: 'relative', overflow: 'hidden',
            }}
            onMouseEnter={e => {
                if (!locked) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)';
                }
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: locked ? 'var(--ink-muted)' : 'var(--accent)',
                    background: locked ? 'rgba(0,0,0,0.06)' : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    padding: '2px 8px', borderRadius: 9999, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                    {CATEGORY_LABELS[template.category] ?? template.category}
                </span>
                {locked ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 4,
                        background: 'rgba(0,0,0,0.06)', padding: '2px 8px', borderRadius: 9999 }}>
                        <Lock size={9} /> Add agent to unlock
                    </span>
                ) : template.estimatedTime ? (
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {template.estimatedTime}
                    </span>
                ) : null}
            </div>

            <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: locked ? 'var(--ink-soft)' : 'var(--ink)', marginBottom: 4 }}>
                    {template.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>{template.description}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 'auto' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {template.tags.slice(0, 3).map(tag => (
                        <span key={tag} style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 9999,
                            background: 'var(--bg-deep)', color: 'var(--ink-muted)',
                        }}>{tag}</span>
                    ))}
                </div>
                {locked ? (
                    <a href="/agents" onClick={e => e.stopPropagation()} style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                        Add {ROLE_LABEL[template.agentRole] ?? template.agentRole} <ChevronRight size={11} />
                    </a>
                ) : (
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 }}>
                        Use <ChevronRight size={12} />
                    </span>
                )}
            </div>
        </button>
    );
}

// ── Dispatch Modal ─────────────────────────────────────────────────────────────

function DispatchModal({
    template,
    bots,
    workspaceId,
    onClose,
}: {
    template: Template;
    bots: Bot[];
    workspaceId: string;
    onClose: () => void;
}) {
    const [inputs, setInputs] = useState<Record<string, string>>(() => ({ ...template.exampleInputs }));
    const [agentId, setAgentId] = useState<string>(bots[0]?.id ?? '');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<DispatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const compatibleBots = bots.filter(b => b.status === 'active' || b.status === 'ready');

    const dispatch = async () => {
        if (!agentId) { setError('Select an agent to dispatch to.'); return; }
        const missingRequired = template.inputSchema.filter(f => f.required && !inputs[f.name]?.trim());
        if (missingRequired.length > 0) {
            setError(`Required fields missing: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }
        setBusy(true); setError(null);
        try {
            const res = await fetch(`/api/task-templates/${encodeURIComponent(template.id)}/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, workspaceId, inputs }),
            });
            const data = (await res.json()) as DispatchResult & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Dispatch failed'); return; }
            setResult(data);
        } catch { setError('Network error. Please try again.'); }
        finally { setBusy(false); }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
        }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'var(--card)', borderRadius: 18, border: '1px solid var(--line)',
                width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
                {/* Header */}
                <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                            {CATEGORY_LABELS[template.category] ?? template.category} · {ROLE_LABEL[template.agentRole] ?? template.agentRole}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{template.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.5 }}>{template.description}</div>
                    </div>
                    <button onClick={onClose} style={{ color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                        <X size={16} />
                    </button>
                </div>

                {result ? (
                    // Success state
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'var(--ok-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={24} color="var(--ok)" />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Task Dispatched</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 400 }}>
                                {result.taskDescription.length > 120 ? result.taskDescription.slice(0, 120) + '…' : result.taskDescription}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'monospace', background: 'var(--bg-deep)', padding: '4px 10px', borderRadius: 8 }}>
                            ID: {result.dispatchId}
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <a href="/tasks" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                                View in Tasks →
                            </a>
                            <button onClick={onClose} style={{ fontSize: 13, color: 'var(--ink-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    // Inputs form
                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                                <AlertCircle size={13} /> {error}
                            </div>
                        )}

                        {/* Agent selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                                Dispatch to Agent <span style={{ color: 'var(--danger)' }}>*</span>
                            </label>
                            {compatibleBots.length === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--ink-muted)', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-deep)' }}>
                                    No active agents available. Start an agent first.
                                </div>
                            ) : (
                                <select
                                    value={agentId}
                                    onChange={e => setAgentId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13 }}
                                >
                                    {compatibleBots.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {ROLE_LABEL[b.role] ?? b.role} · {b.id.slice(-8)}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Template inputs */}
                        {template.inputSchema.map(field => (
                            <div key={field.name}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                                    {field.label}
                                    {field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                                </label>
                                {field.type === 'textarea' ? (
                                    <textarea
                                        value={inputs[field.name] ?? ''}
                                        onChange={e => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                                        placeholder={field.placeholder}
                                        rows={4}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        value={inputs[field.name] ?? ''}
                                        onChange={e => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13 }}
                                    >
                                        <option value="">Select…</option>
                                        {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={inputs[field.name] ?? ''}
                                        onChange={e => setInputs(prev => ({ ...prev, [field.name]: e.target.value }))}
                                        placeholder={field.placeholder}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }}
                                    />
                                )}
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                            <button
                                onClick={dispatch}
                                disabled={busy || compatibleBots.length === 0}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                    padding: '10px 20px', borderRadius: 10,
                                    background: busy ? 'var(--line)' : 'var(--accent)',
                                    color: busy ? 'var(--ink-muted)' : 'var(--card)',
                                    border: 'none', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {busy ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                                {busy ? 'Dispatching…' : 'Dispatch Now'}
                            </button>
                            <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PlaybooksClient({
    tenantId: _tenantId,
    workspaceIds,
}: {
    tenantId: string;
    workspaceIds: string[];
}) {
    const workspaceId = workspaceIds[0] ?? '';

    const [templates, setTemplates] = useState<Template[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [bots, setBots] = useState<Bot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [selected, setSelected] = useState<Template | null>(null);
    const [lockedTemplate, setLockedTemplate] = useState<Template | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [tmplRes, botRes] = await Promise.all([
                fetch('/api/task-templates', { cache: 'no-store' }),
                fetch('/api/agents', { cache: 'no-store' }),
            ]);
            const tmplData = (await tmplRes.json()) as { templates?: Template[]; categories?: string[]; error?: string };
            if (!tmplRes.ok) { setError(tmplData.error ?? 'Failed to load templates'); return; }
            setTemplates(tmplData.templates ?? []);
            setCategories(['all', ...(tmplData.categories ?? [])]);

            if (botRes.ok) {
                const botData = (await botRes.json()) as { bots?: Bot[]; agents?: Bot[] };
                setBots(botData.bots ?? botData.agents ?? []);
            }
        } catch { setError('Network error loading playbooks.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const filtered = templates.filter(t => {
        if (activeCategory !== 'all' && t.category !== activeCategory) return false;
        if (query) {
            const lq = query.toLowerCase();
            return t.name.toLowerCase().includes(lq) || t.description.toLowerCase().includes(lq) || t.tags.some(tag => tag.toLowerCase().includes(lq));
        }
        return true;
    });

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
            {/* Header */}
            <div style={{ padding: '32px 32px 0', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BookOpen size={18} color="var(--card)" />
                    </div>
                    <div>
                        <div style={{ fontFamily: 'var(--font-plex-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: 'var(--accent)', lineHeight: 1, marginBottom: 3 }}>Templates</div>
                        <h1 style={{ margin: 0, fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1 }}>Playbooks</h1>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)' }}>Pre-built task templates — browse, customise, and dispatch in one click</p>
                    </div>
                </div>

                {/* Search + filter bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 16px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search playbooks…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }}
                        />
                    </div>
                    <button onClick={load} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* Category pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
                    {categories.map(cat => (
                        <CategoryPill
                            key={cat}
                            label={`${CATEGORY_ICONS[cat] ?? ''} ${CATEGORY_LABELS[cat] ?? cat}`}
                            active={activeCategory === cat}
                            onClick={() => setActiveCategory(cat)}
                        />
                    ))}
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: '0 32px 40px', maxWidth: 1200, margin: '0 auto' }}>
                {error && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, marginBottom: 20 }}>
                        <AlertCircle size={14} />
                        <span style={{ flex: 1 }}>{error}</span>
                        <button type="button" onClick={() => void load()} style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger-border)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}>
                            Retry
                        </button>
                    </div>
                )}

                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} style={{ height: 160, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-muted)' }}>
                        <Filter size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 6 }}>No playbooks match your filters</div>
                        <div style={{ fontSize: 13 }}>Try clearing the search or selecting a different category</div>
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 14 }}>
                            {filtered.length} playbook{filtered.length !== 1 ? 's' : ''}
                            {activeCategory !== 'all' ? ` in ${CATEGORY_LABELS[activeCategory] ?? activeCategory}` : ''}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                            {filtered.map(t => (
                                <TemplateCard
                                    key={t.id}
                                    template={t}
                                    onClick={() => t.locked ? setLockedTemplate(t) : setSelected(t)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Dispatch modal */}
            {selected && (
                <DispatchModal
                    template={selected}
                    bots={bots}
                    workspaceId={workspaceId}
                    onClose={() => setSelected(null)}
                />
            )}

            {/* Locked template prompt */}
            {lockedTemplate && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 20,
                }}
                    onClick={e => { if (e.target === e.currentTarget) setLockedTemplate(null); }}
                >
                    <div style={{
                        background: 'var(--card)', borderRadius: 18, border: '1px solid var(--line)',
                        width: '100%', maxWidth: 420, padding: 32,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
                    }}>
                        <div style={{ width: 48, height: 48, borderRadius: 9999, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Lock size={22} color="var(--ink-soft)" />
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                                {lockedTemplate.name}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                                This playbook requires a{' '}
                                <strong>{ROLE_LABEL[lockedTemplate.agentRole] ?? lockedTemplate.agentRole}</strong>{' '}
                                agent. Add one to your workspace to unlock it.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                            <a href="/agents" style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: '10px 16px', borderRadius: 10,
                                background: 'var(--accent)', color: 'var(--card)',
                                fontSize: 13, fontWeight: 700, textDecoration: 'none',
                            }}>
                                Add Agent
                            </a>
                            <button onClick={() => setLockedTemplate(null)} style={{
                                flex: 1, padding: '10px 16px', borderRadius: 10,
                                border: '1px solid var(--line)', background: 'var(--card)',
                                color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer',
                            }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
