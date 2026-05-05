'use client';

/**
 * SkillSearchPanel
 *
 * Full-text skill search with category/tag filtering, dependency info, and invoke-in-place.
 */

import { useMemo, useState } from 'react';

type SkillMeta = {
    id: string;
    name: string;
    category: 'code-quality' | 'ci-cd' | 'security' | 'planning' | 'documentation' | 'operations' | 'ai';
    tags: string[];
    description: string;
    dependencies?: string[];
};

const SKILL_CATALOG: SkillMeta[] = [
    { id: 'test-coverage-reporter', name: 'Test Coverage Reporter', category: 'code-quality', tags: ['tests', 'coverage'], description: 'Reports test coverage metrics for your codebase.' },
    { id: 'flaky-test-detector', name: 'Flaky Test Detector', category: 'ci-cd', tags: ['tests', 'flaky', 'ci'], description: 'Identifies non-deterministic test failures over time.' },
    { id: 'dependency-audit', name: 'Dependency Audit', category: 'security', tags: ['dependencies', 'security', 'audit'], description: 'Audits package dependencies for known vulnerabilities.' },
    { id: 'pr-reviewer-risk-labels', name: 'PR Risk Labeler', category: 'code-quality', tags: ['pr', 'review', 'risk'], description: 'Labels pull requests by risk level based on diff analysis.' },
    { id: 'ci-failure-explainer', name: 'CI Failure Explainer', category: 'ci-cd', tags: ['ci', 'failure', 'debug'], description: 'Explains CI failures in plain language with remediation hints.' },
    { id: 'code-smell-detector', name: 'Code Smell Detector', category: 'code-quality', tags: ['quality', 'refactor'], description: 'Detects anti-patterns and maintainability issues.' },
    { id: 'release-notes-generator', name: 'Release Notes Generator', category: 'documentation', tags: ['release', 'notes', 'changelog'], description: 'Generates release notes from commit messages and PR titles.' },
    { id: 'security-audit', name: 'Security Audit', category: 'security', tags: ['security', 'audit', 'owasp'], description: 'Performs OWASP-aligned security audit on codebase.', dependencies: ['dependency-audit'] },
    { id: 'on-call-brief', name: 'On-Call Brief', category: 'operations', tags: ['on-call', 'summary', 'ops'], description: 'Generates a briefing doc for on-call engineers.' },
    { id: 'doc-drift-detector', name: 'Doc Drift Detector', category: 'documentation', tags: ['docs', 'drift', 'sync'], description: 'Detects documentation that is out of sync with code changes.' },
    { id: 'sprint-risk-forecaster', name: 'Sprint Risk Forecaster', category: 'planning', tags: ['sprint', 'risk', 'forecast'], description: 'Predicts sprint delivery risk based on velocity and scope.' },
    { id: 'dead-code-detector', name: 'Dead Code Detector', category: 'code-quality', tags: ['refactor', 'cleanup', 'dead-code'], description: 'Identifies unreachable or unused code segments.' },
    { id: 'secrets-scanner', name: 'Secrets Scanner', category: 'security', tags: ['secrets', 'credentials', 'security'], description: 'Scans for leaked secrets, tokens, and credentials in code.' },
    { id: 'refactor-advisor', name: 'Refactor Advisor', category: 'code-quality', tags: ['refactor', 'quality', 'ai'], description: 'Suggests targeted refactor actions with before/after diffs.' },
    { id: 'test-generator', name: 'Test Generator', category: 'code-quality', tags: ['tests', 'ai', 'generation'], description: 'AI-generates unit tests for uncovered code paths.', dependencies: ['test-coverage-reporter'] },
    { id: 'commit-message-linter', name: 'Commit Message Linter', category: 'code-quality', tags: ['commits', 'lint', 'convention'], description: 'Enforces conventional commit message standards.' },
    { id: 'pr-description-generator', name: 'PR Description Generator', category: 'documentation', tags: ['pr', 'docs', 'ai'], description: 'Generates structured PR descriptions from diff content.' },
    { id: 'license-compliance-check', name: 'License Compliance Check', category: 'security', tags: ['license', 'compliance', 'legal'], description: 'Checks dependency licenses against allowed list.' },
    { id: 'docker-image-scanner', name: 'Docker Image Scanner', category: 'security', tags: ['docker', 'security', 'container'], description: 'Scans Docker images for known CVEs.', dependencies: ['dependency-audit'] },
    { id: 'monorepo-dep-graph', name: 'Monorepo Dep Graph', category: 'ai', tags: ['monorepo', 'graph', 'dependencies'], description: 'Builds and visualizes inter-package dependency graph.' },
];

const CATEGORIES = ['all', 'code-quality', 'ci-cd', 'security', 'planning', 'documentation', 'operations', 'ai'] as const;

type Props = {
    workspaceId: string;
    botId: string;
};

export function SkillSearchPanel({ workspaceId, botId }: Props) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string>('all');
    const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
    const [invokeInputs, setInvokeInputs] = useState('{}');
    const [invokeResult, setInvokeResult] = useState<{ ok: boolean; summary: string; duration_ms: number } | null>(null);
    const [invoking, setInvoking] = useState(false);
    const [invokeError, setInvokeError] = useState<string | null>(null);

    const filteredSkills = useMemo(() => {
        const q = query.toLowerCase().trim();
        return SKILL_CATALOG.filter((skill) => {
            const matchesCategory = category === 'all' || skill.category === category;
            if (!matchesCategory) return false;
            if (!q) return true;
            return (
                skill.id.includes(q) ||
                skill.name.toLowerCase().includes(q) ||
                skill.description.toLowerCase().includes(q) ||
                skill.tags.some((t) => t.includes(q))
            );
        });
    }, [query, category]);

    const handleInvoke = async () => {
        if (!selectedSkill) return;
        setInvoking(true);
        setInvokeError(null);
        setInvokeResult(null);

        let parsedInputs: Record<string, unknown> = {};
        try {
            parsedInputs = JSON.parse(invokeInputs) as Record<string, unknown>;
        } catch {
            setInvokeError('Invalid JSON inputs');
            setInvoking(false);
            return;
        }

        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/invoke`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ skill_id: selectedSkill.id, inputs: parsedInputs, workspace_id: workspaceId }),
            });
            const body = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: string; duration_ms?: number; message?: string };
            if (!res.ok) {
                setInvokeError(body.message ?? 'Invocation failed');
            } else {
                setInvokeResult({ ok: body.ok ?? true, summary: body.summary ?? 'Done', duration_ms: body.duration_ms ?? 0 });
            }
        } catch (err) {
            setInvokeError((err as Error).message);
        } finally {
            setInvoking(false);
        }
    };

    return (
        <section style={{ marginTop: '1rem' }}>
            {/* Search + filter bar */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <input
                    type="search"
                    placeholder="Search skills by name, tag, or description…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: '1 1 260px', padding: '0.45rem 0.7rem', borderRadius: 6, border: '1px solid #d4d4d4', fontSize: '0.88rem' }}
                />
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: '0.45rem 0.7rem', borderRadius: 6, border: '1px solid #d4d4d4', fontSize: '0.88rem', background: '#fff' }}
                >
                    {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.replace('-', ' ')}</option>
                    ))}
                </select>
            </div>

            {/* Results count */}
            <p style={{ fontSize: '0.8rem', color: '#78716c', marginBottom: '0.5rem' }}>
                {filteredSkills.length} skill{filteredSkills.length !== 1 ? 's' : ''} found
            </p>

            {/* Skill grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.55rem' }}>
                {filteredSkills.map((skill) => (
                    <button
                        key={skill.id}
                        onClick={() => { setSelectedSkill(skill); setInvokeResult(null); setInvokeError(null); }}
                        style={{
                            textAlign: 'left', padding: '0.75rem', border: '1px solid',
                            borderColor: selectedSkill?.id === skill.id ? '#6366f1' : '#e2e8f0',
                            borderRadius: 8, background: selectedSkill?.id === skill.id ? '#eef2ff' : '#fff',
                            cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                    >
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>{skill.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#57534e', marginBottom: '0.35rem', lineHeight: 1.4 }}>{skill.description}</div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>
                                {skill.category}
                            </span>
                            {skill.dependencies && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>
                                    {skill.dependencies.length} dep{skill.dependencies.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* Invoke panel for selected skill */}
            {selectedSkill && (
                <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid #6366f1', borderRadius: 8, background: '#fafafa' }}>
                    <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{selectedSkill.name}</h3>
                    <p style={{ margin: '0 0 0.6rem', fontSize: '0.83rem', color: '#57534e' }}>{selectedSkill.description}</p>

                    {selectedSkill.dependencies && (
                        <p style={{ fontSize: '0.78rem', color: '#92400e', marginBottom: '0.5rem' }}>
                            Depends on: {selectedSkill.dependencies.join(', ')}
                        </p>
                    )}

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        JSON Inputs
                    </label>
                    <textarea
                        rows={3}
                        value={invokeInputs}
                        onChange={(e) => setInvokeInputs(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem', fontFamily: 'monospace', fontSize: '0.82rem', borderRadius: 6, border: '1px solid #d4d4d4', boxSizing: 'border-box' }}
                    />

                    <button
                        onClick={() => void handleInvoke()}
                        disabled={invoking}
                        style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', background: invoking ? '#c7d2fe' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: invoking ? 'wait' : 'pointer', fontSize: '0.85rem' }}
                    >
                        {invoking ? 'Running…' : 'Run Skill'}
                    </button>

                    {invokeError && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: '0.5rem' }}>{invokeError}</p>}

                    {invokeResult && (
                        <div style={{ marginTop: '0.6rem', padding: '0.6rem', background: invokeResult.ok ? '#f0fdf4' : '#fef2f2', borderRadius: 6, fontSize: '0.83rem' }}>
                            <span style={{ fontWeight: 700, color: invokeResult.ok ? '#15803d' : '#dc2626' }}>{invokeResult.ok ? '✓ Success' : '✗ Failed'}</span>
                            <span style={{ marginLeft: '0.5rem', color: '#57534e' }}>{invokeResult.summary}</span>
                            <span style={{ marginLeft: '0.75rem', color: '#78716c' }}>{invokeResult.duration_ms}ms</span>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
