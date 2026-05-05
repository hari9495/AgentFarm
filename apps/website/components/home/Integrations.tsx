"use client";

import { motion } from "framer-motion";

// Inline SVG brand icons
const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
);

const TeamsIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M18.75 8.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z" fill="#5059C9" />
        <path d="M20.5 9.5h-3.75A1.75 1.75 0 0 0 15 11.25V16.5a5 5 0 0 0 5.5 4.96V11.25A1.75 1.75 0 0 0 20.5 9.5z" fill="#5059C9" />
        <path d="M11 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="#7B83EB" />
        <path d="M14.5 12h-7A1.5 1.5 0 0 0 6 13.5V19a5 5 0 0 0 10 0v-5.5A1.5 1.5 0 0 0 14.5 12z" fill="#7B83EB" />
    </svg>
);

const JiraIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215l2.13.001v2.056A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.214 5.214l2.131.001v2.056a5.215 5.215 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.023-1.005zM23.012 0H11.468a5.215 5.215 0 0 0 5.215 5.215l2.13.001v2.055A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.012 0z" fill="#2684FF" />
    </svg>
);

const EmailIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 7l10 7 10-7" />
    </svg>
);

const AzureIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M13.05 4.24L7.28 17.67l4.4.01 1.03-2.58h4.04l2.03 5.01H22L13.05 4.24zM8.55 19.75H2l5.47-3.72 1.08-2.6-2.8 6.32z" fill="#0078D4" />
    </svg>
);

const SkillsIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
);

const integrations = [
    {
        Icon: GitHubIcon,
        iconBg: "bg-slate-900 dark:bg-slate-700",
        iconColor: "text-white",
        name: "GitHub",
        badge: "Live",
        badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        description:
            "Push branches, open PRs, respond to review comments, run CI checks, and auto-assign reviewers — all executed by the agent.",
    },
    {
        Icon: JiraIcon,
        iconBg: "bg-blue-50 dark:bg-blue-900/20",
        iconColor: "text-blue-600",
        name: "Jira",
        badge: "Live",
        badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        description:
            "Agent picks up Jira tickets, executes the work, and transitions issue status as PRs progress through your workflow.",
    },
    {
        Icon: TeamsIcon,
        iconBg: "bg-indigo-50 dark:bg-indigo-900/20",
        iconColor: "text-indigo-600",
        name: "Microsoft Teams",
        badge: "Live",
        badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        description:
            "Receive approval requests, get task updates, and invoke developer skills directly from Teams channels and chats.",
    },
    {
        Icon: EmailIcon,
        iconBg: "bg-sky-50 dark:bg-sky-900/20",
        iconColor: "text-sky-600",
        name: "Email / Outlook",
        badge: "Live",
        badgeColor: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        description:
            "Approval requests and action summaries delivered to approvers via email with one-click approve or reject links.",
    },
    {
        Icon: AzureIcon,
        iconBg: "bg-blue-50 dark:bg-blue-900/20",
        iconColor: "text-blue-600",
        name: "Azure Isolated Runtime",
        badge: "Infrastructure",
        badgeColor: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
        description:
            "Each tenant gets a dedicated Azure VM — your code and credentials never share infrastructure with other customers.",
    },
    {
        Icon: SkillsIcon,
        iconBg: "bg-slate-100 dark:bg-slate-700",
        iconColor: "text-slate-600",
        name: "More connectors",
        badge: "Roadmap",
        badgeColor: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
        description:
            "Confluence, Slack, Linear, Azure DevOps, and GitLab connectors are planned for the Scale phase.",
    },
];

export default function Integrations() {
    return (
        <section className="py-24 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-14">
                    <motion.span
                        initial={{ opacity: 0, y: -8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-xs font-semibold uppercase tracking-wider text-blue-600"
                    >
                        Integrations
                    </motion.span>
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.05 }}
                        className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100"
                    >
                        Works where your engineering team already works
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto"
                    >
                        AgentFarm connects to your existing developer stack via OAuth with least-privilege scopes.
                        No workflow changes required — the agent comes to your tools.
                    </motion.p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {integrations.map(({ Icon, iconBg, name, badge, badgeColor, description }, i) => (
                        <motion.div
                            key={name}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ delay: i * 0.07, duration: 0.4 }}
                            whileHover={{ y: -3, transition: { duration: 0.15 } }}
                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 flex gap-4 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200"
                        >
                            <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                                <Icon />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                        {name}
                                    </span>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
                                        {badge}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p className="text-center text-sm text-slate-400 mt-8">
                    Connectors use OAuth with least-privilege scopes and never store credentials in plaintext —{" "}
                    <a href="/security" className="text-blue-600 hover:underline font-medium">
                        read our security model
                    </a>
                </p>
            </div>
        </section>
    );
}


