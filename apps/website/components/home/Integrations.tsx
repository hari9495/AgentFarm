"use client";

import { motion } from "framer-motion";

// Inline SVG brand icons — no external image needed
const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
);

const SlackIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.27 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.833 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.833 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.833 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.833zm0 1.27a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.833a2.528 2.528 0 0 1 2.522-2.521h6.311zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.833a2.528 2.528 0 0 1-2.522 2.521h-2.521V8.833zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.311zm-2.523 10.122a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.521h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.522h-6.312z" fill="#E01E5A" />
    </svg>
);

const GitLabIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 0 0-.867 0L1.387 9.452.045 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.624-8.444a.924.924 0 0 0 .331-1.023" fill="#FC6D26" />
    </svg>
);

const JiraIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215l2.13.001v2.056A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.214 5.214l2.131.001v2.056a5.215 5.215 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.023-1.005zM23.012 0H11.468a5.215 5.215 0 0 0 5.215 5.215l2.13.001v2.055A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.012 0z" fill="#2684FF" />
    </svg>
);

const LinearIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M0 14.232l9.768 9.768A12 12 0 0 1 0 14.232zM0 9.109l14.891 14.891A12.056 12.056 0 0 1 9.768 24L0 14.232V9.11zM11.977 0L24 12.023V17.1L6.9 0h5.077zM17.1 0L24 6.9V12L12 0h5.1zM6.9 0L24 17.1v5.077A12 12 0 0 1 0 9.768L6.9 0z" />
    </svg>
);

const VSCodeIcon = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" fill="#007ACC" />
    </svg>
);

const integrations = [
    {
        Icon: GitHubIcon,
        iconBg: "bg-slate-900 dark:bg-slate-700",
        iconColor: "text-white",
        name: "GitHub",
        badge: "Native",
        badgeColor: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
        description:
            "Push branches, open PRs, and respond to review comments automatically.",
    },
    {
        Icon: SlackIcon,
        iconBg: "bg-pink-50 dark:bg-pink-900/20",
        iconColor: "text-pink-600",
        name: "Slack",
        badge: "Native",
        badgeColor: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
        description:
            "Assign tasks, get real-time notifications, and chat with your Robots.",
    },
    {
        Icon: GitLabIcon,
        iconBg: "bg-orange-50 dark:bg-orange-900/20",
        iconColor: "text-orange-600",
        name: "GitLab",
        badge: "Beta",
        badgeColor: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
        description:
            "Full GitLab support — self-hosted and cloud, identical to GitHub.",
    },
    {
        Icon: JiraIcon,
        iconBg: "bg-blue-50 dark:bg-blue-900/20",
        iconColor: "text-blue-600",
        name: "Jira",
        badge: "Coming soon",
        badgeColor: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
        description:
            "Robots pick up Jira tickets and auto-close them when the PR merges.",
    },
    {
        Icon: LinearIcon,
        iconBg: "bg-violet-50 dark:bg-violet-900/20",
        iconColor: "text-violet-600",
        name: "Linear",
        badge: "Coming soon",
        badgeColor: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
        description:
            "Sync Linear issues and watch status update as work progresses.",
    },
    {
        Icon: VSCodeIcon,
        iconBg: "bg-sky-50 dark:bg-sky-900/20",
        iconColor: "text-sky-600",
        name: "VS Code",
        badge: "Coming soon",
        badgeColor: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
        description:
            "Assign tasks and monitor Robot status directly from the editor.",
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
                        Works where your team already works
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto"
                    >
                        AgentFarm plugs into your existing developer stack in minutes. No
                        workflow changes required.
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
                    More integrations on the roadmap —{" "}
                    <a
                        href="/changelog"
                        className="text-blue-600 hover:underline font-medium"
                    >
                        see what&apos;s coming
                    </a>
                </p>
            </div>
        </section>
    );
}


