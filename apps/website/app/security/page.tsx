import type { Metadata } from "next";
import Link from "next/link";
import {
    ArrowRight,
    Bot,
    CheckCircle2,
    Eye,
    FileLock2,
    Globe,
    KeyRound,
    Lock,
    RefreshCw,
    Server,
    Shield,
    ShieldCheck,
    Zap,
} from "lucide-react";

export const metadata: Metadata = {
    title: "Security - AgentFarm",
    description: "How AgentFarm protects your codebase, credentials, and team data. SOC 2 Type II, GDPR, HIPAA, and ISO 27001 compliant.",
};

const certifications = [
    {
        name: "SOC 2 Type II",
        icon: ShieldCheck,
        iconBg: "bg-sky-100 dark:bg-sky-900/40",
        iconColor: "text-sky-600 dark:text-sky-400",
        description: "Audited annually by an independent third party across Security, Availability, and Confidentiality trust criteria.",
    },
    {
        name: "GDPR",
        icon: Globe,
        iconBg: "bg-violet-100 dark:bg-violet-900/40",
        iconColor: "text-violet-600 dark:text-violet-400",
        description: "Full compliance with EU data privacy regulations. Data residency options available. DPA available on request.",
    },
    {
        name: "HIPAA Ready",
        icon: FileLock2,
        iconBg: "bg-rose-100 dark:bg-rose-900/40",
        iconColor: "text-rose-600 dark:text-rose-400",
        description: "BAA available for healthcare customers. PHI handling controls, audit logging, and encryption at rest and in transit.",
    },
    {
        name: "ISO 27001",
        icon: Shield,
        iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        description: "Information security management system certified to ISO/IEC 27001:2022 by an accredited certification body.",
    },
];

const features = [
    {
        icon: Lock,
        iconBg: "bg-sky-100 dark:bg-sky-900/40",
        iconColor: "text-sky-600 dark:text-sky-400",
        title: "Encryption everywhere",
        items: [
            "TLS 1.3 for all data in transit",
            "AES-256 encryption at rest",
            "Encrypted agent credential store with HSM-backed keys",
            "Secret rotation every 90 days",
        ],
    },
    {
        icon: Server,
        iconBg: "bg-violet-100 dark:bg-violet-900/40",
        iconColor: "text-violet-600 dark:text-violet-400",
        title: "Isolated agent runtimes",
        items: [
            "Per-agent ephemeral container isolation",
            "Default-deny network policies between runtimes",
            "Scoped, short-lived credentials per task",
            "Automatic runtime teardown on task completion",
        ],
    },
    {
        icon: Eye,
        iconBg: "bg-amber-100 dark:bg-amber-900/40",
        iconColor: "text-amber-600 dark:text-amber-400",
        title: "Full auditability",
        items: [
            "Immutable, tamper-evident audit log",
            "Every agent action attributed with identity, timestamp, and reason",
            "Log export to S3, Splunk, Datadog, or custom SIEM",
            "90-day default retention, 7-year on Enterprise",
        ],
    },
    {
        icon: KeyRound,
        iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        title: "Identity & access",
        items: [
            "SSO via SAML 2.0 / OIDC (Okta, Azure AD, Google)",
            "MFA enforcement configurable per role",
            "IP allowlist with CIDR-level precision",
            "RBAC with custom role builder",
        ],
    },
    {
        icon: Zap,
        iconBg: "bg-rose-100 dark:bg-rose-900/40",
        iconColor: "text-rose-600 dark:text-rose-400",
        title: "Agent action controls",
        items: [
            "Configurable approval gates by risk level",
            "Emergency kill switch with < 5s propagation",
            "Action scope limits enforced at runtime",
            "Policy-as-code via GitOps integration",
        ],
    },
    {
        icon: RefreshCw,
        iconBg: "bg-slate-100 dark:bg-slate-800",
        iconColor: "text-slate-600 dark:text-slate-400",
        title: "Reliability & availability",
        items: [
            "99.9% uptime SLA on all paid plans",
            "Multi-region failover with < 60s RTO",
            "Automated daily backups with 30-day retention",
            "Incident response team on-call 24/7",
        ],
    },
];

const faqs = [
    {
        q: "Does AgentFarm store our source code?",
        a: "No. Agents access your repositories via scoped OAuth tokens at task time. We do not store or index your codebase. Credentials are held in an encrypted, HSM-backed secret store and scoped to the minimum permissions required.",
    },
    {
        q: "Can I revoke agent access instantly?",
        a: "Yes. The emergency stop control halts all agent activity across all channels within 5 seconds. Individual agent tokens can be revoked from the admin panel at any time.",
    },
    {
        q: "Where is customer data stored?",
        a: "By default, data is stored in US regions. EU data residency is available on Enterprise plans, with data processed exclusively within the EU and never transferred outside.",
    },
    {
        q: "Is a penetration test report available?",
        a: "Yes. We conduct annual third-party penetration tests. The executive summary is available under NDA to Enterprise customers. Customers on our security review track can request the full report.",
    },
    {
        q: "How are agent credentials managed?",
        a: "Each agent receives task-scoped credentials generated at task start and revoked at task end. Long-lived credentials are stored in a dedicated secret management service with HSM-backed encryption and automatic 90-day rotation.",
    },
];

export default function SecurityPage() {
    return (
        <div className="site-shell min-h-screen">

            {/* Hero */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-sky-900/60 text-white">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-semibold mb-6">
                        <Shield className="w-3.5 h-3.5" /> Security & Compliance
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-extrabold mb-6 leading-tight">
                        Built for teams that<br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent"> can't afford to compromise</span>
                    </h1>
                    <p className="text-lg text-white/70 max-w-2xl mx-auto mb-10">
                        AgentFarm is designed from first principles for security. Isolated runtimes, immutable audit logs, configurable approval gates, and enterprise compliance out of the box.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white font-semibold text-sm shadow-lg shadow-sky-500/30 hover:brightness-110 transition-all">
                            Start free trial <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a href="mailto:security@agentfarm.ai" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/20 text-white/80 font-semibold text-sm hover:bg-white/10 transition-all">
                            Contact security team
                        </a>
                    </div>
                </div>
            </div>

            {/* Certifications */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-10">Certifications & Compliance</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {certifications.map((cert) => (
                        <div key={cert.name} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center hover:shadow-md transition-shadow">
                            <div className={`h-12 w-12 rounded-2xl ${cert.iconBg} flex items-center justify-center mx-auto mb-4`}>
                                <cert.icon className={`w-6 h-6 ${cert.iconColor}`} />
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{cert.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{cert.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Security features */}
            <div className="bg-slate-50 dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800 py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Security Architecture</p>
                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 text-center mb-12">Every layer, locked down</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature) => (
                            <div key={feature.title} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                                <div className={`h-10 w-10 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}>
                                    <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">{feature.title}</h3>
                                <ul className="space-y-2">
                                    {feature.items.map((item) => (
                                        <li key={item} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FAQ */}
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">FAQ</p>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 text-center mb-10">Security questions</h2>
                <div className="space-y-4">
                    {faqs.map((faq) => (
                        <div key={faq.q} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{faq.q}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-sky-900/60 py-20 text-center">
                <Bot className="w-10 h-10 mx-auto mb-4 text-sky-400" />
                <h2 className="text-3xl font-extrabold text-white mb-4">Security questions? Talk to our team.</h2>
                <p className="text-white/70 mb-8 max-w-xl mx-auto text-sm">
                    Our security team is available for pre-sales reviews, vendor questionnaires, and custom compliance requirements.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                    <a href="mailto:security@agentfarm.ai" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white font-semibold text-sm shadow-lg hover:brightness-110 transition-all">
                        Contact security team <ArrowRight className="w-4 h-4" />
                    </a>
                    <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/20 text-white/80 font-semibold text-sm hover:bg-white/10 transition-all">
                        Start free trial
                    </Link>
                </div>
            </div>
        </div>
    );
}
