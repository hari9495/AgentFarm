'use client';

/**
 * SkillInvokePanel
 *
 * Inline skill invocation UI for the dashboard. Provides:
 *  - Skill ID selector (populated from the 36-skill catalog)
 *  - JSON inputs textarea with basic validation
 *  - Submit button with loading state
 *  - Structured output display: ok badge, summary, result JSON, duration_ms, risk_level
 */

import { useState } from 'react';

type SkillOutput = {
    ok: boolean;
    skill_id: string;
    summary: string;
    result?: Record<string, unknown>;
    error?: string;
    duration_ms: number;
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
};

const SKILL_IDS = [
    'issue-autopilot', 'test-coverage-reporter', 'flaky-test-detector', 'dependency-audit',
    'pr-reviewer-risk-labels', 'stale-pr-detector', 'commit-message-quality', 'branch-manager',
    'code-smell-detector', 'ci-failure-explainer', 'release-notes-generator', 'ticket-groomer',
    'on-call-brief', 'doc-drift-detector', 'daily-standup-summarizer', 'slack-digest-composer',
    'team-health-scorer', 'wip-blocker-detector', 'sprint-risk-forecaster', 'pr-description-generator',
    'sla-breach-predictor', 'stale-pr-detector', 'test-name-reviewer', 'migration-risk-scorer',
    'changelog-diff-validator', 'env-var-auditor', 'openapi-spec-linter', 'monorepo-dep-graph',
    'dead-code-detector', 'code-churn-analyzer', 'pr-size-enforcer', 'commit-message-linter',
    'accessibility-checker', 'type-coverage-reporter', 'license-compliance-check', 'docker-image-scanner',
];

type SkillInvokePanelProps = {
    workspaceId: string;
    botId: string;
};

export function SkillInvokePanel({ workspaceId, botId }: SkillInvokePanelProps) {
    const [selectedSkill, setSelectedSkill] = useState<string>(SKILL_IDS[0]);
    const [rawInputs, setRawInputs] = useState<string>('{}');
    const [inputError, setInputError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [lastResult, setLastResult] = useState<SkillOutput | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const validateJson = (raw: string): Record<string, unknown> | null => {
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return null;
            }
            return parsed as Record<string, unknown>;
        } catch {
            return null;
        }
    };

    const handleInputChange = (value: string) => {
        setRawInputs(value);
        if (validateJson(value) === null && value.trim().length > 0) {
            setInputError('Invalid JSON object');
        } else {
            setInputError(null);
        }
    };

    const handleSubmit = async () => {
        const inputs = validateJson(rawInputs);
        if (inputs === null) {
            setInputError('Inputs must be a valid JSON object');
            return;
        }
        setInputError(null);
        setFetchError(null);
        setIsRunning(true);
        setLastResult(null);

        try {
            const response = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/invoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill_id: selectedSkill,
                    workspace_id: workspaceId,
                    bot_id: botId,
                    inputs,
                }),
            });
            const body = await response.json() as SkillOutput & { message?: string };
            if (!response.ok) {
                setFetchError(body.message ?? `HTTP ${response.status}`);
            } else {
                setLastResult(body);
            }
        } catch (err) {
            setFetchError(err instanceof Error ? err.message : 'Unexpected error');
        } finally {
            setIsRunning(false);
        }
    };

    const riskColor: Record<string, string> = {
        LOW: '#22c55e',
        MEDIUM: '#f59e0b',
        HIGH: '#ef4444',
    };

    return (
        <section style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--card-bg, #1a1a2e)', borderRadius: '10px', border: '1px solid var(--border-color, #333)' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>Invoke a Skill</h2>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
                {/* Skill selector */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                    <span>Skill</span>
                    <select
                        value={selectedSkill}
                        onChange={(e) => setSelectedSkill(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--border-color, #444)', background: 'var(--input-bg, #0f0f1a)', color: 'inherit', fontSize: '0.875rem' }}
                    >
                        {SKILL_IDS.map((id) => (
                            <option key={id} value={id}>{id}</option>
                        ))}
                    </select>
                </label>

                {/* JSON inputs */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                    <span>Inputs (JSON)</span>
                    <textarea
                        rows={5}
                        value={rawInputs}
                        onChange={(e) => handleInputChange(e.target.value)}
                        style={{ padding: '0.45rem 0.6rem', borderRadius: 6, border: `1px solid ${inputError ? '#ef4444' : 'var(--border-color, #444)'}`, background: 'var(--input-bg, #0f0f1a)', color: 'inherit', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical' }}
                        placeholder='{"repo": "org/repo", "pr_number": 42}'
                    />
                    {inputError && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{inputError}</span>}
                </label>

                {/* Submit */}
                <button
                    onClick={() => { void handleSubmit(); }}
                    disabled={isRunning || inputError !== null}
                    style={{ padding: '0.55rem 1.2rem', borderRadius: 6, background: isRunning ? '#555' : '#4f46e5', color: '#fff', border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}
                >
                    {isRunning ? 'Running…' : 'Run Skill'}
                </button>
            </div>

            {/* Error state */}
            {fetchError && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: '#2a0a0a', borderRadius: 6, color: '#f87171', fontSize: '0.85rem' }}>
                    {fetchError}
                </div>
            )}

            {/* Result display */}
            {lastResult && (
                <div style={{ marginTop: '1rem', padding: '0.9rem', background: 'var(--result-bg, #12121f)', borderRadius: 8, border: '1px solid var(--border-color, #333)' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: 4, background: lastResult.ok ? '#14532d' : '#450a0a', color: lastResult.ok ? '#86efac' : '#f87171', fontWeight: 700, fontSize: '0.78rem' }}>
                            {lastResult.ok ? '✓ OK' : '✗ FAILED'}
                        </span>
                        {lastResult.risk_level && (
                            <span style={{ padding: '0.2rem 0.55rem', borderRadius: 4, background: '#1a1a2e', color: riskColor[lastResult.risk_level] ?? '#aaa', fontSize: '0.78rem', fontWeight: 600 }}>
                                RISK: {lastResult.risk_level}
                            </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>{lastResult.duration_ms}ms</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#ccc' }}>{lastResult.summary}</p>
                    {lastResult.error && <p style={{ fontSize: '0.82rem', color: '#f87171' }}>{lastResult.error}</p>}
                    {lastResult.result && Object.keys(lastResult.result).length > 0 && (
                        <pre style={{ fontSize: '0.75rem', overflowX: 'auto', background: '#0a0a14', padding: '0.6rem', borderRadius: 6, color: '#a5f3fc', maxHeight: 300 }}>
                            {JSON.stringify(lastResult.result, null, 2)}
                        </pre>
                    )}
                </div>
            )}
        </section>
    );
}
