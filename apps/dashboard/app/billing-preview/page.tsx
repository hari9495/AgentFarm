'use client';

import Link from 'next/link';
import { CreditCard, TrendingUp, Download, AlertTriangle, Check } from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

const money = (n: number) => '$' + n.toLocaleString();

const monthly = { used: 1732, budget: 2400 };
const daily = { used: 84, budget: 95 };
const breakdown = [
    { label: 'Anthropic', amount: 612, tone: 'var(--accent)' },
    { label: 'OpenAI', amount: 431, tone: 'var(--ok)' },
    { label: 'NVIDIA', amount: 298, tone: 'var(--warn)' },
    { label: 'Azure ARM', amount: 221, tone: 'var(--ink-muted)' },
    { label: 'Other', amount: 170, tone: 'var(--ink-muted)' },
];
const invoices = [
    { date: '2026-08-28', id: 'INV-2026-08', amount: 2400, status: 'ok' as const, label: 'paid' },
    { date: '2026-07-28', id: 'INV-2026-07', amount: 2400, status: 'ok' as const, label: 'paid' },
    { date: '2026-06-28', id: 'INV-2026-06', amount: 1850, status: 'ok' as const, label: 'paid' },
    { date: '2026-05-28', id: 'INV-2026-05', amount: 1850, status: 'ok' as const, label: 'paid' },
];

function budgetTone(pct: number) { return pct >= 90 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--ok)'; }

function BudgetBar({ used, budget, label }: { used: number; budget: number; label: string }) {
    const pct = Math.min(100, Math.round((used / budget) * 100));
    const tone = budgetTone(pct);
    const state = pct >= 90 ? 'throttling' : pct >= 80 ? 'warning' : 'healthy';
    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="uk-eyebrow">{label}</span>
                <span className="uk-mono" style={{ fontSize: 12.5, color: 'var(--ink)' }}>{money(used)} <span style={{ color: 'var(--ink-muted)' }}>/ {money(budget)}</span></span>
            </div>
            <div style={{ position: 'relative', height: 8, background: 'var(--bg-deep)', overflow: 'hidden', borderRadius: 2 }}>
                <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: tone, transition: 'width 0.7s ease' }} />
                {/* 80% + 90% threshold markers */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '80%', width: 1, background: 'color-mix(in srgb, var(--warn) 70%, transparent)' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '90%', width: 1, background: 'color-mix(in srgb, var(--danger) 70%, transparent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{pct}% used · warn 80 · throttle 90</span>
                <span className="uk-mono" style={{ fontSize: 10.5, color: tone, textTransform: 'uppercase' }}>{state}</span>
            </div>
        </div>
    );
}

export default function BillingPreview() {
    const maxBreak = Math.max(...breakdown.map((b) => b.amount));
    const monthPct = Math.round((monthly.used / monthly.budget) * 100);

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Billing — Subscription & Usage"
                title="Billing"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm"><Download size={12} /> Invoices</Button>
                    <Button variant="primary" size="sm">Manage plan</Button>
                </>}
                stats={<>
                    <Stat n={money(monthly.used)} k="This month" tone="accent" />
                    <Stat n={`${monthPct}%`} k="Budget used" tone={monthPct >= 80 ? 'warn' : 'ok'} />
                    <Stat n="Sep 28" k="Next invoice" tone="muted" />
                </>}
            />

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20, alignItems: 'start' }}>
                {/* Left column */}
                <div style={{ display: 'grid', gap: 20 }}>
                    <Panel title="Current plan" action={<Badge tone="accent">Enterprise</Badge>}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                            <Display size={30}>{money(2400)}</Display>
                            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>/ month · renews Sep 28</span>
                        </div>
                        <div style={{ display: 'flex', gap: 30 }}>
                            <Stat n="12" k="Active agents" />
                            <Stat n="40" k="Seats" tone="muted" />
                            <Stat n="Max" k="Runtime tier" tone="accent" />
                        </div>
                    </Panel>

                    <Panel title="Budget" action={daily.used / daily.budget >= 0.8 ? <Badge tone="warn"><AlertTriangle size={11} /> Daily near cap</Badge> : <Badge tone="ok">Within limits</Badge>}>
                        <div style={{ display: 'grid', gap: 20 }}>
                            <BudgetBar used={monthly.used} budget={monthly.budget} label="Monthly budget" />
                            <BudgetBar used={daily.used} budget={daily.budget} label="Daily budget" />
                        </div>
                    </Panel>

                    <Panel title="Cost breakdown" action={<span className="uk-eyebrow" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><TrendingUp size={11} /> This month</span>}>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {breakdown.map((b) => (
                                <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 64px', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{b.label}</span>
                                    <div style={{ height: 6, background: 'var(--bg-deep)', overflow: 'hidden', borderRadius: 2 }}>
                                        <div style={{ height: '100%', width: `${(b.amount / maxBreak) * 100}%`, background: b.tone, transition: 'width 0.7s ease' }} />
                                    </div>
                                    <span className="uk-mono" style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'right' }}>{money(b.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>

                {/* Right column */}
                <div style={{ display: 'grid', gap: 20 }}>
                    <Panel title="Payment method">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 42, height: 42, border: '1px solid var(--line)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <CreditCard size={18} color="var(--accent)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="uk-mono" style={{ fontSize: 13, color: 'var(--ink)' }}>Visa •••• 4242</div>
                                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>Expires 08 / 28 · billing@acme.com</div>
                            </div>
                            <Button variant="ghost" size="sm">Update</Button>
                        </div>
                    </Panel>

                    <Panel title="Invoices">
                        <table className="uk-ledger">
                            <thead><tr><th>Date</th><th>Invoice</th><th>Amount</th><th>Status</th></tr></thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td className="uk-num">{inv.date}</td>
                                        <td className="uk-num">{inv.id}</td>
                                        <td className="uk-num" style={{ color: 'var(--ink)' }}>{money(inv.amount)}</td>
                                        <td><Badge tone={inv.status}><Check size={10} /> {inv.label}</Badge></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Panel>

                    <div className="uk-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '2px solid var(--warn)' }}>
                        <AlertTriangle size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Daily spend hit 88% — agents throttle at 90% to protect your budget.</span>
                    </div>
                </div>
            </div>
        </UiKit>
    );
}
