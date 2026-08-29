'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Plus, RefreshCw } from 'lucide-react';
import { UiKit, Masthead, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';
import { StatCard } from '@/components/21st/stat-card';

/**
 * The HYBRID reference screen — the pattern to standardize on.
 * Editorial frame (mono eyebrow, Fraunces headings, hairline masthead, sharp
 * buttons) wrapping 21st.dev's polished interior components (animated count-up
 * StatCards), reconciled to the sharp Ink & Petrol skin (they inherit the
 * global 3-4px radius + flat surfaces — the animation & richness stay).
 */
export default function DesignHybridPage() {
    const ledger = [
        { t: '18:04:12', a: 'connector_execute · jira', u: 'maya.r', s: 'ok' as const, l: 'done' },
        { t: '18:03:47', a: 'approval_decision', u: 'system', s: 'warn' as const, l: 'pending' },
        { t: '18:02:09', a: 'task_dispatch · runtime', u: 'ci.bot', s: 'err' as const, l: 'failed' },
        { t: '18:01:55', a: 'memory_write · episodic', u: 'recruiter', s: 'ok' as const, l: 'done' },
        { t: '18:00:30', a: 'connector_execute · slack', u: 'maya.r', s: 'ok' as const, l: 'done' },
    ];

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Masthead
                eyebrow="Operations — Command Center"
                title="Command Center"
                actions={<>
                    <Link href="/design-system" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>Design system ↗</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm"><RefreshCw size={12} /></Button>
                    <Button variant="primary" size="sm"><Plus size={13} /> New task</Button>
                </>}
                stats={<>
                    <Stat n="08" k="On shift" tone="ok" />
                    <Stat n="14" k="Tasks live" tone="accent" />
                    <Stat n="01" k="Attention" tone="err" />
                </>}
            />

            <div style={{ padding: 28, maxWidth: 1080 }}>
                {/* The hybrid banner */}
                <div className="wf-panel" style={{ padding: '12px 16px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Hybrid</span> — editorial frame + 21st.dev animated interior, reconciled to the sharp Ink &amp; Petrol skin.
                    </p>
                    <span style={{ display: 'flex', gap: 8 }}>
                        <Link href="/design-system" className="uk-eyebrow" style={{ textDecoration: 'none' }}>A · editorial</Link>
                        <Link href="/design-21st" className="uk-eyebrow" style={{ textDecoration: 'none' }}>B · 21st</Link>
                    </span>
                </div>

                {/* 21st animated stat cards, in the sharp editorial skin */}
                <Eyebrow style={{ marginBottom: 12 }}>Today — live figures</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 34 }}>
                    <StatCard className="!rounded-[3px] !shadow-none" title="Tasks completed" value={1204} change={12} changeDescription="yesterday" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                    <StatCard className="!rounded-[3px] !shadow-none" title="Approval rate" value={94} change={3} changeDescription="last week" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                    <StatCard className="!rounded-[3px] !shadow-none" title="Latency drop" value={18} change={-8} changeDescription="last week" icon={<ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />} />
                    <StatCard className="!rounded-[3px] !shadow-none" title="Active agents" value={12} change={2} changeDescription="last month" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                </div>

                {/* Editorial ledger for dense operational data */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Display size={20}>Activity ledger</Display>
                    <Eyebrow>{String(ledger.length).padStart(2, '0')} events</Eyebrow>
                </div>
                <table className="uk-ledger">
                    <thead><tr><th>Timestamp</th><th>Action</th><th>Requested by</th><th>Status</th></tr></thead>
                    <tbody>
                        {ledger.map((r) => (
                            <tr key={r.t}>
                                <td className="uk-num">{r.t}</td>
                                <td>{r.a}</td>
                                <td className="uk-num">{r.u}</td>
                                <td><Badge tone={r.s}>{r.l}</Badge></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </UiKit>
    );
}
