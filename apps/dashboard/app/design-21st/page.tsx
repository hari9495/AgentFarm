'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, Search, Plus } from 'lucide-react';
import { StatCard } from '@/components/21st/stat-card';
import PaymentsTable from '@/components/21st/payments-table';
import { Button, Input, Avatar, AvatarFallback } from '@/components/ui';
import { WfThemeToggle } from '../components/editorial';

/**
 * Design variant B — built entirely from 21st.dev components (animated stat
 * cards + payments data table), in a conventional polished-SaaS aesthetic:
 * rounded cards, soft shadows, sans-serif. Scoped to `.d21` so the rounded
 * radius override doesn't leak into the sharp editorial rest of the app.
 */
export default function Design21stPage() {
    return (
        <div
            className="d21"
            style={{
                minHeight: '100vh',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-inter), sans-serif',
                // conventional rounded radii, scoped to this page
                ['--radius-sm' as string]: '0.5rem',
                ['--radius-md' as string]: '0.625rem',
                ['--radius-lg' as string]: '0.75rem',
                ['--radius-xl' as string]: '1rem',
            }}
        >
            {/* Top bar */}
            <header style={{ borderBottom: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-foreground)', fontWeight: 700, fontSize: 15 }}>A</div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>AgentFarm</span>
                    <span style={{ color: 'var(--muted-foreground)', fontSize: 14, marginLeft: 8 }}>/ Overview</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                        <Search className="size-4" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                        <Input placeholder="Search…" style={{ paddingLeft: 32, width: 200, borderRadius: 'var(--radius-lg)' }} />
                    </div>
                    <WfThemeToggle />
                    <Avatar><AvatarFallback>MR</AvatarFallback></Avatar>
                </div>
            </header>

            <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px' }}>
                {/* Comparison banner */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--card)' }}>
                    <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Variant B — 21st.dev</span> · conventional polished-SaaS: rounded cards, soft shadows, animated figures.
                    </p>
                    <Link href="/design-system" style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>← Variant A (editorial)</Link>
                </div>

                {/* Page heading */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div>
                        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Good evening, Maya</h1>
                        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, marginTop: 4 }}>Here&apos;s how your workforce performed today.</p>
                    </div>
                    <Button style={{ borderRadius: 'var(--radius-lg)' }}><Plus className="size-4" /> New task</Button>
                </div>

                {/* Animated stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 32 }}>
                    <StatCard title="Tasks completed today" value={1204} change={12} changeDescription="yesterday" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                    <StatCard title="Approval rate" value={94} change={3} changeDescription="last week" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                    <StatCard title="Avg. decision latency drop" value={18} change={-8} changeDescription="last week" icon={<ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />} />
                    <StatCard title="Active agents" value={12} change={2} changeDescription="last month" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                </div>

                {/* Payments table in a rounded card */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Recent transactions</h2>
                        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>Latest billing events across your workspace.</p>
                    </div>
                    <div style={{ padding: '4px 8px 8px' }}>
                        <PaymentsTable />
                    </div>
                </div>
            </div>
        </div>
    );
}
