"use client";

import { motion, type Variants } from "motion/react";
import {
    Code2, Layout, TestTube2, Target, MessageCircle,
    UserPlus, FileText, TrendingUp, Megaphone, type LucideIcon,
} from "lucide-react";
import { marketplaceBots, colorMap, DEPARTMENTS } from "@/lib/bots";
import ButtonLink from "@/components/shared/ButtonLink";

const FEATURED_SLUGS = [
    "ai-technical-recruiter",
    "ai-backend-developer",
    "ai-full-stack-developer",
    "ai-qa-engineer",
    "ai-business-analyst",
    "ai-technical-writer",
    "ai-sales-rep",
    "ai-marketing-specialist",
    "ai-customer-support-agent",
];

const ICON_MAP: Record<string, LucideIcon> = {
    "ai-technical-recruiter": UserPlus,
    "ai-backend-developer": Code2,
    "ai-full-stack-developer": Layout,
    "ai-qa-engineer": TestTube2,
    "ai-business-analyst": Target,
    "ai-technical-writer": FileText,
    "ai-sales-rep": TrendingUp,
    "ai-marketing-specialist": Megaphone,
    "ai-customer-support-agent": MessageCircle,
};

// Role-specific cover images (abstract/code/tech themes — product-appropriate)
const ROLE_IMAGES: Record<string, string> = {
    "ai-technical-recruiter": "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=80",
    "ai-backend-developer": "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80",
    "ai-full-stack-developer": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
    "ai-qa-engineer": "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=1200&q=80",
    "ai-business-analyst": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
    "ai-technical-writer": "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
    "ai-sales-rep": "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
    "ai-marketing-specialist": "https://images.unsplash.com/photo-1533750516457-a7f992034fec?auto=format&fit=crop&w=1200&q=80",
    "ai-customer-support-agent": "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80",
};

const cardVariants: Variants = {
    hidden: { opacity: 0, y: 28 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.46, ease: [0.22, 1, 0.36, 1] },
    }),
};

export default function RobotTypes() {
    const featured = FEATURED_SLUGS.map((slug) => marketplaceBots.find((b) => b.slug === slug)!).filter(Boolean);
    const activeDepts = DEPARTMENTS.filter((d) => marketplaceBots.some((b) => b.department === d));

    return (
        <section id="teammates" className="bg-[var(--surface)] py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center mb-16">
                    <span className="chip chip-accent">AI Teammate Marketplace</span>
                    <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        Specialists you can assign real engineering work to
                    </h2>
                    <p className="mt-4 text-lg text-[var(--mute)]">
                        {marketplaceBots.length} role-based AI teammates across {activeDepts.length} departments.
                        Clear scope, measurable outcomes, and integration-ready from day one.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {featured.map((bot, i) => {
                        const Icon = ICON_MAP[bot.slug] ?? Code2;
                        const c = colorMap[bot.color];
                        return (
                            <motion.div
                                key={bot.slug}
                                custom={i}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, margin: "-40px" }}
                                variants={cardVariants}
                                whileHover={{ y: -4, transition: { duration: 0.22 } }}
                                className="group bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] overflow-hidden hover:border-[var(--accent-blue)]/40 transition-all duration-200 flex flex-col cursor-pointer"
                            >
                                <div className="relative h-36">
                                    <img
                                        src={ROLE_IMAGES[bot.slug] ?? "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80"}
                                        alt={`${bot.name} AI teammate`}
                                        className="w-full h-full object-cover opacity-80"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/80 via-[#07080a]/20 to-transparent" />
                                    <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--accent-green)] bg-[var(--accent-green)]/10 px-2.5 py-1 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
                                        Ready to deploy
                                    </span>
                                </div>

                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="mb-3 flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl ${c.bg} ${c.icon} flex items-center justify-center shrink-0`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-[var(--ash)] uppercase tracking-wider">{bot.department}</p>
                                            <h3 className="font-semibold text-[var(--ink)] text-sm leading-snug">{bot.name}</h3>
                                        </div>
                                    </div>

                                    <p className="text-xs text-[var(--mute)] leading-relaxed mb-3 flex-1">{bot.description}</p>

                                    {bot.useCases[0] && (
                                        <p className="text-[11px] font-medium text-[var(--body-color)] mb-4">
                                            First deliverable: {bot.useCases[0]}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-1.5 mt-auto">
                                        {bot.skills.slice(0, 3).map((s) => (
                                            <span
                                                key={s}
                                                className="text-xs bg-[var(--surface-el)] text-[var(--mute)] px-2 py-0.5 rounded-md font-medium"
                                            >
                                                {s}
                                            </span>
                                        ))}
                                        <span className="text-xs text-[var(--ash)] ml-auto">{bot.price}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="mt-10 text-center">
                    <ButtonLink href="/marketplace" variant="outline" size="md">
                        View all {marketplaceBots.length} AI teammate roles →
                    </ButtonLink>
                </div>
            </div>
        </section>
    );
}
