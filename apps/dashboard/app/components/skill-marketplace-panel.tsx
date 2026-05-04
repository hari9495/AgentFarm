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

type MarketplaceSkillPanelProps = {
    workspaceId: string;
    botId: string;
};

export function SkillMarketplacePanel({ workspaceId, botId }: MarketplaceSkillPanelProps) {
    const [skills, setSkills] = useState<SkillCard[]>([]);
    const [entitlements, setEntitlements] = useState<SkillEntitlementRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [busySkillId, setBusySkillId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);

        const [skillsRes, entitlementRes] = await Promise.all([
            fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/skills`, { cache: 'no-store' }),
            fetch(`/api/marketplace/entitlements?workspace_id=${encodeURIComponent(workspaceId)}&bot_id=${encodeURIComponent(botId)}`, { cache: 'no-store' }),
        ]);

        const skillsBody = (await skillsRes.json().catch(() => ({}))) as { skills?: SkillCard[]; message?: string; reason?: string };
        const entitlementBody = (await entitlementRes.json().catch(() => ({}))) as { entitlement?: SkillEntitlementRecord; message?: string };

        if (!skillsRes.ok) {
            setError(skillsBody.message ?? skillsBody.reason ?? 'Unable to load marketplace skills.');
            setIsLoading(false);
            return;
        }

        if (!entitlementRes.ok) {
            setError(entitlementBody.message ?? 'Unable to load skill entitlements.');
            setIsLoading(false);
            return;
        }

        setSkills(Array.isArray(skillsBody.skills) ? skillsBody.skills : []);
        setEntitlements(entitlementBody.entitlement ?? {
            workspace_id: workspaceId,
            bot_id: botId,
            skill_ids: [],
            updated_at: new Date(0).toISOString(),
        });
        setIsLoading(false);
    };

    useEffect(() => {
        void loadData();
    }, [workspaceId, botId]);

    const entitledSkills = useMemo(() => {
        const allowed = new Set((entitlements?.skill_ids ?? []).map((entry) => entry.trim()));
        return skills.filter((skill) => allowed.has(skill.id));
    }, [entitlements, skills]);

    const runSkillAction = async (skill: SkillCard, mode: 'install' | 'uninstall') => {
        setBusySkillId(skill.id);
        setError(null);
        setMessage(null);

        const endpoint = mode === 'install' ? 'install' : 'uninstall';
        const payload = {
            skill_id: skill.id,
            workspace_key: `${workspaceId}:${botId}`,
            approved_permissions: mode === 'install' ? skill.permissions : undefined,
        };

        const response = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/${endpoint}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string; reason?: string; status?: string };
        if (!response.ok) {
            setError(body.message ?? body.reason ?? `Unable to ${mode} skill.`);
            setBusySkillId(null);
            return;
        }

        setMessage(mode === 'install'
            ? `${skill.name} installed for this agent.`
            : `${skill.name} uninstalled from this agent.`);
        await loadData();
        setBusySkillId(null);
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Agent Skill Marketplace</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Skills visible here are filtered by what this customer agent has purchased and is entitled to use.
                </p>
            </header>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span className="badge neutral">Workspace {workspaceId}</span>
                <span className="badge neutral">Agent {botId}</span>
                <span className="badge low">Entitled skills {entitledSkills.length}</span>
            </div>

            {error && <p className="message-inline">{error}</p>}
            {message && <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>{message}</p>}

            {isLoading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading skills...</p>
            ) : (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {entitledSkills.map((skill) => {
                        const isBusy = busySkillId === skill.id;
                        const action = skill.installed ? 'uninstall' : 'install';
                        const buttonClass = skill.installed ? 'secondary-action' : 'primary-action';

                        return (
                            <article key={skill.id} className="card" style={{ margin: 0, padding: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                        <h3 style={{ margin: 0 }}>{skill.name}</h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                            {skill.id} | version {skill.version} | source {skill.source}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                                            Permissions: {skill.permissions.length > 0 ? skill.permissions.join(', ') : 'None'}
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <span className={`badge ${skill.installed ? 'low' : 'neutral'}`}>
                                                {skill.installed
                                                    ? `Installed${skill.installedVersion ? ` (${skill.installedVersion})` : ''}`
                                                    : 'Not installed'}
                                            </span>
                                            <span className={`badge ${skill.verified ? 'low' : 'warn'}`}>
                                                {skill.verified ? 'Verified manifest' : 'Unverified manifest'}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={buttonClass}
                                        disabled={isBusy}
                                        onClick={() => {
                                            void runSkillAction(skill, action);
                                        }}
                                    >
                                        {isBusy ? 'Working...' : skill.installed ? 'Uninstall' : 'Install'}
                                    </button>
                                </div>
                            </article>
                        );
                    })}

                    {entitledSkills.length === 0 && (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                            No skills are currently entitled for this customer agent. Ask an internal admin to publish entitlements.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
