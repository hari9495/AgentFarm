"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft, ArrowRight, Check, Loader2, Rocket, User, Wrench,
    ShieldCheck, Play, AlertTriangle, CheckCircle2,
} from "lucide-react";

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { displayName: string; description: string; connectors: Array<{ name: string; displayName: string; authType: "oauth" | "api_token" }> }> = {
    developer: {
        displayName: "Developer",
        description: "Reads Jira tickets, writes code, opens PRs, fixes CI failures, and reviews pull requests.",
        connectors: [
            { name: "github", displayName: "GitHub", authType: "oauth" },
            { name: "jira", displayName: "Jira", authType: "oauth" },
            { name: "gitlab", displayName: "GitLab", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "confluence", displayName: "Confluence", authType: "api_token" },
            { name: "linear", displayName: "Linear", authType: "api_token" },
            { name: "azure_devops", displayName: "Azure DevOps", authType: "oauth" },
        ],
    },
    tester: {
        displayName: "Tester",
        description: "Runs automated tests, generates test cases, performs security scans, and manages test results.",
        connectors: [
            { name: "github", displayName: "GitHub", authType: "oauth" },
            { name: "jira", displayName: "Jira", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "testrail", displayName: "TestRail", authType: "api_token" },
            { name: "zephyr", displayName: "Zephyr", authType: "api_token" },
            { name: "postman", displayName: "Postman", authType: "api_token" },
            { name: "playwright", displayName: "Playwright CI", authType: "api_token" },
        ],
    },
    fullstack_developer: {
        displayName: "Fullstack Developer",
        description: "Handles frontend + backend code, PR drafts, design handoff, and full-stack issue management.",
        connectors: [
            { name: "github", displayName: "GitHub", authType: "oauth" },
            { name: "jira", displayName: "Jira", authType: "oauth" },
            { name: "figma", displayName: "Figma", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "gitlab", displayName: "GitLab", authType: "oauth" },
        ],
    },
    sales_rep: {
        displayName: "Sales Rep",
        description: "Prospecting, outreach, lead qualification, proposals, and CRM updates — end-to-end sales.",
        connectors: [
            { name: "salesforce", displayName: "Salesforce", authType: "oauth" },
            { name: "hubspot", displayName: "HubSpot", authType: "oauth" },
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "apollo", displayName: "Apollo", authType: "api_token" },
            { name: "calendly", displayName: "Calendly", authType: "api_token" },
        ],
    },
    corporate_assistant: {
        displayName: "Corporate Assistant",
        description: "Calendar management, email drafting, meeting summaries, and internal coordination.",
        connectors: [
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "google_calendar", displayName: "Google Calendar", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "microsoft_teams", displayName: "Microsoft Teams", authType: "oauth" },
        ],
    },
    recruiter: {
        displayName: "Recruiter",
        description: "Sourcing, screening, scheduling interviews, and coordinating offers end-to-end.",
        connectors: [
            { name: "linkedin", displayName: "LinkedIn", authType: "oauth" },
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "google_calendar", displayName: "Google Calendar", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
        ],
    },
    business_analyst: {
        displayName: "Business Analyst",
        description: "Requirements gathering, documentation, stakeholder communication, and Jira management.",
        connectors: [
            { name: "jira", displayName: "Jira", authType: "oauth" },
            { name: "confluence", displayName: "Confluence", authType: "api_token" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "google_drive", displayName: "Google Drive", authType: "oauth" },
        ],
    },
    technical_writer: {
        displayName: "Technical Writer",
        description: "API docs, release notes, and technical documentation — integrated with GitHub and Confluence.",
        connectors: [
            { name: "github", displayName: "GitHub", authType: "oauth" },
            { name: "confluence", displayName: "Confluence", authType: "api_token" },
            { name: "google_drive", displayName: "Google Drive", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
        ],
    },
    content_writer: {
        displayName: "Content Writer",
        description: "Blog posts, marketing copy, social content, and email campaigns.",
        connectors: [
            { name: "google_drive", displayName: "Google Drive", authType: "oauth" },
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
        ],
    },
    marketing_specialist: {
        displayName: "Marketing Specialist",
        description: "Campaigns, email marketing, content distribution, and CRM updates.",
        connectors: [
            { name: "hubspot", displayName: "HubSpot", authType: "oauth" },
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "google_drive", displayName: "Google Drive", authType: "oauth" },
        ],
    },
    project_manager_product_owner_scrum_master: {
        displayName: "Project Manager",
        description: "Sprint planning, backlog grooming, stakeholder updates, and delivery tracking.",
        connectors: [
            { name: "jira", displayName: "Jira", authType: "oauth" },
            { name: "confluence", displayName: "Confluence", authType: "api_token" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
            { name: "github", displayName: "GitHub", authType: "oauth" },
            { name: "google_calendar", displayName: "Google Calendar", authType: "oauth" },
        ],
    },
    customer_support_executive: {
        displayName: "Customer Support",
        description: "Ticket routing, email/chat/voice support, refund handling, and customer escalation.",
        connectors: [
            { name: "zendesk", displayName: "Zendesk", authType: "api_token" },
            { name: "intercom", displayName: "Intercom", authType: "oauth" },
            { name: "gmail", displayName: "Gmail", authType: "oauth" },
            { name: "slack", displayName: "Slack", authType: "oauth" },
        ],
    },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "select_role" | "connect_tools" | "configure_persona" | "set_approval_rules" | "deploy";

const STEPS: WizardStep[] = [
    "select_role",
    "connect_tools",
    "configure_persona",
    "set_approval_rules",
    "deploy",
];

const STEP_LABELS: Record<WizardStep, string> = {
    select_role: "Role",
    connect_tools: "Tools",
    configure_persona: "Persona",
    set_approval_rules: "Approvals",
    deploy: "Deploy",
};

type SessionRecord = {
    id: string;
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    selectedRole: string | null;
    connectors: Array<{ name: string; displayName: string; authType: string; status: string }>;
    personaBotId: string | null;
    approvalPolicy: { highRiskRequiresApproval: boolean; mediumRiskRequiresApproval: boolean; approvalTimeoutSeconds: number } | null;
    status: "in_progress" | "completed" | "abandoned";
};

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ current }: { current: WizardStep }) {
    const currentIdx = STEPS.indexOf(current);
    return (
        <ol className="flex items-center gap-0 w-full mb-8">
            {STEPS.map((step, i) => {
                const done = i < currentIdx;
                const active = i === currentIdx;
                return (
                    <li key={step} className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex items-center w-full">
                            {i > 0 && (
                                <div className={`flex-1 h-0.5 ${done || active ? "bg-[var(--op-indigo)]" : "bg-[var(--op-line)]"}`} />
                            )}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2 transition-all ${done
                                    ? "bg-[var(--op-indigo)] border-[var(--op-indigo)] text-white"
                                    : active
                                        ? "bg-[var(--op-paper)] border-[var(--op-indigo)] text-[var(--op-ink)]"
                                        : "bg-transparent border-[var(--op-line)] text-[var(--ink-muted,#94a3b8)]"
                                }`}>
                                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 ${done ? "bg-[var(--op-indigo)]" : "bg-[var(--op-line)]"}`} />
                            )}
                        </div>
                        <span className={`text-[0.65rem] font-semibold uppercase tracking-wider ${active ? "text-[var(--op-ink)]" : "text-[var(--ink-muted,#94a3b8)]"}`}>
                            {STEP_LABELS[step]}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

// ─── Step 1: Select Role ──────────────────────────────────────────────────────

function SelectRoleStep({ roleKey, onNext }: { roleKey: string; onNext: (payload: unknown) => Promise<void> }) {
    const meta = ROLE_META[roleKey];
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function confirm() {
        setLoading(true);
        setError("");
        try {
            await onNext({ roleKey });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-[var(--op-line)] p-5 bg-[var(--canvas-subtle,#f8fafc)]">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--ink-muted,#94a3b8)] mb-1">Selected Role</p>
                <h2 className="text-2xl font-black text-[var(--op-ink)] tracking-tight">{meta?.displayName ?? roleKey}</h2>
                <p className="mt-2 text-sm text-[var(--ink-muted,#64748b)]">{meta?.description ?? ""}</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
                onClick={confirm}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Confirm role &amp; continue
            </button>
        </div>
    );
}

// ─── Step 2: Connect Tools ────────────────────────────────────────────────────

function ConnectToolsStep({ roleKey, onNext }: { roleKey: string; onNext: (payload: unknown) => Promise<void> }) {
    const meta = ROLE_META[roleKey];
    const available = meta?.connectors ?? [];
    const [selected, setSelected] = useState<Set<string>>(() => new Set(available.slice(0, 2).map((c) => c.name)));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function toggle(name: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }

    async function proceed() {
        if (selected.size === 0) {
            setError("Select at least one connector to continue.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const connectors = available
                .filter((c) => selected.has(c.name))
                .map((c) => ({ name: c.name, displayName: c.displayName, authType: c.authType }));
            await onNext({ connectors });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-[var(--ink-muted,#64748b)]">
                Select the tools your agent will use. You can add more from the dashboard later.
            </p>
            <div className="grid grid-cols-2 gap-2">
                {available.map((c) => {
                    const on = selected.has(c.name);
                    return (
                        <button
                            key={c.name}
                            onClick={() => toggle(c.name)}
                            className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${on
                                    ? "border-[var(--op-indigo)] bg-[var(--canvas-subtle,#f8fafc)]"
                                    : "border-[var(--op-line)] bg-transparent hover:border-[var(--ink-muted,#94a3b8)]"
                                }`}
                        >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "border-[var(--op-indigo)] bg-[var(--op-indigo)]" : "border-[var(--op-line)]"
                                }`}>
                                {on && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[var(--op-ink)]">{c.displayName}</p>
                                <p className="text-[0.6rem] text-[var(--ink-muted,#94a3b8)] capitalize">{c.authType.replace("_", " ")}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
                onClick={proceed}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
            </button>
        </div>
    );
}

// ─── Step 3: Configure Persona ────────────────────────────────────────────────

function ConfigurePersonaStep({ roleKey, onNext }: { roleKey: string; onNext: (payload: unknown) => Promise<void> }) {
    const meta = ROLE_META[roleKey];
    const defaultName = `${meta?.displayName ?? "AI"} Agent`;
    const [displayName, setDisplayName] = useState(defaultName);
    const [emailAddress, setEmailAddress] = useState("");
    const [communicationStyle, setCommunicationStyle] = useState("professional");
    const [disclosureStatement, setDisclosureStatement] = useState("This message was sent by an AI agent.");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function proceed() {
        if (!displayName.trim()) { setError("Agent name is required."); return; }
        if (!emailAddress.trim() || !/^\S+@\S+\.\S+$/.test(emailAddress)) { setError("Valid email address is required."); return; }
        setLoading(true);
        setError("");
        try {
            await onNext({ displayName: displayName.trim(), emailAddress: emailAddress.trim(), communicationStyle, disclosureStatement });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--ink-muted,#64748b)]">
                Give your agent an identity. External people will interact with it by this name and email.
            </p>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--op-ink)]">Agent name</label>
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Dev Bot"
                    className="rounded-lg border border-[var(--op-line)] px-3 py-2 text-sm text-[var(--op-ink)] bg-transparent focus:outline-none focus:border-[var(--op-indigo)]"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--op-ink)]">Agent email address</label>
                <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="e.g. devbot@yourcompany.com"
                    className="rounded-lg border border-[var(--op-line)] px-3 py-2 text-sm text-[var(--op-ink)] bg-transparent focus:outline-none focus:border-[var(--op-indigo)]"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--op-ink)]">Communication style</label>
                <select
                    value={communicationStyle}
                    onChange={(e) => setCommunicationStyle(e.target.value)}
                    className="rounded-lg border border-[var(--op-line)] px-3 py-2 text-sm text-[var(--op-ink)] bg-transparent focus:outline-none focus:border-[var(--op-indigo)]"
                >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="concise">Concise</option>
                    <option value="formal">Formal</option>
                </select>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--op-ink)]">Disclosure footer</label>
                <input
                    value={disclosureStatement}
                    onChange={(e) => setDisclosureStatement(e.target.value)}
                    className="rounded-lg border border-[var(--op-line)] px-3 py-2 text-sm text-[var(--op-ink)] bg-transparent focus:outline-none focus:border-[var(--op-indigo)]"
                />
                <p className="text-[0.6rem] text-[var(--ink-muted,#94a3b8)]">Appended to all outbound messages. Required for AI disclosure compliance.</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
                onClick={proceed}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
            </button>
        </div>
    );
}

// ─── Step 4: Set Approval Rules ───────────────────────────────────────────────

function SetApprovalRulesStep({ onNext }: { onNext: (payload: unknown) => Promise<void> }) {
    const [highRisk, setHighRisk] = useState(true);
    const [mediumRisk, setMediumRisk] = useState(false);
    const [timeout, setTimeout_] = useState(3600);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function proceed() {
        setLoading(true);
        setError("");
        try {
            await onNext({
                approvalPolicy: {
                    highRiskRequiresApproval: highRisk,
                    mediumRiskRequiresApproval: mediumRisk,
                    approvalTimeoutSeconds: timeout,
                },
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-[var(--ink-muted,#64748b)]">
                Control when your agent pauses and waits for human approval before acting.
            </p>
            <div className="flex flex-col gap-3">
                {[
                    { label: "High-risk actions require approval", sublabel: "e.g. merge to main, deploy to production, send external email", value: highRisk, set: setHighRisk },
                    { label: "Medium-risk actions require approval", sublabel: "e.g. create PR, update CRM record, schedule meeting", value: mediumRisk, set: setMediumRisk },
                ].map(({ label, sublabel, value, set }) => (
                    <button
                        key={label}
                        onClick={() => set(!value)}
                        className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${value ? "border-[var(--op-indigo)]" : "border-[var(--op-line)]"
                            }`}
                    >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${value ? "bg-[var(--op-indigo)] border-[var(--op-indigo)]" : "border-[var(--op-line)]"
                            }`}>
                            {value && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[var(--op-ink)]">{label}</p>
                            <p className="text-xs text-[var(--ink-muted,#94a3b8)]">{sublabel}</p>
                        </div>
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-[var(--op-ink)]">Approval timeout</label>
                <select
                    value={timeout}
                    onChange={(e) => setTimeout_(Number(e.target.value))}
                    className="rounded-lg border border-[var(--op-line)] px-3 py-2 text-sm text-[var(--op-ink)] bg-transparent focus:outline-none focus:border-[var(--op-indigo)]"
                >
                    <option value={1800}>30 minutes</option>
                    <option value={3600}>1 hour</option>
                    <option value={7200}>2 hours</option>
                    <option value={28800}>8 hours</option>
                    <option value={86400}>24 hours</option>
                </select>
                <p className="text-[0.6rem] text-[var(--ink-muted,#94a3b8)]">If no decision is made within this window, the request auto-expires.</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
                onClick={proceed}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
            </button>
        </div>
    );
}

// ─── Step 5: Deploy ───────────────────────────────────────────────────────────

function DeployStep({
    session,
    onDeploy,
}: {
    session: SessionRecord;
    onDeploy: () => Promise<void>;
}) {
    const [loading, setLoading] = useState(false);
    const [deployed, setDeployed] = useState(false);
    const [error, setError] = useState("");
    const meta = ROLE_META[session.selectedRole ?? ""] ?? null;

    async function deploy() {
        setLoading(true);
        setError("");
        try {
            await onDeploy();
            setDeployed(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Deployment failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    if (deployed) {
        return (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                    <h3 className="text-lg font-black text-[var(--op-ink)]">Your agent is being deployed!</h3>
                    <p className="text-sm text-[var(--ink-muted,#64748b)] mt-1">It will be active within a few minutes. Check the dashboard for status.</p>
                </div>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                    <Rocket className="w-4 h-4" /> Go to dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <p className="text-sm text-[var(--ink-muted,#64748b)]">Review your configuration, then deploy.</p>
            <div className="rounded-xl border border-[var(--op-line)] divide-y divide-[var(--op-line)]">
                <Row icon={<User className="w-4 h-4" />} label="Role" value={meta?.displayName ?? session.selectedRole ?? "—"} />
                <Row
                    icon={<Wrench className="w-4 h-4" />}
                    label="Connectors"
                    value={session.connectors.length > 0 ? session.connectors.map((c) => c.displayName).join(", ") : "None"}
                />
                <Row
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="High-risk approvals"
                    value={session.approvalPolicy?.highRiskRequiresApproval ? "Required" : "Auto-execute"}
                />
                <Row
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="Medium-risk approvals"
                    value={session.approvalPolicy?.mediumRiskRequiresApproval ? "Required" : "Auto-execute"}
                />
            </div>
            {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}
            <button
                onClick={deploy}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                Deploy agent
            </button>
        </div>
    );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-[var(--ink-muted,#94a3b8)]">{icon}</span>
            <span className="text-xs font-semibold text-[var(--ink-muted,#64748b)] w-28 shrink-0">{label}</span>
            <span className="text-sm text-[var(--op-ink)] truncate">{value}</span>
        </div>
    );
}

// ─── Main wizard page ─────────────────────────────────────────────────────────

type Props = { params: Promise<{ role: string }> };

export default function HireWizardPage({ params }: Props) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [roleKey, setRoleKey] = useState<string>("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [session, setSession] = useState<SessionRecord | null>(null);
    const [initError, setInitError] = useState("");
    const [initialising, setInitialising] = useState(true);

    // Resolve role from route params
    useEffect(() => {
        params.then(({ role }) => setRoleKey(role));
    }, [params]);

    // Start wizard session once roleKey is known
    useEffect(() => {
        if (!roleKey) return;

        async function startSession() {
            setInitialising(true);
            setInitError("");
            try {
                const res = await fetch("/api/wizard", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ initialRoleKey: roleKey }),
                });
                const data = await res.json() as { session?: SessionRecord; error?: string };
                if (!res.ok) {
                    if (res.status === 401) {
                        router.push(`/login?redirect=/hire/${encodeURIComponent(roleKey)}`);
                        return;
                    }
                    setInitError(data.error ?? "Failed to start wizard.");
                    return;
                }
                if (data.session) {
                    setSessionId(data.session.id);
                    setSession(data.session);
                }
            } catch {
                setInitError("Network error. Please try again.");
            } finally {
                setInitialising(false);
            }
        }

        startSession();
    }, [roleKey, router]);

    const advanceStep = useCallback(async (payload: unknown) => {
        if (!sessionId || !session) throw new Error("No active session.");

        const nextStepIdx = STEPS.indexOf(session.currentStep) + 1;
        const nextStep = STEPS[nextStepIdx];
        if (!nextStep) throw new Error("Already at final step.");

        const res = await fetch(`/api/wizard/${encodeURIComponent(sessionId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ step: nextStep, payload }),
        });
        const data = await res.json() as { session?: SessionRecord; error?: string; reason?: string };
        if (!res.ok) {
            throw new Error(data.reason ?? data.error ?? "Step failed.");
        }
        if (data.session) setSession(data.session);
    }, [sessionId, session]);

    const completeDeploy = useCallback(async () => {
        if (!sessionId) throw new Error("No active session.");

        const res = await fetch(`/api/wizard/${encodeURIComponent(sessionId)}`, {
            method: "POST",
        });
        const data = await res.json() as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Deploy failed.");
        // Mark session as completed locally so deploy step shows success
        if (session) {
            setSession({ ...session, status: "completed", currentStep: "deploy" });
        }
    }, [sessionId, session]);

    const meta = ROLE_META[roleKey];

    return (
        <div className="min-h-screen bg-[var(--op-paper)] flex flex-col">
            {/* Header */}
            <header className="border-b border-[var(--op-line)] px-4 py-3">
                <div className="max-w-lg mx-auto flex items-center gap-3">
                    <Link href={`/marketplace/${roleKey}`} className="text-[var(--ink-muted,#94a3b8)] hover:text-[var(--op-ink)] transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <span className="text-sm font-semibold text-[var(--op-ink)]">
                        Hire {meta?.displayName ?? roleKey} Agent
                    </span>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 flex flex-col items-center px-4 py-8">
                <div className="w-full max-w-lg">
                    {initialising && (
                        <div className="flex flex-col items-center gap-3 py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--ink-muted,#94a3b8)]" />
                            <p className="text-sm text-[var(--ink-muted,#64748b)]">Setting up your wizard…</p>
                        </div>
                    )}

                    {!initialising && initError && (
                        <div className="flex flex-col items-center gap-4 py-12 text-center">
                            <AlertTriangle className="w-10 h-10 text-red-400" />
                            <p className="text-sm text-[var(--op-ink)]">{initError}</p>
                            <Link href="/login" className="text-sm underline text-[var(--ink-muted,#64748b)]">
                                Sign in to continue
                            </Link>
                        </div>
                    )}

                    {!initialising && !initError && session && (
                        <>
                            <StepBar current={session.currentStep} />

                            {session.currentStep === "select_role" && (
                                <SelectRoleStep roleKey={roleKey} onNext={advanceStep} />
                            )}
                            {session.currentStep === "connect_tools" && (
                                <ConnectToolsStep roleKey={roleKey} onNext={advanceStep} />
                            )}
                            {session.currentStep === "configure_persona" && (
                                <ConfigurePersonaStep roleKey={roleKey} onNext={advanceStep} />
                            )}
                            {session.currentStep === "set_approval_rules" && (
                                <SetApprovalRulesStep onNext={advanceStep} />
                            )}
                            {session.currentStep === "deploy" && (
                                <DeployStep session={session} onDeploy={completeDeploy} />
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
