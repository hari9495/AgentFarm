"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
    {
        question: "What is AgentFarm?",
        answer:
            "AgentFarm is a role-based AI workforce platform. Teams add specialist agents (development, QA, support, and operations) that work inside existing tools like GitHub, Slack, and Jira.",
    },
    {
        question: "How is AgentFarm different from GitHub Copilot?",
        answer:
            "Copilot helps individuals while they type. AgentFarm agents execute assigned tasks end-to-end, create outputs in your workflow, and keep activity visible for team review.",
    },
    {
        question: "What languages and frameworks do Robots support?",
        answer:
            "Agents support mainstream stacks including TypeScript, Python, Java, Go, and common frameworks. The practical coverage depends on the role and the repositories you connect.",
    },
    {
        question: "Is my code safe?",
        answer:
            "Yes. Agent access is scoped to approved integrations and repositories. Actions are logged, reviewable, and can be controlled with approval rules for sensitive operations.",
    },
    {
        question: "How does pricing work?",
        answer:
            "Pricing is role-based and aligned to marketplace plans (Starter+, Pro+, Enterprise). You can start with a focused setup and expand as workload grows.",
    },
    {
        question: "Can I cancel anytime?",
        answer:
            "Yes. You can adjust or cancel your plan at any time based on your team requirements.",
    },
    {
        question: "Do Robots work with private repositories?",
        answer:
            "Yes. You choose exactly which repositories and workspaces are connected, and you can revoke access when needed.",
    },
    {
        question: "What happens if a Robot makes a mistake?",
        answer:
            "Outputs are designed for human review. Teams can reject work, adjust instructions, and rerun tasks with updated context.",
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

