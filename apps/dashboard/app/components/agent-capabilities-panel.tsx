'use client';

import { useState } from 'react';
import { UiKit, Masthead, Panel, Badge, Button, Stat } from './ui-kit';
import { WfThemeToggle } from './editorial';

// ─── Types (mirror of API response) ────────────────────────────────────────

type ConnectorEntry = {
    tool: string;
    displayName: string;
    category: string;
    authMethod: string;
    docsUrl: string;
    configSchema?: { key: string; label: string; type: string; required: boolean; placeholder?: string; hint?: string }[];
};

type AgentCapabilitySection = {
    roleKey: string;
    displayName: string;
    tagline: string;
    group: string;
    groupLabel: string;
    featureHighlights: string[];
    purchased: boolean;
    botCount: number;
    connectors: ConnectorEntry[];
};

type CapabilitiesResponse = {
    sections: AgentCapabilitySection[];
    purchasedRoleKeys: string[];
    totalPurchased: number;
    totalAvailable: number;
};

const AUTH_LABEL: Record<string, string> = {
    oauth2: 'OAuth 2.0',
    api_key: 'API Key',
    bearer_token: 'Bearer',
    basic: 'Basic Auth',
    generic_rest: 'Custom',
};

const GROUP_ICON: Record<string, string> = {
    engineering: '⚙️',
    business: '📊',
    content: '✍️',
    marketing: '📢',
    people: '👥',
    support: '🎧',
};

// Editorial pill for category / group filters.
function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="uk-eyebrow"
            style={{
                padding: '5px 11px', borderRadius: 3, cursor: 'pointer', textTransform: 'none', letterSpacing: '0.02em',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--ink-muted)',
            }}
        >
            {children}
        </button>
    );
}

// ─── Connector card ─────────────────────────────────────────────────────────

function ConnectorCard({ connector, onConfigure }: { connector: ConnectorEntry; onConfigure: () => void }) {
    return (
        <div className="uk-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{connector.displayName}</span>
                <Badge tone="neutral">{AUTH_LABEL[connector.authMethod] ?? connector.authMethod}</Badge>
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'capitalize' }}>{connector.category.replace(/_/g, ' ')}</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                {connector.configSchema && connector.configSchema.length > 0 && (
                    <Button variant="primary" size="sm" onClick={onConfigure} style={{ flex: 1 }}>Configure</Button>
                )}
                {connector.docsUrl && (
                    <a href={connector.docsUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <Button variant="ghost" size="sm">Docs ↗</Button>
                    </a>
                )}
            </div>
        </div>
    );
}

// ─── Configure drawer ───────────────────────────────────────────────────────

function ConfigureDrawer({ connector, onClose }: { connector: ConnectorEntry; onClose: () => void }) {
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        // POST to /api/connectors/configure — placeholder for real persistence
        await new Promise((r) => setTimeout(r, 600));
        setSaving(false);
        setSaved(true);
        setTimeout(() => { setSaved(false); onClose(); }, 1200);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
            <div className="uk" style={{ position: 'relative', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, padding: 24, width: '100%', maxWidth: 512, margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>Configure {connector.displayName}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
                </div>

                {connector.configSchema?.map((field) => (
                    <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label className="uk-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', letterSpacing: '0.02em', fontSize: 11 }}>
                            {field.label}
                            {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                        </label>
                        {field.type === 'select' ? (
                            <select className="uk-input" value={values[field.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}>
                                <option value="">Select…</option>
                                {(field as { options?: { value: string; label: string }[] }).options?.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                                className="uk-input"
                                placeholder={field.placeholder}
                                value={values[field.key] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            />
                        )}
                        {field.hint && <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-muted)' }}>{field.hint}</p>}
                    </div>
                ))}

                <div style={{ display: 'flex', gap: 10, paddingTop: 2 }}>
                    <Button variant="primary" size="sm" disabled={saving || saved} onClick={handleSave} style={{ flex: 1 }}>
                        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Configuration'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </div>
    );
}

// ─── Purchased section ──────────────────────────────────────────────────────

function PurchasedSection({ section }: { section: AgentCapabilitySection }) {
    const [open, setOpen] = useState(true);
    const [configuring, setConfiguring] = useState<ConnectorEntry | null>(null);
    const [connectorFilter, setConnectorFilter] = useState<string>('all');

    const categories = Array.from(new Set(section.connectors.map((c) => c.category)));
    const visibleConnectors = connectorFilter === 'all'
        ? section.connectors
        : section.connectors.filter((c) => c.category === connectorFilter);

    return (
        <div className="uk-panel" style={{ overflow: 'hidden', padding: 0 }}>
            {/* Header */}
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{GROUP_ICON[section.group] ?? '🤖'}</span>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{section.displayName}</h3>
                            <Badge tone="ok">Active · {section.botCount} {section.botCount === 1 ? 'agent' : 'agents'}</Badge>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>{section.tagline}</p>
                    </div>
                </div>
                <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid var(--line)' }}>
                    {/* Feature highlights */}
                    <div style={{ paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 24, rowGap: 6 }}>
                        {section.featureHighlights.map((f) => (
                            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                                <span style={{ marginTop: 1, color: 'var(--ok)', flexShrink: 0 }}>✓</span>
                                <span>{f}</span>
                            </div>
                        ))}
                    </div>

                    {/* Connectors */}
                    {section.connectors.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <span className="uk-eyebrow">Available Integrations ({section.connectors.length})</span>
                                {categories.length > 1 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <FilterPill active={connectorFilter === 'all'} onClick={() => setConnectorFilter('all')}>All</FilterPill>
                                        {categories.map((cat) => (
                                            <FilterPill key={cat} active={connectorFilter === cat} onClick={() => setConnectorFilter(cat)}>
                                                {cat.replace(/_/g, ' ')}
                                            </FilterPill>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                                {visibleConnectors.map((c) => (
                                    <ConnectorCard key={c.tool} connector={c} onConfigure={() => setConfiguring(c)} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {configuring && <ConfigureDrawer connector={configuring} onClose={() => setConfiguring(null)} />}
        </div>
    );
}

// ─── Locked section ─────────────────────────────────────────────────────────

function LockedSection({ section }: { section: AgentCapabilitySection }) {
    return (
        <div className="uk-panel" style={{ overflow: 'hidden', padding: 0, opacity: 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20, opacity: 0.5 }}>{GROUP_ICON[section.group] ?? '🤖'}</span>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink-muted)' }}>{section.displayName}</h3>
                            <Badge tone="neutral">🔒 Not hired</Badge>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>{section.tagline}</p>
                    </div>
                </div>
            </div>

            {/* Blurred feature preview */}
            <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--line)' }}>
                <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 24, rowGap: 6, userSelect: 'none', pointerEvents: 'none', filter: 'blur(2px)' }}>
                    {section.featureHighlights.map((f) => (
                        <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
                            <span style={{ marginTop: 1, flexShrink: 0 }}>○</span>
                            <span>{f}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

type Props = {
    capabilities: CapabilitiesResponse | null;
    error?: string;
};

export function AgentCapabilitiesPanel({ capabilities, error }: Props) {
    const [groupFilter, setGroupFilter] = useState<string>('all');

    if (error) {
        return (
            <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="uk-panel" style={{ padding: 24, borderLeft: '2px solid var(--danger)', color: 'var(--danger)', fontSize: 13, maxWidth: 420, textAlign: 'center' }}>{error}</div>
            </UiKit>
        );
    }

    if (!capabilities) {
        return (
            <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading capabilities…</span>
            </UiKit>
        );
    }

    const { sections, totalPurchased, totalAvailable } = capabilities;

    const purchasedSections = sections.filter((s) => s.purchased);
    const lockedSections = sections.filter((s) => !s.purchased);

    const purchasedGroups = Array.from(new Set(purchasedSections.map((s) => s.group)));
    const allGroups = Array.from(new Set(sections.map((s) => s.group)));

    const filteredPurchased = groupFilter === 'all'
        ? purchasedSections
        : purchasedSections.filter((s) => s.group === groupFilter);

    const filteredLocked = groupFilter === 'all'
        ? lockedSections
        : lockedSections.filter((s) => s.group === groupFilter);

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Workforce — Capabilities"
                title="Agent Capabilities"
                actions={<WfThemeToggle />}
                stats={<Stat n={`${totalPurchased}`} k={`of ${totalAvailable} agents hired`} tone="accent" />}
            />

            <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>
                    View and configure the integrations available to each agent you have hired.
                </p>

                {/* Group filter */}
                {allGroups.length > 1 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <FilterPill active={groupFilter === 'all'} onClick={() => setGroupFilter('all')}>All groups</FilterPill>
                        {allGroups.map((group) => {
                            const label = sections.find((s) => s.group === group)?.groupLabel ?? group;
                            return (
                                <FilterPill key={group} active={groupFilter === group} onClick={() => setGroupFilter(group)}>
                                    {GROUP_ICON[group]} {label}
                                </FilterPill>
                            );
                        })}
                    </div>
                )}

                {/* Purchased sections */}
                {filteredPurchased.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {purchasedGroups
                            .filter((g) => groupFilter === 'all' || g === groupFilter)
                            .map((group) => {
                                const groupSections = filteredPurchased.filter((s) => s.group === group);
                                if (groupSections.length === 0) return null;
                                const groupLabel = groupSections[0]?.groupLabel ?? group;
                                return (
                                    <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span className="uk-eyebrow">{GROUP_ICON[group]} {groupLabel}</span>
                                            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                                        </div>
                                        {groupSections.map((s) => <PurchasedSection key={s.roleKey} section={s} />)}
                                    </div>
                                );
                            })}
                    </div>
                ) : (
                    <div className="uk-panel" style={{ padding: 24, textAlign: 'center' }}>
                        <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: 13 }}>No agents hired yet.</p>
                    </div>
                )}

                {/* Locked sections */}
                {filteredLocked.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="uk-eyebrow">🔒 Available to Hire ({filteredLocked.length})</span>
                            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                            {filteredLocked.map((s) => <LockedSection key={s.roleKey} section={s} />)}
                        </div>
                    </div>
                )}
            </div>
        </UiKit>
    );
}
