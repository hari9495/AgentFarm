"use client";

import { motion, type Variants } from "framer-motion";
import {
    Code2, Layout, TestTube2, Target, MessageCircle,
    UserPlus, FileText, TrendingUp, Megaphone, type LucideIcon,
} from "lucide-react";
import { marketplaceBots, colorMap, DEPARTMENTS } from "@/lib/bots";
import ButtonLink from "@/components/shared/ButtonLink";
import { useCompactMotion } from "@/lib/useCompactMotion";

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
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.78 : 1;
    const hoverLift = compactMotion ? -2 : -4;
    const featured = FEATURED_SLUGS.map((slug) => marketplaceBots.find((b) => b.slug === slug)!).filter(Boolean);
    const activeDepts = DEPARTMENTS.filter((d) => marketplaceBots.some((b) => b.department === d));

    return (
        <section id="robots" className="bg-slate-50 dark:bg-slate-900 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto text-center mb-16">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Robot Marketplace
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                        Specialists You Can Assign Real Work To
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        {marketplaceBots.length} role-based agents across {activeDepts.length} departments. Clear scope, measurable outcomes, and integration-ready from day one.
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
                                variants={{
                                    hidden: cardVariants.hidden,
                                    visible: (index: number) => ({
                                        opacity: 1,
                                        y: 0,
                                        transition: {
                                            delay: index * 0.1 * motionScale,
                                            duration: 0.46 * motionScale,
                                            ease: [0.22, 1, 0.36, 1],
                                        },
                                    }),
                                }}
                                whileHover={{ y: hoverLift, transition: { duration: 0.22 * motionScale } }}
                                className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-700 transition-all duration-200 flex flex-col cursor-pointer"
                            >
                                <div className="relative h-36">
                                    <img
                                        src={ROLE_IMAGES[bot.slug] ?? "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80"}
                                        alt={`${bot.name} role visual`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/15 to-transparent" />
                                    <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50/95 px-2.5 py-1 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Online
                                    </span>
                                </div>

                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="mb-3 flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                                            <Icon className={`w-5 h-5 ${c.icon}`} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{bot.department}</p>
                                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">{bot.name}</h3>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3 flex-1">{bot.description}</p>

                                    {bot.useCases[0] && (
                                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-4">
                                            First deliverable: {bot.useCases[0]}
                                        </p>
                                    )}

                                    <div className="flex flex-wrap gap-1.5 mt-auto">
                                        {bot.skills.slice(0, 3).map((s) => (
                                            <span
                                                key={s}
                                                className="text-xs bg-slate-100 dark:bg-slate-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium transition-colors duration-150"
                                            >
                                                {s}
                                            </span>
                                        ))}
                                        <span className="text-xs text-slate-400 ml-auto">{bot.price}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="mt-10 text-center">
                    <ButtonLink href="/marketplace" variant="outline" size="md">
                        View all {marketplaceBots.length} roles {"->"}
                    </ButtonLink>
                </div>
            </div>
        </section>
    );
}


