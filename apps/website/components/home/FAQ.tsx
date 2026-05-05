"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

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

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <section className="py-24 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        FAQ
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
                        Frequently asked questions
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        Clear answers about setup, security, pricing, and day-to-day use.
                    </p>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {faqs.map((faq, i) => (
                        <div key={i} className="py-5">
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                className="w-full flex items-center justify-between text-left gap-4 cursor-pointer"
                            >
                                <span className="text-base font-medium text-slate-900 dark:text-slate-100">
                                    {faq.question}
                                </span>
                                <ChevronDown
                                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180" : ""
                                        }`}
                                />
                            </button>
                            {open === i && (
                                <p className="mt-3 text-slate-500 dark:text-slate-400 leading-relaxed text-sm pr-8">
                                    {faq.answer}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

