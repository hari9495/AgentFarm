'use client';

import { useEffect, useState } from 'react';

type PollSource = {
    id: string;
    agentId: string | null;
    tracker: 'jira' | 'linear' | 'github' | 'custom';
    baseUrl: string | null;
    assignee: string;
    projectFilter: string | null;
    hasSecret: boolean;
    enabled: boolean;
    intervalSec: number;
    customConfig: unknown;
    lastPolledAt: string | null;
    lastError: string | null;
};

const TRACKERS = ['jira', 'linear', 'github', 'custom'] as const;

const EMPTY_FORM = {
    tracker: 'jira' as PollSource['tracker'],
    agentId: '',
    baseUrl: '',
    assignee: '',
    projectFilter: '',
    secretRef: '',
    intervalSec: 300,
    customConfig: '',
};

export default function TaskSourcesClient() {
    const [sources, setSources] = useState<PollSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await fetch('/api/tracker-poll-sources', { cache: 'no-store' });
            const data = await res.json();
            setSources(Array.isArray(data.sources) ? data.sources : []);
            setError(res.ok ? null : data.message ?? data.error ?? 'Failed to load');
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function create() {
        setSaving(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                tracker: form.tracker,
                assignee: form.assignee.trim(),
                agentId: form.agentId.trim() || undefined,
                baseUrl: form.baseUrl.trim() || undefined,
                projectFilter: form.projectFilter.trim() || undefined,
                secretRef: form.secretRef.trim() || undefined,
                intervalSec: Number(form.intervalSec) || 300,
            };
            if (form.tracker === 'custom' && form.customConfig.trim()) {
                try {
                    payload.customConfig = JSON.parse(form.customConfig);
                } catch {
                    setError('customConfig must be valid JSON');
                    setSaving(false);
                    return;
                }
            }
            const res = await fetch('/api/tracker-poll-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? data.error ?? 'Create failed');
            } else {
                setForm({ ...EMPTY_FORM });
                await load();
            }
        } finally {
            setSaving(false);
        }
    }

    async function toggle(s: PollSource) {
        await fetch(`/api/tracker-poll-sources/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !s.enabled }),
        });
        await load();
    }

    async function remove(s: PollSource) {
        if (!confirm(`Delete ${s.tracker} poll source for "${s.assignee}"?`)) return;
        await fetch(`/api/tracker-poll-sources/${s.id}`, { method: 'DELETE' });
        await load();
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div style={{ fontFamily: 'var(--font-plex-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: 'var(--accent)', lineHeight: 1, marginBottom: 5 }}>Intake</div>
            <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 4px', lineHeight: 1 }}>Task Sources</h1>
            <p className="text-sm text-gray-500 mb-6">
                Let an agent pull tickets assigned to it from a tracker. First-class (Jira, Linear, GitHub) or any
                REST tracker via a custom field-mapping. Off-shift tickets are deferred to the next shift.
            </p>

            {error && <div className="mb-4 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

            {/* Add form */}
            <div className="rounded-lg border border-gray-200 p-4 mb-8">
                <h2 className="font-medium mb-3">Add a source</h2>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                        Tracker
                        <select
                            className="mt-1 w-full border rounded px-2 py-1"
                            value={form.tracker}
                            onChange={(e) => setForm({ ...form, tracker: e.target.value as PollSource['tracker'] })}
                        >
                            {TRACKERS.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-sm">
                        Assignee (who the agent picks tickets for)
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            placeholder="email / username / id"
                            value={form.assignee}
                            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Agent / Bot ID (optional)
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            placeholder="bot_..."
                            value={form.agentId}
                            onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Base URL {form.tracker === 'github' ? '(optional)' : ''}
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            placeholder="https://acme.atlassian.net"
                            value={form.baseUrl}
                            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Project filter {form.tracker === 'github' ? '(owner/repo)' : '(optional)'}
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            placeholder={form.tracker === 'github' ? 'owner/repo' : 'PROJ'}
                            value={form.projectFilter}
                            onChange={(e) => setForm({ ...form, projectFilter: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        API token / secret ref
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            type="password"
                            placeholder="token or env://VAR"
                            value={form.secretRef}
                            onChange={(e) => setForm({ ...form, secretRef: e.target.value })}
                        />
                    </label>
                    <label className="text-sm">
                        Poll interval (seconds)
                        <input
                            className="mt-1 w-full border rounded px-2 py-1"
                            type="number"
                            min={30}
                            value={form.intervalSec}
                            onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })}
                        />
                    </label>
                    {form.tracker === 'custom' && (
                        <label className="text-sm col-span-2">
                            Custom config (JSON: url, auth, idField, titleField, urlField, itemsPath…)
                            <textarea
                                className="mt-1 w-full border rounded px-2 py-1 font-mono text-xs"
                                rows={6}
                                placeholder={'{\n  "url": "/tasks?assignee={{assignee}}",\n  "auth": "bearer",\n  "itemsPath": "data",\n  "idField": "gid",\n  "titleField": "name"\n}'}
                                value={form.customConfig}
                                onChange={(e) => setForm({ ...form, customConfig: e.target.value })}
                            />
                        </label>
                    )}
                </div>
                <button
                    className="mt-4 bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
                    disabled={saving || !form.assignee.trim()}
                    onClick={() => void create()}
                >
                    {saving ? 'Adding…' : 'Add source'}
                </button>
            </div>

            {/* List */}
            <h2 className="font-medium mb-3">Configured sources</h2>
            {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : sources.length === 0 ? (
                <p className="text-sm text-gray-500">No task sources yet.</p>
            ) : (
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-left border-b">
                            <th className="py-2">Tracker</th>
                            <th>Assignee</th>
                            <th>Scope</th>
                            <th>Interval</th>
                            <th>Last polled</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sources.map((s) => (
                            <tr key={s.id} className="border-b">
                                <td className="py-2 font-medium">{s.tracker}</td>
                                <td>{s.assignee}</td>
                                <td className="text-gray-500">{s.projectFilter ?? '—'}</td>
                                <td>{s.intervalSec}s</td>
                                <td className="text-gray-500">
                                    {s.lastPolledAt ? new Date(s.lastPolledAt).toLocaleString() : 'never'}
                                    {s.lastError && <span className="block text-red-600 text-xs">{s.lastError}</span>}
                                </td>
                                <td>
                                    <button
                                        onClick={() => void toggle(s)}
                                        className={`px-2 py-0.5 rounded text-xs ${
                                            s.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                        }`}
                                    >
                                        {s.enabled ? 'enabled' : 'disabled'}
                                    </button>
                                </td>
                                <td className="text-right">
                                    <button onClick={() => void remove(s)} className="text-red-600 text-xs hover:underline">
                                        delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
