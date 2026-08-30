"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
    Bot, ClipboardCheck, HeartPulse, DollarSign,
    TrendingUp, AlertTriangle, CheckCircle2, Zap,
    ArrowRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MissionHeroStat = {
    label: string;
    value: string | number;
    sub?: string;
    tone?: "cyan" | "mint" | "violet" | "rose";
};

type HealthLevel = "healthy" | "degraded" | "critical";

function getHealthLevel(pct: number): HealthLevel {
    if (pct >= 80) return "healthy";
    if (pct >= 50) return "degraded";
    return "critical";
}

const HEALTH_CONFIG = {
    healthy:  { label: "All systems healthy",  color: "#1a7a4a", bg: "rgba(26,122,74,0.08)",  border: "rgba(26,122,74,0.2)",  Icon: CheckCircle2 },
    degraded: { label: "Performance degraded", color: "#b45309", bg: "rgba(180,83,9,0.08)",   border: "rgba(180,83,9,0.2)",   Icon: AlertTriangle },
    critical: { label: "Attention required",   color: "#c4161c", bg: "rgba(196,22,28,0.08)",  border: "rgba(196,22,28,0.2)",  Icon: AlertTriangle },
};

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
    icon: Icon,
    label,
    value,
    sub,
    accent,
    href,
    urgent,
    delay,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    sub?: string;
    accent: string;
    href?: string;
    urgent?: boolean;
    delay: number;
}) {
    const inner = (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
            style={{
                background: "#ffffff",
                border: `1px solid ${urgent ? accent + "55" : "#d2d2d7"}`,
                borderRadius: 16,
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                cursor: href ? "pointer" : "default",
                transition: "box-shadow 0.2s ease, transform 0.2s ease",
                boxShadow: urgent ? `0 0 0 3px ${accent}18` : "0 1px 3px rgba(0,0,0,0.06)",
                position: "relative",
                overflow: "hidden",
            }}
            whileHover={href ? { y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.1)" } : {}}
        >
            {/* Subtle top accent stripe */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "16px 16px 0 0" }} />

            {/* Icon + label */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={14} color={accent} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {label}
                    </span>
                </div>
                {href && <ArrowRight size={13} color="var(--ink-muted)" />}
            </div>

            {/* Value */}
            <div>
                <div style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", color: urgent ? accent : "#1d1d1f", lineHeight: 1 }}>
                    {value}
                </div>
                {sub && (
                    <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 4 }}>{sub}</div>
                )}
            </div>
        </motion.div>
    );

    return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MissionHero({
    tenantName,
    planName,
    pendingApprovals,
    activeBots,
    estimatedCost,
    systemHealthPct,
}: {
    tenantName: string;
    planName: string;
    pendingApprovals: number;
    activeBots: number;
    estimatedCost: number;
    systemHealthPct: number;
}) {
    const healthLevel = getHealthLevel(systemHealthPct);
    const health = HEALTH_CONFIG[healthLevel];
    const HealthIcon = health.Icon;

    return (
        <div style={{ marginBottom: "1.25rem" }}>

            {/* ── Status bar ──────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "14px 20px",
                    background: "#ffffff",
                    border: "1px solid #d2d2d7",
                    borderRadius: 18,
                    marginBottom: 12,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
            >
                {/* Left: workspace identity */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(37, 99, 235,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Zap size={18} color="var(--accent)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                            {tenantName || "Your workspace"}
                        </div>
                        <div style={{ fontSize: 12, color: "#6e6e73", marginTop: 2 }}>
                            Plan: <span style={{ fontWeight: 600, color: "#424245" }}>{planName || "—"}</span>
                        </div>
                    </div>
                </div>

                {/* Right: health status + quick links */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* Health pill */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 9999,
                        background: health.bg, border: `1px solid ${health.border}`,
                    }}>
                        <HealthIcon size={13} color={health.color} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: health.color }}>{health.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: health.color }}>{systemHealthPct}%</span>
                    </div>

                    {/* Quick action: pending approvals */}
                    {pendingApprovals > 0 && (
                        <Link href="/?tab=approvals" style={{ textDecoration: "none" }}>
                            <div style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", borderRadius: 9999,
                                background: "rgba(196,22,28,0.08)", border: "1px solid rgba(196,22,28,0.25)",
                                cursor: "pointer",
                            }}>
                                <AlertTriangle size={13} color="var(--danger)" />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#c4161c" }}>
                                    {pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}
                                </span>
                            </div>
                        </Link>
                    )}

                    {/* Quick links */}
                    <Link href="/agents" style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9999, border: "1px solid #d2d2d7", background: "#fff", cursor: "pointer" }}>
                            <Bot size={12} color="#6e6e73" />
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#424245" }}>Agents</span>
                        </div>
                    </Link>
                    <Link href="/tasks" style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9999, border: "1px solid #d2d2d7", background: "#fff", cursor: "pointer" }}>
                            <TrendingUp size={12} color="#6e6e73" />
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#424245" }}>Tasks</span>
                        </div>
                    </Link>
                </div>
            </motion.div>

            {/* ── KPI cards ────────────────────────────────────────────────── */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
            }}>
                <KpiCard
                    icon={Bot}
                    label="Active Agents"
                    value={activeBots}
                    sub={activeBots === 0 ? "No agents running" : `${activeBots} agent${activeBots !== 1 ? "s" : ""} online`}
                    accent="#2563EB"
                    href="/agents"
                    delay={0.05}
                />
                <KpiCard
                    icon={ClipboardCheck}
                    label="Pending Approvals"
                    value={pendingApprovals}
                    sub={pendingApprovals === 0 ? "Nothing awaiting review" : "Awaiting your decision"}
                    accent={pendingApprovals > 0 ? "#c4161c" : "#1a7a4a"}
                    href="/?tab=approvals"
                    urgent={pendingApprovals > 0}
                    delay={0.1}
                />
                <KpiCard
                    icon={HeartPulse}
                    label="System Health"
                    value={`${systemHealthPct}%`}
                    sub={health.label}
                    accent={health.color}
                    delay={0.15}
                />
                <KpiCard
                    icon={DollarSign}
                    label="Est. Monthly Cost"
                    value={`$${estimatedCost.toFixed(1)}`}
                    sub="Current billing period"
                    accent="#6e6e73"
                    href="/?tab=observability"
                    delay={0.2}
                />
            </div>
        </div>
    );
}
