"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const faqs = [
    {
        question: "What is AgentFarm?",
        answer:
            "AgentFarm is a Developer Agent platform for engineering teams. You deploy role-based AI agents that execute real engineering work end-to-end — writing code, opening PRs, running CI, fixing tests, and more — directly inside GitHub, Jira, and Microsoft Teams.",
    },
    {
        question: "How is AgentFarm different from GitHub Copilot?",
        answer:
            "Copilot helps individual developers while they type code. AgentFarm agents execute complete engineering tasks autonomously — they create branches, push commits, open PRs, request CI runs, and transition Jira tickets. The output is reviewable work, not just a suggestion.",
    },
    {
        question: "How does AgentFarm handle risky actions?",
        answer:
            "Every action is classified before execution: LOW-risk actions (like reading code or generating release notes) run automatically. MEDIUM and HIGH-risk actions (like creating PRs, running deploys, or making security changes) pause and request human approval via Teams or email before proceeding.",
    },
    {
        question: "What developer skills are available?",
        answer:
            "The Skill Marketplace ships 21 developer skills including: Create PR, Run CI Checks, Fix Test Failures, Security Fix Suggest, PR Review Prepare, Dependency Upgrade Plan, Release Notes Generate, Explain Code, Refactor Plan, Semantic Search, and Audit Export. New skills are added each release.",
    },
    {
        question: "Is my code safe?",
        answer:
            "Yes. Each customer gets a dedicated, tenant-isolated Azure VM — your code never runs on shared infrastructure. Connector tokens are encrypted at rest, agent access is scoped to approved repositories, and every action is logged with full evidence for compliance review.",
    },
    {
        question: "What connectors are supported?",
        answer:
            "AgentFarm natively integrates with GitHub, Jira, Microsoft Teams, and email. OAuth is used for all connectors with least-privilege scopes. More connectors (Confluence, Linear, Azure DevOps) are planned.",
    },
    {
        question: "How does pricing work?",
        answer:
            "Pricing is skill-based and aligned to Starter+, Pro+, and Enterprise plans. You start with a focused set of developer skills and expand as your team's workload grows. Contact us for pilot and enterprise pricing.",
    },
    {
        question: "What happens if the agent makes a mistake?",
        answer:
            "All outputs — PRs, CI reports, patch suggestions — go through human review before merging. The approval model ensures nothing reaches production without sign-off. A full evidence trail means every action is auditable after the fact.",
    },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <section className="py-24 bg-[var(--surface)] border-t border-[var(--hairline)]" id="faq">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.46, ease }}
                    className="text-center mb-14"
                >
                    <span className="chip chip-accent text-xs mb-4">FAQ</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold text-[var(--ink)] tracking-[-0.03em]">
                        Frequently asked questions
                    </h2>
                    <p className="mt-4 text-[var(--mute)] leading-relaxed">
                        Clear answers about setup, security, pricing, and day-to-day use.
                    </p>
                </motion.div>

                <div className="divide-y divide-[var(--hairline)]">
                    {faqs.map((faq, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ duration: 0.38, delay: i * 0.04, ease }}
                        >
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                className="w-full flex items-center justify-between text-left gap-4 py-5 cursor-pointer group"
                            >
                                <span className="text-[15px] font-medium text-[var(--ink)] group-hover:text-[#f4f4f6] transition-colors">
                                    {faq.question}
                                </span>
                                <motion.div
                                    animate={{ rotate: open === i ? 180 : 0 }}
                                    transition={{ duration: 0.22, ease }}
                                    className="shrink-0"
                                >
                                    <ChevronDown className="w-4.5 h-4.5 text-[var(--ash)]" />
                                </motion.div>
                            </button>
                            <AnimatePresence initial={false}>
                                {open === i && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.28, ease }}
                                        className="overflow-hidden"
                                    >
                                        <p className="pb-5 text-sm text-[var(--mute)] leading-relaxed pr-8">
                                            {faq.answer}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

