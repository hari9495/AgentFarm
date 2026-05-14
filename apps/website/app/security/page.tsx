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
        iconBg: "bg-[var(--accent-blue)]/10",
        iconColor: "text-[var(--accent-blue)]",
        description: "Audited annually by an independent third party across Security, Availability, and Confidentiality trust criteria.",
    },
    {
        name: "GDPR",
        icon: Globe,
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-400",
        description: "Full compliance with EU data privacy regulations. Data residency options available. DPA available on request.",
    },
    {
        name: "HIPAA Ready",
        icon: FileLock2,
        iconBg: "bg-rose-500/10",
        iconColor: "text-rose-400",
        description: "BAA available for healthcare customers. PHI handling controls, audit logging, and encryption at rest and in transit.",
    },
    {
        name: "ISO 27001",
        icon: Shield,
        iconBg: "bg-[var(--accent-green)]/10",
        iconColor: "text-[var(--accent-green)]",
        description: "Information security management system certified to ISO/IEC 27001:2022 by an accredited certification body.",
    },
];

const features = [
    {
        icon: Lock,
        iconBg: "bg-[var(--accent-blue)]/10",
        iconColor: "text-[var(--accent-blue)]",
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
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-400",
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
        iconBg: "bg-amber-500/10",
        iconColor: "text-amber-400",
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
        iconBg: "bg-[var(--accent-green)]/10",
        iconColor: "text-[var(--accent-green)]",
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
        iconBg: "bg-rose-500/10",
        iconColor: "text-rose-400",
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
        iconBg: "bg-[var(--surface-el)]",
        iconColor: "text-[var(--body-color)]",
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
        <div className="min-h-screen">

            {/* Hero */}
            <div className="bg-[var(--canvas)] text-[var(--ink)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
                    <div className="chip chip-accent mb-6">
                        <Shield className="w-3.5 h-3.5" /> Security & Compliance
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-6 leading-tight">
                        Built for teams that<br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)] bg-clip-text text-transparent"> can't afford to compromise</span>
                    </h1>
                    <p className="text-lg text-[var(--mute)] max-w-2xl mx-auto mb-10">
                        AgentFarm is designed from first principles for security. Isolated runtimes, immutable audit logs, configurable approval gates, and enterprise compliance out of the box.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all">
                            Start free trial <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a href="mailto:security@agentfarm.ai" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[var(--hairline)] text-[var(--body-color)] font-semibold text-sm hover:bg-[var(--surface-el)] transition-all">
                            Contact security team
                        </a>
                    </div>
                </div>
            </div>

            {/* Certifications */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-10">Certifications & Compliance</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {certifications.map((cert) => (
                        <div key={cert.name} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6 text-center hover:shadow-md transition-shadow">
                            <div className={`h-12 w-12 rounded-2xl ${cert.iconBg} flex items-center justify-center mx-auto mb-4`}>
                                <cert.icon className={`w-6 h-6 ${cert.iconColor}`} />
                            </div>
                            <p className="text-sm font-semibold text-[var(--ink)] mb-2">{cert.name}</p>
                            <p className="text-xs text-[var(--mute)] leading-relaxed">{cert.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Security features */}
            <div className="bg-[var(--surface)] border-y border-[var(--hairline)] py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-3">Security Architecture</p>
                    <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] text-center mb-12">Every layer, locked down</h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature) => (
                            <div key={feature.title} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                                <div className={`h-10 w-10 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}>
                                    <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
                                </div>
                                <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">{feature.title}</h3>
                                <ul className="space-y-2">
                                    {feature.items.map((item) => (
                                        <li key={item} className="flex items-start gap-2 text-xs text-[var(--body-color)]">
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
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-3">FAQ</p>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] text-center mb-10">Security questions</h2>
                <div className="space-y-4">
                    {faqs.map((faq) => (
                        <div key={faq.q} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                            <p className="text-sm font-semibold text-[var(--ink)] mb-2">{faq.q}</p>
                            <p className="text-sm text-[var(--body-color)] leading-relaxed">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Compliance checklist */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden">
                    <div className="grid md:grid-cols-2">
                        <div className="p-8">
                            <span className="chip chip-accent mb-4">
                                Compliance checklist
                            </span>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">Before you deploy AI workers</h2>
                            <p className="text-sm text-[var(--mute)] leading-relaxed mb-6">A practical checklist your security and compliance teams can use to evaluate AI agent deployments — covering data residency, access controls, audit logging, and approval governance.</p>
                            <a href="/docs/security-checklist" className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink)] text-[var(--canvas)] px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
                                <CheckCircle2 className="w-4 h-4" /> Download checklist (PDF)
                            </a>
                        </div>
                        <div className="bg-[var(--surface-el)] p-8 border-t md:border-t-0 md:border-l border-[var(--hairline)]">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--ash)] mb-5">Checklist covers</p>
                            <ul className="space-y-3">
                                {["Data residency & sovereignty requirements", "Credential and token isolation per tenant", "Approval gate configuration & policy rules", "Immutable audit log export for compliance evidence", "Role-based access control (RBAC) setup", "SOC 2 / ISO 27001 vendor questionnaire answers", "Incident response contacts and SLA commitments", "GDPR data processing agreement (DPA) request"].map((item) => (
                                    <li key={item} className="flex items-start gap-2 text-xs text-[var(--body-color)]">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div className="bg-[var(--surface)] border-t border-[var(--hairline)] py-20 text-center">
                <Bot className="w-10 h-10 mx-auto mb-4 text-[var(--accent-blue)]" />
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">Security questions? Talk to our team.</h2>
                <p className="text-[var(--mute)] mb-8 max-w-xl mx-auto text-sm">
                    Our security team is available for pre-sales reviews, vendor questionnaires, and custom compliance requirements.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                    <a href="mailto:security@agentfarm.ai" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all">
                        Contact security team <ArrowRight className="w-4 h-4" />
                    </a>
                    <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[var(--hairline)] text-[var(--body-color)] font-semibold text-sm hover:bg-[var(--surface-el)] transition-all">
                        Start free trial
                    </Link>
                </div>
            </div>
        </div>
    );
}
