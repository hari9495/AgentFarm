"use client";

import { motion } from "motion/react";
import { CheckCircle2, BarChart3, ShieldCheck, Zap, Users, Globe } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

const featureIcons = [Zap, Users, ShieldCheck, Globe, BarChart3, CheckCircle2];

const featureCards = [
    {
        icon: Zap,
        title: "Instant deployment",
        body: "Launch a specialist worker in under 10 minutes. No custom setup scripts, no prompt engineering. Pick a role, connect your tools, deploy.",
    },
    {
        icon: Users,
        title: "13 specialist roles",
        body: "From Backend Developer to Customer Support Executive — every role has a defined scope, toolset, and approval model built in.",
    },
    {
        icon: ShieldCheck,
        title: "Approval gates",
        body: "High-risk actions stop automatically for human review. Workers classify every action by risk level before touching production systems.",
    },
    {
        icon: Globe,
        title: "18 connectors",
        body: "GitHub, Jira, Slack, Salesforce, Linear, and 13 more. OAuth-based, auto-refreshed, and isolated per workspace.",
    },
    {
        icon: BarChart3,
        title: "Full evidence trail",
        body: "Every action, decision, and output is logged with timestamps and context. Searchable audit-ready evidence for ops and compliance.",
    },
    {
        icon: CheckCircle2,
        title: "Azure isolation",
        body: "Each workspace runs in dedicated Azure infrastructure. Role boundaries, network isolation, and RBAC enforced at the platform level.",
    },
];

export default function Features() {
    const { features } = homeMarketingContent;

    return (
        <section className="op-section op-light" aria-label="Platform features">
            <div className="op-wrap">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center mb-14"
                >
                    <p className="op-eyebrow mb-4">{features.eyebrow}</p>
                    <h2
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {features.title}
                    </h2>
                    <p className="mt-3 mx-auto max-w-lg text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {features.titleAccent}
                    </p>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featureCards.map((card, i) => {
                        const Icon = card.icon;
                        return (
                            <motion.div
                                key={card.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-60px" }}
                                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                                className="op-lift rounded-[18px] p-6"
                                style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}
                            >
                                <div
                                    className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-4"
                                    style={{ background: "rgba(0,102,204,0.08)" }}
                                >
                                    <Icon className="w-5 h-5 text-[var(--op-indigo)]" />
                                </div>
                                <h3 className="font-semibold text-[17px] text-[#1d1d1f] mb-2" style={{ letterSpacing: "-0.018em" }}>
                                    {card.title}
                                </h3>
                                <p className="text-[15px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                                    {card.body}
                                </p>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
