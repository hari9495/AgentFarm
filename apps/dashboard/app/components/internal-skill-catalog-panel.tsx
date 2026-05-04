'use client';

import { useEffect, useMemo, useState } from 'react';

type SkillCard = {
    id: string;
    name: string;
    version: string;
    permissions: string[];
    source: string;
    installed: boolean;
    installedVersion: string | null;
    verified: boolean;
};

type SkillEntitlementRecord = {
    workspace_id: string;
    bot_id: string;
    skill_ids: string[];
    updated_at: string;
};

type InternalSkillCatalogPanelProps = {
    defaultWorkspaceId: string;
    defaultBotId: string;
};

type NewSkillForm = {
    id: string;
    name: string;
    version: string;
    permissionsCsv: string;
};

const initialForm: NewSkillForm = {
    id: '',
    name: '',
    version: '1.0.0',
    permissionsCsv: '',
};

export function InternalSkillCatalogPanel({ defaultWorkspaceId, defaultBotId }: InternalSkillCatalogPanelProps) {
    const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
    const [botId, setBotId] = useState(defaultBotId);
    const [skills, setSkills] = useState<SkillCard[]>([]);
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const [form, setForm] = useState<NewSkillForm>(initialForm);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingEntitlements, setIsSavingEntitlements] = useState(false);
    const [isSavingCatalog, setIsSavingCatalog] = useState(false);
    const [busyDeleteSkillId, setBusyDeleteSkillId] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);

        const [skillsRes, entitlementsRes] = await Promise.all([
            fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/catalog`, { cache: 'no-store' }),
            fetch(`/api/marketplace/entitlements?workspace_id=${encodeURIComponent(workspaceId)}&bot_id=${encodeURIComponent(botId)}`, { cache: 'no-store' }),
        ]);

        const skillsBody = (await skillsRes.json().catch(() => ({}))) as { skills?: SkillCard[]; reason?: string; message?: string };
        const entitlementsBody = (await entitlementsRes.json().catch(() => ({}))) as { entitlement?: SkillEntitlementRecord; message?: string };

        if (!skillsRes.ok) {
            setError(skillsBody.message ?? skillsBody.reason ?? 'Unable to load catalog.');
            setIsLoading(false);
            return;
        }

        if (!entitlementsRes.ok) {
            setError(entitlementsBody.message ?? 'Unable to load entitlements.');
            setIsLoading(false);
            return;
        }

        setSkills(Array.isArray(skillsBody.skills) ? skillsBody.skills : []);
        setSelectedSkillIds(Array.isArray(entitlementsBody.entitlement?.skill_ids) ? entitlementsBody.entitlement?.skill_ids : []);
        setIsLoading(false);
    };

    useEffect(() => {
        void loadData();
    }, [workspaceId, botId]);

    const selectedSkillSet = useMemo(() => new Set(selectedSkillIds), [selectedSkillIds]);

    const toggleEntitlement = (skillId: string) => {
        setSelectedSkillIds((current) => {
            if (current.includes(skillId)) {
                return current.filter((entry) => entry !== skillId);
            }
            return [...current, skillId];
        });
    };

    const saveEntitlements = async () => {
        setIsSavingEntitlements(true);
        setError(null);
        setMessage(null);

        const response = await fetch('/api/marketplace/entitlements', {
            method: 'PUT',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                workspace_id: workspaceId,
                bot_id: botId,
                skill_ids: selectedSkillIds,
            }),
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setError(body.message ?? 'Unable to save entitlements.');
            setIsSavingEntitlements(false);
            return;
        }

        setMessage('Entitlements saved. Customer marketplace now reflects this selection.');
        setIsSavingEntitlements(false);
    };

    const saveCatalogSkill = async () => {
        setIsSavingCatalog(true);
        setError(null);
        setMessage(null);

        const permissions = form.permissionsCsv
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);

        const response = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/catalog`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                id: form.id,
                name: form.name,
                version: form.version,
                permissions,
                source: 'custom_managed',
            }),
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string; reason?: string; status?: string };
        if (!response.ok) {
            setError(body.message ?? body.reason ?? 'Unable to save catalog skill.');
            setIsSavingCatalog(false);
            return;
        }

        setForm(initialForm);
        setMessage(body.status === 'updated' ? 'Catalog skill updated.' : 'Catalog skill created.');
        await loadData();
        setIsSavingCatalog(false);
    };

    const deleteCatalogSkill = async (skillId: string) => {
        setBusyDeleteSkillId(skillId);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/catalog/${encodeURIComponent(skillId)}`, {
            method: 'DELETE',
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string; reason?: string };
        if (!response.ok) {
            setError(body.message ?? body.reason ?? 'Unable to remove catalog skill.');
            setBusyDeleteSkillId(null);
            return;
        }

        setMessage(`Removed ${skillId} from managed catalog.`);
        await loadData();
        setBusyDeleteSkillId(null);
    };

    const canSaveCatalog = form.id.trim().length > 0 && form.name.trim().length > 0 && form.version.trim().length > 0;

    return (
        <section className="card" style={{ display: 'grid', gap: '1rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Internal Skill Catalog and Entitlements</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Add managed skills, choose which skills each customer agent can see, and keep rollout non-technical.
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem' }}>
                <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.82rem' }}>
                    Workspace ID
                    <input
                        value={workspaceId}
                        onChange={(event) => setWorkspaceId(event.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                    />
                </label>
                <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.82rem' }}>
                    Agent Bot ID
                    <input
                        value={botId}
                        onChange={(event) => setBotId(event.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                    />
                </label>
            </div>

            {error && <p className="message-inline">{error}</p>}
            {message && <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>{message}</p>}

            {isLoading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading catalog and entitlements...</p>
            ) : (
                <>
                    <section className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.75rem' }}>
                        <h3 style={{ margin: 0 }}>Entitlement Matrix</h3>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                            Selected skills are visible on the customer marketplace for this workspace and agent.
                        </p>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {skills.map((skill) => (
                                <label key={skill.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.82rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedSkillSet.has(skill.id)}
                                        onChange={() => toggleEntitlement(skill.id)}
                                    />
                                    <span>
                                        <strong>{skill.name}</strong> ({skill.id})
                                    </span>
                                    <span className={`badge ${skill.source === 'builtin' ? 'neutral' : 'low'}`}>{skill.source}</span>
                                </label>
                            ))}
                            {skills.length === 0 && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No catalog skills are available yet.</p>}
                        </div>
                        <div>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={isSavingEntitlements}
                                onClick={() => {
                                    void saveEntitlements();
                                }}
                            >
                                {isSavingEntitlements ? 'Saving...' : 'Save Entitlements'}
                            </button>
                        </div>
                    </section>

                    <section className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.75rem' }}>
                        <h3 style={{ margin: 0 }}>Managed Catalog</h3>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                            Create or update custom managed skills that appear in the marketplace.
                        </p>

                        <div style={{ display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem' }}>
                                Skill ID
                                <input
                                    value={form.id}
                                    onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                                    placeholder="issue-autopilot"
                                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem' }}>
                                Skill Name
                                <input
                                    value={form.name}
                                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                    placeholder="Issue Autopilot"
                                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem' }}>
                                Version
                                <input
                                    value={form.version}
                                    onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                                    placeholder="1.0.0"
                                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                                />
                            </label>
                            <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem' }}>
                                Permissions (comma separated)
                                <input
                                    value={form.permissionsCsv}
                                    onChange={(event) => setForm((current) => ({ ...current, permissionsCsv: event.target.value }))}
                                    placeholder="repo:read, repo:write"
                                    style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.5rem 0.6rem' }}
                                />
                            </label>
                        </div>

                        <div>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={!canSaveCatalog || isSavingCatalog}
                                onClick={() => {
                                    void saveCatalogSkill();
                                }}
                            >
                                {isSavingCatalog ? 'Saving...' : 'Save Managed Skill'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {skills.filter((skill) => skill.source !== 'builtin').map((skill) => {
                                const deleting = busyDeleteSkillId === skill.id;
                                return (
                                    <div key={skill.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
                                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                                            <strong>{skill.name}</strong>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{skill.id} | v{skill.version}</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="danger-action"
                                            disabled={deleting}
                                            onClick={() => {
                                                void deleteCatalogSkill(skill.id);
                                            }}
                                        >
                                            {deleting ? 'Removing...' : 'Remove'}
                                        </button>
                                    </div>
                                );
                            })}
                            {skills.every((skill) => skill.source === 'builtin') && (
                                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No managed skills created yet.</p>
                            )}
                        </div>
                    </section>
                </>
            )}
        </section>
    );
}
