'use client';

import { useEffect, useState, useCallback } from 'react';

export type DisclosureConfig = {
    botId: string;
    disclosureStatement: string;
    jurisdictions: string[];
    complianceNote: string;
    updatedAt: string;
};

export type DisclosureAckEvent = {
    id: string;
    summary: string;
    recordedAt: string;
};

type Props = {
    botId: string;
};

export function DisclosureSettingsPanel({ botId }: Props) {
    const [config, setConfig] = useState<DisclosureConfig | null>(null);
    const [draftStatement, setDraftStatement] = useState('');
    const [auditEvents, setAuditEvents] = useState<DisclosureAckEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [cfgRes, auditRes] = await Promise.all([
                fetch(`/api/disclosure/${botId}`, { cache: 'no-store' }),
                fetch(`/api/disclosure/${botId}/audit`, { cache: 'no-store' }),
            ]);
            if (!cfgRes.ok) {
                setLoadError('Failed to load disclosure configuration.');
                setLoading(false);
                return;
            }
            const cfg = (await cfgRes.json()) as DisclosureConfig;
            setConfig(cfg);
            setDraftStatement(cfg.disclosureStatement);
            if (auditRes.ok) {
                const auditData = (await auditRes.json()) as { events: DisclosureAckEvent[] };
                setAuditEvents(auditData.events ?? []);
            }
        } catch {
            setLoadError('Network error loading disclosure settings.');
        } finally {
            setLoading(false);
        }
    }, [botId]);

    useEffect(() => {
        void fetchConfig();
    }, [fetchConfig]);

    async function handleSave() {
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            const res = await fetch(`/api/disclosure/${botId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disclosureStatement: draftStatement }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                setSaveError(data.error ?? 'Failed to save disclosure statement.');
                setSaving(false);
                return;
            }
            const updated = (await res.json()) as DisclosureConfig;
            setConfig((prev) => (prev ? { ...prev, disclosureStatement: updated.disclosureStatement, updatedAt: updated.updatedAt } : prev));
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch {
            setSaveError('Network error saving disclosure statement.');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <div className="text-sm text-gray-500">Loading disclosure settings…</div>;
    }

    if (loadError) {
        return (
            <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {loadError}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Compliance badge */}
            <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-1">AI Disclosure Compliance</h3>
                <p className="text-xs text-blue-700">{config?.complianceNote}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                    {config?.jurisdictions.map((j) => (
                        <span
                            key={j}
                            className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                        >
                            {j}
                        </span>
                    ))}
                </div>
            </div>

            {/* Disclosure statement editor */}
            <div className="space-y-2">
                <label htmlFor="disclosureStatement" className="block text-sm font-medium text-gray-700">
                    Disclosure statement
                </label>
                <p className="text-xs text-gray-500">
                    This statement is appended to every outbound message sent by this agent.
                </p>
                <textarea
                    id="disclosureStatement"
                    rows={3}
                    value={draftStatement}
                    onChange={(e) => setDraftStatement(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {saveError && (
                    <p className="text-xs text-red-600">{saveError}</p>
                )}
                {saveSuccess && (
                    <p className="text-xs text-green-600">Disclosure statement saved.</p>
                )}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving || draftStatement === config?.disclosureStatement}
                        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                        onClick={() => setDraftStatement(config?.disclosureStatement ?? '')}
                        disabled={saving}
                        className="text-sm text-gray-600 hover:text-gray-900"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Preview (email channel)</p>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {`[Your message content here]\n\n---\n${draftStatement}`}
                </div>
            </div>

            {/* Audit trail */}
            <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Recent disclosure acks</h3>
                {auditEvents.length === 0 ? (
                    <p className="text-xs text-gray-500">No acknowledgement events recorded yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
                        {auditEvents.slice(0, 10).map((event) => (
                            <li key={event.id} className="flex items-center justify-between px-3 py-2 text-xs bg-white">
                                <span className="text-gray-600 truncate max-w-[60%]">{event.summary}</span>
                                <span className="text-gray-400 ml-2 whitespace-nowrap">
                                    {new Date(event.recordedAt).toLocaleString()}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
