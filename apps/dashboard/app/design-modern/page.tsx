'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Activity, Zap, Cpu, Circle } from 'lucide-react';
import { AnimatedRadialChart } from '@/components/21st/animated-radial-chart';
import { AnimatedCard, CardBody, CardVisual, CardTitle, CardDescription, Visual3 } from '@/components/21st/animated-card-chart';
import { StatCard } from '@/components/21st/stat-card';

const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(16px)',
    borderRadius: 18,
};

const EASE = [0.22, 1, 0.36, 1] as const;
const fade = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: EASE } }),
};

function Panel({ i, children, style }: { i: number; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <motion.div custom={i} variants={fade} initial="hidden" animate="show" style={{ ...glass, ...style }}>
            {children}
        </motion.div>
    );
}

export default function DesignModernPage() {
    return (
        <div style={{ minHeight: '100vh', background: '#080A0C', color: '#E8EDEC', fontFamily: 'var(--font-inter), sans-serif', position: 'relative', overflow: 'hidden' }}>
            {/* Animated aurora glow */}
            <style>{`
                @keyframes drift1 { 0%,100%{ transform: translate(-10%,-10%) scale(1);} 50%{ transform: translate(10%,5%) scale(1.25);} }
                @keyframes drift2 { 0%,100%{ transform: translate(15%,-5%) scale(1.1);} 50%{ transform: translate(-8%,12%) scale(0.9);} }
                @keyframes pulse { 0%,100%{ opacity:1;} 50%{ opacity:0.35;} }
                .aurora { position:absolute; border-radius:9999px; filter: blur(90px); pointer-events:none; }
                @media (prefers-reduced-motion: reduce) { .aurora { animation: none !important; } }
            `}</style>
            <div className="aurora" style={{ width: 620, height: 620, top: -180, left: -120, background: 'radial-gradient(circle, rgba(96, 165, 250,0.42), transparent 62%)', animation: 'drift1 18s ease-in-out infinite' }} />
            <div className="aurora" style={{ width: 560, height: 560, top: -140, right: -160, background: 'radial-gradient(circle, rgba(94,230,208,0.24), transparent 62%)', animation: 'drift2 22s ease-in-out infinite' }} />
            <div className="aurora" style={{ width: 520, height: 520, bottom: -220, left: '40%', background: 'radial-gradient(circle, rgba(37, 99, 235,0.30), transparent 62%)', animation: 'drift1 26s ease-in-out infinite' }} />

            <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '40px 28px 64px' }}>
                {/* Header */}
                <motion.header custom={0} variants={fade} initial="hidden" animate="show" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 36 }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 11px', borderRadius: 9999, background: 'rgba(94,230,208,0.12)', border: '1px solid rgba(94,230,208,0.25)', fontSize: 11, fontWeight: 600, color: '#5EE6D0', marginBottom: 14 }}>
                            <Circle size={7} fill="#5EE6D0" stroke="none" style={{ animation: 'pulse 1.6s ease-in-out infinite' }} /> LIVE OPERATIONS
                        </div>
                        <h1 style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1, background: 'linear-gradient(120deg, #ffffff, #5EE6D0 55%, #2563EB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                            Command Center
                        </h1>
                        <p style={{ color: '#8A9998', fontSize: 14, marginTop: 8 }}>Your digital workforce, in real time.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 22 }}>
                        {[{ n: '08', k: 'On shift', c: '#5EE6D0' }, { n: '14', k: 'Tasks live', c: '#2563EB' }, { n: '99.2%', k: 'Uptime', c: '#8A9998' }].map((s) => (
                            <div key={s.k} style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: s.c }}>{s.n}</div>
                                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#677675' }}>{s.k}</div>
                            </div>
                        ))}
                    </div>
                </motion.header>

                {/* Bento grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
                    {/* Radial gauge — hero */}
                    <Panel i={1} style={{ gridColumn: 'span 4', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Activity size={15} color="#5EE6D0" /><span style={{ fontSize: 13, fontWeight: 600 }}>System health</span>
                        </div>
                        <AnimatedRadialChart value={92} size={230} duration={2.2} />
                        <p style={{ fontSize: 12.5, color: '#8A9998', marginTop: 4, textAlign: 'center' }}>All subsystems nominal · 3 workspaces</p>
                    </Panel>

                    {/* Animated chart card */}
                    <Panel i={2} style={{ gridColumn: 'span 4', padding: 0, overflow: 'hidden' }}>
                        <AnimatedCard className="!border-0 !bg-transparent !rounded-[18px]">
                            <CardVisual><Visual3 mainColor="#2563EB" secondaryColor="#D2A24E" gridColor="#5EE6D015" /></CardVisual>
                            <CardBody className="!border-white/10">
                                <CardTitle className="!text-white">Throughput</CardTitle>
                                <CardDescription>Hover — 1,204 tasks routed in the last 24h.</CardDescription>
                            </CardBody>
                        </AnimatedCard>
                    </Panel>

                    {/* Count-up stat */}
                    <Panel i={3} style={{ gridColumn: 'span 4', padding: 0 }}>
                        <StatCard className="!rounded-[18px] !border-0 !bg-transparent !shadow-none !text-white" title="Approval rate" value={94} change={3} changeDescription="last week" icon={<ArrowUpRight className="h-4 w-4 text-emerald-400" />} />
                    </Panel>

                    {/* Bottom row stats */}
                    <Panel i={4} style={{ gridColumn: 'span 3', padding: 20 }}>
                        <Zap size={16} color="#5EE6D0" />
                        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10 }}>184<span style={{ fontSize: 15, color: '#8A9998' }}>ms</span></div>
                        <div style={{ fontSize: 12, color: '#8A9998', marginTop: 2 }}>Avg. decision latency</div>
                    </Panel>
                    <Panel i={5} style={{ gridColumn: 'span 3', padding: 20 }}>
                        <Cpu size={16} color="#5EE6D0" />
                        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10 }}>12</div>
                        <div style={{ fontSize: 12, color: '#8A9998', marginTop: 2 }}>Agents active now</div>
                    </Panel>
                    <Panel i={6} style={{ gridColumn: 'span 6', padding: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}><span>Top performers today</span><span style={{ color: '#5EE6D0', fontSize: 12 }}>view all</span></div>
                        {[{ n: 'Recruiter', v: 342, c: '#5EE6D0' }, { n: 'Sales agent', v: 289, c: '#2563EB' }, { n: 'Support exec', v: 201, c: '#D2A24E' }].map((r) => (
                            <div key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                <span style={{ fontSize: 13, width: 96, color: '#C7D2D0' }}>{r.n}</span>
                                <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(r.v / 342) * 100}%` }} transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: r.c, borderRadius: 9999 }} />
                                </div>
                                <span style={{ fontSize: 12, color: '#8A9998', width: 34, textAlign: 'right' }}>{r.v}</span>
                            </div>
                        ))}
                    </Panel>
                </div>

                <footer style={{ marginTop: 34, display: 'flex', gap: 14, alignItems: 'center', color: '#677675', fontSize: 12 }}>
                    <span>Modern / animated variant · 21st.dev components + motion</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
                        <Link href="/design-hybrid" style={{ color: '#8A9998' }}>Hybrid</Link>
                        <Link href="/command-center-preview" style={{ color: '#8A9998' }}>Command center</Link>
                    </span>
                </footer>
            </div>
        </div>
    );
}
