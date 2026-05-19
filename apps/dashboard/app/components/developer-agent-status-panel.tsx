'use client'

import { useEffect, useState } from 'react'

interface DevStatus {
    activeTaskCount: number
    prDraftCount: number
    ciFailureCount: number
    reviewQueueCount: number
}

const FALLBACK: DevStatus = {
    activeTaskCount: 0,
    prDraftCount: 0,
    ciFailureCount: 0,
    reviewQueueCount: 0,
}

interface Props {
    botId?: string
    workspaceId?: string
}

function StatCell({
    icon,
    label,
    value,
    tone,
}: {
    icon: string
    label: string
    value: number
    tone: 'ok' | 'warn' | 'neutral'
}) {
    const toneClass = tone === 'ok' ? 'low' : tone === 'warn' ? 'warn' : 'neutral'
    return (
        <div className="dev-status-cell card">
            <span className="dev-status-cell-icon" aria-hidden="true">{icon}</span>
            <p className="dev-status-cell-value">{value}</p>
            <p className="dev-status-cell-label">{label}</p>
            <span className={`badge ${toneClass}`}>
                {value === 0 ? 'clear' : 'active'}
            </span>
        </div>
    )
}

export function DeveloperAgentStatusPanel({ botId = 'bot_dev_001', workspaceId = 'ws_primary_001' }: Props) {
    const [status, setStatus] = useState<DevStatus>(FALLBACK)
    const [source, setSource] = useState<'live' | 'fallback'>('fallback')

    useEffect(() => {
        let cancelled = false

        async function fetchStatus() {
            try {
                const [tasksRes, prsRes, ciRes] = await Promise.all([
                    fetch(`/api/agents/${encodeURIComponent(botId)}/tasks?status=active&limit=1`),
                    fetch(`/api/agents/${encodeURIComponent(botId)}/pr-drafts?status=pending&limit=1`),
                    fetch(`/api/agents/${encodeURIComponent(botId)}/ci-runs?status=failed&limit=1`),
                ])

                if (cancelled) return

                const tasks = tasksRes.ok
                    ? ((await tasksRes.json().catch(() => null)) as { total?: number } | null)
                    : null
                const prs = prsRes.ok
                    ? ((await prsRes.json().catch(() => null)) as { total?: number; drafts?: unknown[] } | null)
                    : null
                const ci = ciRes.ok
                    ? ((await ciRes.json().catch(() => null)) as { total?: number; runs?: unknown[] } | null)
                    : null

                // derive review queue: PRs awaiting reviewer sign-off
                const prsTotal = typeof prs?.total === 'number'
                    ? prs.total
                    : Array.isArray((prs as { drafts?: unknown[] } | null)?.drafts)
                        ? (prs as { drafts: unknown[] }).drafts.length
                        : 0
                const ciTotal = typeof ci?.total === 'number'
                    ? ci.total
                    : Array.isArray((ci as { runs?: unknown[] } | null)?.runs)
                        ? (ci as { runs: unknown[] }).runs.length
                        : 0

                setStatus({
                    activeTaskCount: tasks?.total ?? 0,
                    prDraftCount: prsTotal,
                    ciFailureCount: ciTotal,
                    reviewQueueCount: prsTotal,   // PRs pending human review
                })
                setSource('live')
            } catch {
                // graceful degradation — keep last known state
                setSource('fallback')
            }
        }

        void fetchStatus()
        const interval = setInterval(() => { void fetchStatus() }, 30_000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [botId, workspaceId])

    return (
        <section aria-label="Developer Agent Live Status" className="dev-status-panel">
            <header className="dev-status-panel-header">
                <p className="eyebrow">Developer Agent</p>
                <span className="dev-agent-panel-header-sep" aria-hidden="true">—</span>
                <p className="dev-agent-panel-subtitle">Live Status</p>
                <span className={`badge ${source === 'live' ? 'low' : 'warn'}`} style={{ marginLeft: 'auto' }}>
                    {source === 'live' ? 'Live' : 'Fallback'}
                </span>
            </header>

            <div className="dev-status-cells">
                <StatCell
                    icon="⚡"
                    label="Active Tasks"
                    value={status.activeTaskCount}
                    tone={status.activeTaskCount > 0 ? 'ok' : 'neutral'}
                />
                <StatCell
                    icon="⎇"
                    label="PR Drafts"
                    value={status.prDraftCount}
                    tone={status.prDraftCount > 0 ? 'ok' : 'neutral'}
                />
                <StatCell
                    icon="⚙"
                    label="CI Failures"
                    value={status.ciFailureCount}
                    tone={status.ciFailureCount > 0 ? 'warn' : 'ok'}
                />
                <StatCell
                    icon="👁"
                    label="Review Queue"
                    value={status.reviewQueueCount}
                    tone={status.reviewQueueCount > 0 ? 'ok' : 'neutral'}
                />
            </div>
        </section>
    )
}
