'use client';

import { useState } from 'react';

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

// ─── Auth badge colours by method ──────────────────────────────────────────

const AUTH_BADGE: Record<string, string> = {
    oauth2: 'bg-blue-900/60 text-blue-300',
    api_key: 'bg-violet-900/60 text-violet-300',
    bearer_token: 'bg-indigo-900/60 text-indigo-300',
    basic: 'bg-zinc-700 text-zinc-300',
    generic_rest: 'bg-teal-900/60 text-teal-300',
};

const AUTH_LABEL: Record<string, string> = {
    oauth2: 'OAuth 2.0',
    api_key: 'API Key',
    bearer_token: 'Bearer',
    basic: 'Basic Auth',
    generic_rest: 'Custom',
};

// ─── Group icon ─────────────────────────────────────────────────────────────

const GROUP_ICON: Record<string, string> = {
    engineering: '⚙️',
    business: '📊',
    content: '✍️',
    marketing: '📢',
    people: '👥',
    support: '🎧',
};

// ─── Connector card ─────────────────────────────────────────────────────────

function ConnectorCard({ connector, onConfigure }: { connector: ConnectorEntry; onConfigure: () => void }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-800 p-4 hover:border-zinc-500 transition-colors">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{connector.displayName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AUTH_BADGE[connector.authMethod] ?? 'bg-zinc-700 text-zinc-300'}`}>
                    {AUTH_LABEL[connector.authMethod] ?? connector.authMethod}
                </span>
            </div>
            <span className="text-xs text-zinc-500 capitalize">{connector.category.replace(/_/g, ' ')}</span>
            <div className="flex gap-2 mt-auto pt-1">
                {connector.configSchema && connector.configSchema.length > 0 && (
                    <button
                        onClick={onConfigure}
                        className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500 transition-colors"
                    >
                        Configure
                    </button>
                )}
                {connector.docsUrl && (
                    <a
                        href={connector.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-600 transition-colors"
                    >
                        Docs ↗
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
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg mx-4 flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Configure {connector.displayName}</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
                </div>

                {connector.configSchema?.map((field) => (
                    <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                            {field.label}
                            {field.required && <span className="text-red-400">*</span>}
                        </label>
                        {field.type === 'select' ? (
                            <select
                                className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                                value={values[field.key] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            >
                                <option value="">Select…</option>
                                {(field as { options?: { value: string; label: string }[] }).options?.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                                placeholder={field.placeholder}
                                className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                                value={values[field.key] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            />
                        )}
                        {field.hint && <p className="text-xs text-zinc-500">{field.hint}</p>}
                    </div>
                ))}

                <div className="flex gap-3 pt-1">
                    <button
                        onClick={handleSave}
                        disabled={saving || saved}
                        className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-60 transition-colors"
                    >
                        {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Configuration'}
                    </button>
                    <button onClick={onClose} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600 transition-colors">
                        Cancel
                    </button>
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
        <div className="rounded-2xl border border-zinc-700 bg-zinc-800/40 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-800/60 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <span className="text-xl">{GROUP_ICON[section.group] ?? '🤖'}</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{section.displayName}</h3>
                            <span className="rounded-full bg-green-900/60 px-2 py-0.5 text-xs font-medium text-green-400">
                                Active · {section.botCount} {section.botCount === 1 ? 'agent' : 'agents'}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{section.tagline}</p>
                    </div>
                </div>
                <span className="text-zinc-500 text-sm">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="px-5 pb-5 flex flex-col gap-5 border-t border-zinc-700">
                    {/* Feature highlights */}
                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        {section.featureHighlights.map((f) => (
                            <div key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                                <span className="mt-0.5 text-green-400 shrink-0">✓</span>
                                <span>{f}</span>
                            </div>
                        ))}
                    </div>

                    {/* Connectors */}
                    {section.connectors.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                    Available Integrations ({section.connectors.length})
                                </p>
                                {categories.length > 1 && (
                                    <div className="flex gap-1.5 flex-wrap justify-end">
                                        <button
                                            onClick={() => setConnectorFilter('all')}
                                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${connectorFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}
                                        >
                                            All
                                        </button>
                                        {categories.map((cat) => (
                                            <button
                                                key={cat}
                                                onClick={() => setConnectorFilter(cat)}
                                                className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize transition-colors ${connectorFilter === cat ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'}`}
                                            >
                                                {cat.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {visibleConnectors.map((c) => (
                                    <ConnectorCard
                                        key={c.tool}
                                        connector={c}
                                        onConfigure={() => setConfiguring(c)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {configuring && (
                <ConfigureDrawer connector={configuring} onClose={() => setConfiguring(null)} />
            )}
        </div>
    );
}

// ─── Locked section ─────────────────────────────────────────────────────────

function LockedSection({ section }: { section: AgentCapabilitySection }) {
    return (
        <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/50 overflow-hidden opacity-80">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                    <span className="text-xl opacity-50">{GROUP_ICON[section.group] ?? '🤖'}</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-zinc-400">{section.displayName}</h3>
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-500 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                                </svg>
                                Not hired
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{section.tagline}</p>
                    </div>
                </div>
                <a
                    href={`/marketplace/${section.roleKey}`}
                    className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                    Hire agent →
                </a>
            </div>

            {/* Blurred feature preview */}
            <div className="px-5 pb-4 border-t border-zinc-700/40">
                <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 select-none pointer-events-none blur-[2px]">
                    {section.featureHighlights.map((f) => (
                        <div key={f} className="flex items-start gap-2 text-xs text-zinc-500">
                            <span className="mt-0.5 shrink-0">○</span>
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
            <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-zinc-100">
                <div className="p-6 rounded-xl bg-red-900/30 border border-red-700 text-red-300 text-sm max-w-md text-center">
                    {error}
                </div>
            </div>
        );
    }

    if (!capabilities) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-zinc-400 text-sm">
                Loading capabilities…
            </div>
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
        <div className="flex flex-col gap-6 p-6 bg-zinc-900 min-h-screen text-zinc-100">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Agent Capabilities</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        View and configure the integrations available to each agent you have hired.
                    </p>
                </div>
                <div className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">{totalPurchased}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">of {totalAvailable} agents hired</div>
                </div>
            </div>

            {/* Group filter */}
            {allGroups.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setGroupFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${groupFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        All groups
                    </button>
                    {allGroups.map((group) => {
                        const label = sections.find((s) => s.group === group)?.groupLabel ?? group;
                        return (
                            <button
                                key={group}
                                onClick={() => setGroupFilter(group)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${groupFilter === group ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                            >
                                {GROUP_ICON[group]} {label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Purchased sections */}
            {filteredPurchased.length > 0 ? (
                <div className="flex flex-col gap-4">
                    {purchasedGroups
                        .filter((g) => groupFilter === 'all' || g === groupFilter)
                        .map((group) => {
                            const groupSections = filteredPurchased.filter((s) => s.group === group);
                            if (groupSections.length === 0) return null;
                            const groupLabel = groupSections[0]?.groupLabel ?? group;
                            return (
                                <div key={group} className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-zinc-300">
                                            {GROUP_ICON[group]} {groupLabel}
                                        </span>
                                        <div className="flex-1 h-px bg-zinc-700" />
                                    </div>
                                    {groupSections.map((s) => <PurchasedSection key={s.roleKey} section={s} />)}
                                </div>
                            );
                        })}
                </div>
            ) : (
                <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 text-center">
                    <p className="text-zinc-400 text-sm">No agents hired yet.</p>
                    <a href="/marketplace" className="mt-2 inline-block text-blue-400 text-sm hover:underline">
                        Browse available agents →
                    </a>
                </div>
            )}

            {/* Locked sections */}
            {filteredLocked.length > 0 && (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-500">
                            🔒 Available to Hire ({filteredLocked.length})
                        </span>
                        <div className="flex-1 h-px bg-zinc-800" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {filteredLocked.map((s) => <LockedSection key={s.roleKey} section={s} />)}
                    </div>
                </div>
            )}
        </div>
    );
}
