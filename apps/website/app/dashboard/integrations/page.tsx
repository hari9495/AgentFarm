"use client";

import { useState, useEffect } from "react";
import { Link2, Plus, RefreshCw, Trash2, Zap, Settings2, ChevronRight, Pencil, Check, X } from "lucide-react";
import type { Metadata } from "next";
import PremiumIcon from "@/components/shared/PremiumIcon";

// ── Types (mirrors /app/connectors/page.tsx) ──────────────────────────────
type ConnectorCategory = "task_tracker" | "messaging" | "code" | "email" | "monitoring" | "crm" | "ats" | "cms" | "cloud";
type ConnectorAuthMethod = "oauth2" | "api_key" | "bearer_token" | "basic" | "generic_rest";
type ConnectorStatus = "connected" | "disconnected" | "error" | "pending_auth";

interface ConfigField {
    key: string;
    label: string;
    type: "text" | "password" | "url" | "select";
    required: boolean;
    placeholder?: string;
    options?: { value: string; label: string }[];
    hint?: string;
}

interface AvailableConnector {
    tool: string;
    category: ConnectorCategory;
    displayName: string;
    logoUrl: string;
    authMethod: ConnectorAuthMethod;
    supportedActions: string[];
    docsUrl: string;
    configSchema: ConfigField[] | null;
    oauthScopes: string[] | null;
    connected: boolean;
}

interface WorkspaceBotOption {
    workspaceId: string;
    workspaceName: string;
    roleType: string;
    botId: string;
    botName: string;
    botStatus: string;
    policyPackVersion: string;
}

interface ConnectorContext {
    selectedWorkspaceId: string;
    selectedBotId: string;
    selectedRoleKey: string;
    selectedPolicyPackVersion: string;
    scope_model?: string;
    disallowed_tools_hidden_count: number;
    options: WorkspaceBotOption[];
}

interface ConfiguredConnector {
    connectorId: string;
    tool: string;
    category: ConnectorCategory;
    displayName: string;
    status: ConnectorStatus;
    authMethod: ConnectorAuthMethod;
    lastHealthcheckAt: string | null;
    lastErrorClass: string | null;
}

interface HealthCheckResult {
    healthy: boolean;
    message?: string;
    nextStep?: { oauthInitUrl?: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
    task_tracker: "Task Trackers",
    messaging: "Messaging",
    code: "Code & Version Control",
    email: "Email",
    monitoring: "Monitoring & Alerting",
    crm: "CRM",
    ats: "Recruiting (ATS)",
    cms: "Content (CMS)",
    cloud: "Cloud",
};

const CATEGORY_ORDER: ConnectorCategory[] = ["task_tracker", "messaging", "code", "email", "monitoring", "crm", "ats", "cms", "cloud"];

const STATUS_BADGE: Record<ConnectorStatus, string> = {
    connected: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    pending_auth: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    error: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400",
    disconnected: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

const STATUS_LABELS: Record<ConnectorStatus, string> = {
    connected: "Connected",
    pending_auth: "Auth Required",
    error: "Error",
    disconnected: "Disconnected",
};

// ── Static connector catalog (all built connectors) ─────────────────────
// This is the ground-truth list of connectors that are fully implemented in
// services/connector-gateway and packages/notification-service. The page
// merges this with live API data: API wins when available, this fills gaps.
const STATIC_CONNECTOR_CATALOG: AvailableConnector[] = [
    // ── Task Trackers ────────────────────────────────────────────────────
    {
        tool: "jira", category: "task_tracker", displayName: "Jira", logoUrl: "",
        authMethod: "basic",
        supportedActions: ["create_issue", "update_issue", "get_task", "list_issues", "add_comment", "transition_issue", "list_projects"],
        docsUrl: "https://developer.atlassian.com/cloud/jira/",
        configSchema: [
            { key: "host", label: "Jira Host", type: "url", required: true, placeholder: "https://yourorg.atlassian.net", hint: "Your Atlassian Cloud or Server base URL" },
            { key: "email", label: "Account Email", type: "text", required: true, placeholder: "you@yourorg.com" },
            { key: "apiToken", label: "API Token", type: "password", required: true, hint: "Generate at id.atlassian.com/manage-profile/security/api-tokens" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "linear", category: "task_tracker", displayName: "Linear", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["create_issue", "update_issue", "get_task", "list_issues", "add_label", "assign_issue"],
        docsUrl: "https://linear.app/docs/graphql",
        configSchema: [
            { key: "apiKey", label: "API Key", type: "password", required: true, hint: "Generate at linear.app › Settings › API › Personal API keys" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "confluence", category: "task_tracker", displayName: "Confluence", logoUrl: "",
        authMethod: "basic",
        supportedActions: ["create_page", "update_page", "get_page", "list_pages", "add_comment", "search_pages"],
        docsUrl: "https://developer.atlassian.com/cloud/confluence/",
        configSchema: [
            { key: "host", label: "Confluence Host", type: "url", required: true, placeholder: "https://yourorg.atlassian.net/wiki" },
            { key: "email", label: "Account Email", type: "text", required: true, placeholder: "you@yourorg.com" },
            { key: "apiToken", label: "API Token", type: "password", required: true, hint: "Same Atlassian API token as Jira" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "notion", category: "task_tracker", displayName: "Notion", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["create_page", "update_page", "get_page", "list_pages", "query_database", "search"],
        docsUrl: "https://developers.notion.com/",
        configSchema: [
            { key: "apiKey", label: "Integration Token", type: "password", required: true, hint: "Create at notion.so/my-integrations and share pages with the integration" },
        ],
        oauthScopes: null, connected: false,
    },
    // ── Messaging ────────────────────────────────────────────────────────
    {
        tool: "slack", category: "messaging", displayName: "Slack", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["send_message", "post_thread", "add_reaction", "list_channels", "lookup_user", "incident_alert"],
        docsUrl: "https://api.slack.com/",
        configSchema: [
            { key: "webhookUrl", label: "Incoming Webhook URL", type: "url", required: false, placeholder: "https://hooks.slack.com/services/…", hint: "Optional — for simple message posting" },
            { key: "botToken", label: "Bot Token", type: "password", required: false, placeholder: "xoxb-…", hint: "Required for threads, reactions and user lookup" },
            { key: "defaultChannel", label: "Default Channel", type: "text", required: false, placeholder: "#general" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "teams", category: "messaging", displayName: "Microsoft Teams", logoUrl: "",
        authMethod: "oauth2",
        supportedActions: ["send_message", "list_channels", "list_teams", "create_meeting", "send_adaptive_card", "incident_alert"],
        docsUrl: "https://learn.microsoft.com/en-us/graph/teams-concept-overview",
        configSchema: [
            { key: "tenantId", label: "Azure Tenant ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
            { key: "clientId", label: "App Client ID", type: "text", required: true, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
            { key: "clientSecret", label: "App Client Secret", type: "password", required: true },
        ],
        oauthScopes: ["ChannelMessage.Send", "Chat.ReadWrite", "Team.ReadBasic.All", "OnlineMeetings.ReadWrite"], connected: false,
    },
    {
        tool: "discord", category: "messaging", displayName: "Discord", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["send_message", "send_embed"],
        docsUrl: "https://discord.com/developers/docs",
        configSchema: [
            { key: "webhookUrl", label: "Webhook URL", type: "url", required: true, placeholder: "https://discord.com/api/webhooks/…", hint: "Server Settings › Integrations › Webhooks" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "telegram", category: "messaging", displayName: "Telegram", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["send_message"],
        docsUrl: "https://core.telegram.org/bots/api",
        configSchema: [
            { key: "botToken", label: "Bot Token", type: "password", required: true, hint: "Create a bot via @BotFather on Telegram" },
            { key: "chatId", label: "Chat ID", type: "text", required: true, hint: "Numeric ID of the chat or channel the bot should post to" },
        ],
        oauthScopes: null, connected: false,
    },
    // ── Code & Version Control ───────────────────────────────────────────
    {
        tool: "github", category: "code", displayName: "GitHub", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["create_issue", "update_issue", "create_pr", "list_prs", "add_comment", "get_commit", "trigger_workflow", "manage_webhooks"],
        docsUrl: "https://docs.github.com/en/rest",
        configSchema: [
            { key: "token", label: "Personal Access Token", type: "password", required: true, hint: "github.com › Settings › Developer settings › Personal access tokens (classic or fine-grained)" },
            { key: "owner", label: "Owner / Org", type: "text", required: false, placeholder: "your-org", hint: "Default GitHub owner/org for operations" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "gitlab", category: "code", displayName: "GitLab", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["create_issue", "update_issue", "create_mr", "list_mrs", "add_note", "list_pipelines", "get_commit"],
        docsUrl: "https://docs.gitlab.com/ee/api/",
        configSchema: [
            { key: "token", label: "Personal Access Token", type: "password", required: true, hint: "gitlab.com › User Settings › Access Tokens" },
            { key: "host", label: "GitLab Host", type: "url", required: false, placeholder: "https://gitlab.com", hint: "Override for self-managed instances" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "azure_devops", category: "code", displayName: "Azure DevOps", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["create_work_item", "update_work_item", "get_work_item", "list_work_items", "trigger_pipeline", "get_build_status"],
        docsUrl: "https://learn.microsoft.com/en-us/rest/api/azure/devops/",
        configSchema: [
            { key: "token", label: "Personal Access Token", type: "password", required: true, hint: "dev.azure.com › User settings › Personal access tokens" },
            { key: "organization", label: "Organization", type: "text", required: true, placeholder: "your-org" },
            { key: "project", label: "Default Project", type: "text", required: false, placeholder: "MyProject" },
        ],
        oauthScopes: null, connected: false,
    },
    // ── Email ────────────────────────────────────────────────────────────
    {
        tool: "generic_smtp", category: "email", displayName: "Email (SMTP)", logoUrl: "",
        authMethod: "basic",
        supportedActions: ["send_email"],
        docsUrl: "",
        configSchema: [
            { key: "smtpHost", label: "SMTP Host", type: "text", required: true, placeholder: "smtp.yourprovider.com" },
            { key: "smtpPort", label: "SMTP Port", type: "text", required: true, placeholder: "587" },
            { key: "smtpUser", label: "Username", type: "text", required: true },
            { key: "smtpPass", label: "Password", type: "password", required: true },
            { key: "fromAddress", label: "From Address", type: "text", required: true, placeholder: "agent@yourorg.com" },
            { key: "secure", label: "TLS Mode", type: "select", required: false, options: [{ value: "true", label: "TLS (port 465)" }, { value: "false", label: "STARTTLS (port 587)" }] },
        ],
        oauthScopes: null, connected: false,
    },
    // ── Monitoring & Alerting ────────────────────────────────────────────
    {
        tool: "pagerduty", category: "monitoring", displayName: "PagerDuty", logoUrl: "",
        authMethod: "api_key",
        supportedActions: ["create_incident", "acknowledge_incident", "resolve_incident", "get_on_call", "list_incidents", "query_alerts"],
        docsUrl: "https://developer.pagerduty.com/api-reference/",
        configSchema: [
            { key: "apiKey", label: "API Key", type: "password", required: true, hint: "pagerduty.com › Integrations › API Access Keys" },
            { key: "serviceId", label: "Default Service ID", type: "text", required: false, hint: "Used when creating incidents without specifying a service" },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "sentry", category: "monitoring", displayName: "Sentry", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["list_issues", "get_issue", "get_events", "list_releases", "list_alerts"],
        docsUrl: "https://docs.sentry.io/api/",
        configSchema: [
            { key: "token", label: "Auth Token", type: "password", required: true, hint: "sentry.io › Settings › Account › API › Auth Tokens" },
            { key: "organization", label: "Organization Slug", type: "text", required: true, placeholder: "your-org" },
        ],
        oauthScopes: null, connected: false,
    },
    // ── Custom REST connectors ────────────────────────────────────────────
    {
        tool: "generic_rest", category: "task_tracker", displayName: "Custom REST API", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["send_request", "get_resource", "create_resource", "update_resource", "delete_resource", "list_resources"],
        docsUrl: "",
        configSchema: [
            { key: "baseUrl", label: "API Base URL", type: "url", required: true, placeholder: "https://api.yourservice.com/v1", hint: "Root URL of your REST API. All requests will be relative to this." },
            { key: "authType", label: "Authentication Type", type: "select", required: true, options: [
                { value: "bearer_token", label: "Bearer Token" },
                { value: "api_key", label: "API Key (header)" },
                { value: "basic", label: "Basic Auth (username:password)" },
                { value: "none", label: "No authentication" },
            ]},
            { key: "authValue", label: "Token / API Key / Credentials", type: "password", required: false, hint: "Bearer token, API key value, or username:password for Basic auth." },
            { key: "authHeader", label: "API Key Header Name", type: "text", required: false, placeholder: "X-API-Key", hint: "Only for API Key auth. Defaults to Authorization." },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "generic_rest_messaging", category: "messaging", displayName: "Custom Messaging API", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["send_message", "post_thread", "list_channels", "lookup_user"],
        docsUrl: "",
        configSchema: [
            { key: "baseUrl", label: "API Base URL", type: "url", required: true, placeholder: "https://api.yourservice.com/v1", hint: "Root URL of your messaging REST API." },
            { key: "authType", label: "Authentication Type", type: "select", required: true, options: [
                { value: "bearer_token", label: "Bearer Token" },
                { value: "api_key", label: "API Key (header)" },
                { value: "basic", label: "Basic Auth (username:password)" },
                { value: "none", label: "No authentication" },
            ]},
            { key: "authValue", label: "Token / API Key / Credentials", type: "password", required: false, hint: "Bearer token, API key value, or username:password for Basic auth." },
            { key: "authHeader", label: "API Key Header Name", type: "text", required: false, placeholder: "X-API-Key", hint: "Only for API Key auth. Defaults to Authorization." },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "generic_rest_code", category: "code", displayName: "Custom Code/VCS API", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["create_issue", "update_issue", "create_pr", "list_prs", "add_comment", "trigger_workflow"],
        docsUrl: "",
        configSchema: [
            { key: "baseUrl", label: "API Base URL", type: "url", required: true, placeholder: "https://api.yourservice.com/v1", hint: "Root URL of your code/version control REST API." },
            { key: "authType", label: "Authentication Type", type: "select", required: true, options: [
                { value: "bearer_token", label: "Bearer Token" },
                { value: "api_key", label: "API Key (header)" },
                { value: "basic", label: "Basic Auth (username:password)" },
                { value: "none", label: "No authentication" },
            ]},
            { key: "authValue", label: "Token / API Key / Credentials", type: "password", required: false, hint: "Bearer token, API key value, or username:password for Basic auth." },
            { key: "authHeader", label: "API Key Header Name", type: "text", required: false, placeholder: "X-API-Key", hint: "Only for API Key auth. Defaults to Authorization." },
        ],
        oauthScopes: null, connected: false,
    },
    {
        tool: "generic_rest_email", category: "email", displayName: "Custom Email API", logoUrl: "",
        authMethod: "bearer_token",
        supportedActions: ["send_email", "list_threads", "get_thread", "reply_email", "search_emails"],
        docsUrl: "",
        configSchema: [
            { key: "baseUrl", label: "API Base URL", type: "url", required: true, placeholder: "https://api.yourservice.com/v1", hint: "Root URL of your email REST API." },
            { key: "authType", label: "Authentication Type", type: "select", required: true, options: [
                { value: "bearer_token", label: "Bearer Token" },
                { value: "api_key", label: "API Key (header)" },
                { value: "basic", label: "Basic Auth (username:password)" },
                { value: "none", label: "No authentication" },
            ]},
            { key: "authValue", label: "Token / API Key / Credentials", type: "password", required: false, hint: "Bearer token, API key value, or username:password for Basic auth." },
            { key: "authHeader", label: "API Key Header Name", type: "text", required: false, placeholder: "X-API-Key", hint: "Only for API Key auth. Defaults to Authorization." },
        ],
        oauthScopes: null, connected: false,
    },
];

// ── Emoji icon fallback ───────────────────────────────────────────────────
function ConnectorIcon({ tool, size = 32 }: { tool: string; size?: number }) {
    const icons: Record<string, string> = {
        jira: "🔷", linear: "🔵", asana: "🟠", monday: "🟣", trello: "🃏", clickup: "🟡",
        confluence: "📘", notion: "⬛",
        teams: "💬", slack: "💚", discord: "🎮", google_chat: "💭", telegram: "✈️",
        github: "🐙", gitlab: "🦊", bitbucket: "🔵", azure_devops: "🔷",
        outlook: "📧", gmail: "📬", exchange: "📮", generic_smtp: "📨",
        pagerduty: "🚨", sentry: "🐛",
        hubspot: "🧲", salesforce: "☁️",
        greenhouse: "🌱", wordpress: "📝", azure: "🔷",
        generic_rest: "🔌", generic_rest_messaging: "🔌", generic_rest_code: "🔌",
        generic_rest_email: "🔌",
    };
    return (
        <span style={{ fontSize: size * 0.7 }} className="inline-flex items-center justify-center" aria-hidden>
            {icons[tool] ?? "🔌"}
        </span>
    );
}

// Derive a human-friendly connector name from an API base URL.
// e.g. https://api.notion.com/v1 → "Notion", https://pokeapi.co/api → "Pokeapi",
//      https://uptime.betterstack.com → "Betterstack".
function deriveConnectorName(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return "";
    let host: string;
    try {
        host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
    } catch {
        return "";
    }
    const labels = host.replace(/^www\./, "").split(".").filter(Boolean);
    if (labels.length === 0) return "";
    // Use the registrable domain label (second-to-last), which skips common
    // prefixes like api./app./rest. and the TLD: api.notion.com → "notion".
    const core = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    if (!core) return "";
    return core.charAt(0).toUpperCase() + core.slice(1);
}

// ── Add Connector Modal ────────────────────────────────────────────────────
function AddConnectorModal({
    connector,
    workspaceId,
    botId,
    onClose,
    onAdded,
}: {
    connector: AvailableConnector;
    workspaceId: string | null;
    botId: string | null;
    onClose: () => void;
    onAdded: () => void;
}) {
    const [displayName, setDisplayName] = useState(connector.displayName);
    const [nameTouched, setNameTouched] = useState(false);
    const [configValues, setConfigValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fields = connector.configSchema ?? [];
    // Custom REST connectors (generic_rest*) carry a baseUrl field — derive the
    // display name from it so the user doesn't have to name each one by hand.
    const isCustom = connector.tool.startsWith("generic_rest");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/connectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: connector.tool, displayName, configValues, workspaceId, botId }),
            });
            const json = await res.json() as { error?: string; nextStep?: { action: string; oauthUrl?: string } };
            if (!res.ok) { setError(json.error ?? "Failed to add connector."); return; }
            if (json.nextStep?.action === "oauth" && typeof json.nextStep.oauthUrl === "string") {
                window.location.href = json.nextStep.oauthUrl;
                return;
            }
            onAdded();
            onClose();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 p-5 border-b border-slate-200 dark:border-slate-800">
                    <ConnectorIcon tool={connector.tool} size={36} />
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Connect {connector.displayName}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{connector.category.replace("_", " ")}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-auto text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl font-bold"
                        aria-label="Close"
                    >×</button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => { setNameTouched(true); setDisplayName(e.target.value); }}
                            className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. Our Jira, Engineering Slack"
                        />
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {isCustom
                                ? "Auto-filled from the API URL below — edit if you'd like a different name."
                                : "The name your team will see in the dashboard."}
                        </p>
                    </div>

                    {connector.authMethod === "oauth2" && (
                        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">OAuth 2.0 Authentication</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                                After clicking Add, you&apos;ll be redirected to {connector.displayName} to authorize access.
                            </p>
                            {connector.oauthScopes && (
                                <ul className="mt-2 space-y-0.5">
                                    {connector.oauthScopes.map((s) => (
                                        <li key={s} className="text-xs font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1">• {s}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {fields.map((field) => (
                        <div key={field.key}>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {field.label}
                                {field.required && <span className="text-rose-500 ml-1">*</span>}
                            </label>
                            {field.type === "select" ? (
                                <select
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => setConfigValues((v) => ({ ...v, [field.key]: e.target.value }))}
                                    className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required={field.required}
                                >
                                    <option value="">Select...</option>
                                    {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            ) : (
                                <input
                                    type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setConfigValues((v) => ({ ...v, [field.key]: value }));
                                        // Auto-derive the display name from the API base URL until
                                        // the user manually edits the name field themselves.
                                        if (isCustom && field.key === "baseUrl" && !nameTouched) {
                                            const derived = deriveConnectorName(value);
                                            if (derived) setDisplayName(derived);
                                        }
                                    }}
                                    className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={field.placeholder}
                                    required={field.required}
                                />
                            )}
                            {field.hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{field.hint}</p>}
                        </div>
                    ))}

                    <div>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Your agent will be able to:</p>
                        <div className="flex flex-wrap gap-1">
                            {connector.supportedActions.map((a) => (
                                <span key={a} className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full px-2 py-0.5 text-xs font-mono">{a}</span>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                        >Cancel</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {loading ? "Connecting…" : connector.authMethod === "oauth2" ? "Continue to Auth" : "Add Connector"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Configured Connector Row ───────────────────────────────────────────────
function ConnectorRow({
    connector,
    onRemove,
    onHealthCheck,
    onRename,
}: {
    connector: ConfiguredConnector;
    onRemove: () => void;
    onHealthCheck: () => Promise<HealthCheckResult>;
    onRename: (newName: string) => Promise<void>;
}) {
    const [checking, setChecking] = useState(true);
    const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
    const [editing, setEditing] = useState(false);
    const [nameInput, setNameInput] = useState(connector.displayName);
    const [savingName, setSavingName] = useState(false);

    async function saveName() {
        const trimmed = nameInput.trim();
        if (!trimmed || trimmed === connector.displayName) { setEditing(false); setNameInput(connector.displayName); return; }
        setSavingName(true);
        try {
            await onRename(trimmed);
            setEditing(false);
        } finally {
            setSavingName(false);
        }
    }

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/connectors/${connector.connectorId}/health`, { method: "POST" })
            .then((r) => r.json() as Promise<HealthCheckResult>)
            .then((result) => { if (!cancelled) { setHealthResult(result); setChecking(false); } })
            .catch(() => { if (!cancelled) { setChecking(false); } });
        return () => { cancelled = true; };
    }, [connector.connectorId]);

    async function runHealthCheck() {
        setChecking(true);
        const result = await onHealthCheck();
        setHealthResult(result);
        setChecking(false);
        if (result.healthy) setTimeout(() => setHealthResult(null), 3000);
    }

    const badge = checking ? (
        <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
            ⬤ Checking…
        </span>
    ) : healthResult !== null ? (
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${healthResult.healthy ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"}`}>
            {healthResult.healthy ? "⬤ Healthy" : "⬤ Degraded"}
        </span>
    ) : (
        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE[connector.status]}`}>
            {STATUS_LABELS[connector.status]}
        </span>
    );

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <ConnectorIcon tool={connector.tool} size={36} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {editing ? (
                        <span className="flex items-center gap-1">
                            <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") { setEditing(false); setNameInput(connector.displayName); } }}
                                autoFocus
                                maxLength={100}
                                disabled={savingName}
                                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-md px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <button onClick={() => void saveName()} disabled={savingName} aria-label="Save name" className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"><Check className="w-4 h-4" /></button>
                            <button onClick={() => { setEditing(false); setNameInput(connector.displayName); }} disabled={savingName} aria-label="Cancel rename" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                        </span>
                    ) : (
                        <>
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">{connector.displayName}</p>
                            <button onClick={() => { setNameInput(connector.displayName); setEditing(true); }} aria-label="Rename connector" className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"><Pencil className="w-3 h-3" /></button>
                        </>
                    )}
                    {badge}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                    {connector.category.replace("_", " ")} · {connector.authMethod.replace(/_/g, " ")}
                </p>
                {connector.lastHealthcheckAt && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        Last checked: {new Date(connector.lastHealthcheckAt).toLocaleString()}
                    </p>
                )}
                {connector.lastErrorClass && (
                    <p className="text-xs text-rose-500">{connector.lastErrorClass.replace(/_/g, " ")}</p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {healthResult !== null && !healthResult.healthy && healthResult.nextStep?.oauthInitUrl && (
                    <button
                        onClick={() => { if (healthResult.nextStep?.oauthInitUrl) window.location.href = healthResult.nextStep.oauthInitUrl; }}
                        className="text-xs border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 rounded-lg px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                    >Re-auth</button>
                )}
                <button
                    onClick={runHealthCheck}
                    disabled={checking}
                    className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                >
                    <RefreshCw className="w-3 h-3" />
                    {checking ? "Checking…" : "Test"}
                </button>
                <button
                    onClick={onRemove}
                    className="flex items-center gap-1 text-xs border border-rose-200 dark:border-rose-900 text-rose-500 dark:text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
                >
                    <Trash2 className="w-3 h-3" />
                    Remove
                </button>
            </div>
        </div>
    );
}

// ── Available Connector Card ───────────────────────────────────────────────
function AvailableCard({
    connector,
    configuredStatus,
    onAdd,
}: {
    connector: AvailableConnector;
    configuredStatus: ConnectorStatus | null;
    onAdd: () => void;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <ConnectorIcon tool={connector.tool} size={32} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{connector.displayName}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {connector.supportedActions.length} {connector.supportedActions.length === 1 ? "action" : "actions"} · {connector.authMethod.replace(/_/g, " ")}
                </p>
            </div>
            {connector.connected ? (
                configuredStatus === "error" || configuredStatus === "pending_auth" ? (
                    <button onClick={onAdd} className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition font-medium">
                        Reconnect
                    </button>
                ) : (
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5 font-medium">
                        Connected
                    </span>
                )
            ) : (
                <button onClick={onAdd} className="flex items-center gap-1 text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition font-medium">
                    <Plus className="w-3 h-3" />
                    Add
                </button>
            )}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function DashboardIntegrationsPage() {
    const [configured, setConfigured] = useState<ConfiguredConnector[]>([]);
    const [available, setAvailable] = useState<AvailableConnector[]>([]);
    const [context, setContext] = useState<ConnectorContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<ConnectorCategory | "all">("all");
    const [addingConnector, setAddingConnector] = useState<AvailableConnector | null>(null);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const selectedWorkspaceId = context?.selectedWorkspaceId ?? null;
    const selectedBotId = context?.selectedBotId ?? null;

    function showToast(message: string, type: "success" | "error" = "success") {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }

    async function loadConnectors(scope?: { workspaceId?: string | null; botId?: string | null }) {
        try {
            const workspaceId = scope?.workspaceId ?? selectedWorkspaceId;
            const botId = scope?.botId ?? selectedBotId;
            const params = new URLSearchParams();
            if (workspaceId) params.set("workspaceId", workspaceId);
            if (botId) params.set("botId", botId);
            const endpoint = params.size > 0 ? `/api/connectors?${params.toString()}` : "/api/connectors";
            const res = await fetch(endpoint);
            if (res.ok) {
                const data = await res.json() as { configured?: ConfiguredConnector[]; available?: AvailableConnector[]; context?: ConnectorContext };
                setConfigured(data.configured ?? []);
                // Merge live API available list with static catalog:
                // API entry wins (has live connected status + correct configSchema from gateway);
                // static catalog fills any gaps the gateway didn't return.
                const liveAvailable = data.available ?? [];
                const liveTools = new Set(liveAvailable.map((c) => c.tool));
                const merged = [
                    ...liveAvailable,
                    ...STATIC_CONNECTOR_CATALOG.filter((c) => !liveTools.has(c.tool)),
                ];
                setAvailable(merged);
                if (data.context) setContext(data.context);
            } else {
                // Gateway unavailable — fall back to static catalog so the page is
                // never empty. Configured list stays empty (unknown live state).
                setAvailable(STATIC_CONNECTOR_CATALOG);
            }
        } catch {
            setAvailable(STATIC_CONNECTOR_CATALOG);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const stored = window.localStorage.getItem("agentfarm_connectors_selected_bot");
        if (!stored) { void loadConnectors(); return; }
        try {
            const parsed = JSON.parse(stored) as { workspaceId?: string; botId?: string };
            void loadConnectors({ workspaceId: parsed.workspaceId ?? null, botId: parsed.botId ?? null });
        } catch { void loadConnectors(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedWorkspaceId || !selectedBotId) return;
        window.localStorage.setItem("agentfarm_connectors_selected_bot", JSON.stringify({ workspaceId: selectedWorkspaceId, botId: selectedBotId }));
    }, [selectedWorkspaceId, selectedBotId]);

    function handleScopeChange(value: string) {
        const [workspaceId, botId] = value.split("::");
        if (!workspaceId || !botId) return;
        void loadConnectors({ workspaceId, botId });
    }

    async function handleRemove(connectorId: string, name: string) {
        if (!confirm(`Remove "${name}"? Your agent will lose access to this tool.`)) return;
        const params = new URLSearchParams();
        if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
        const res = await fetch(`/api/connectors/${connectorId}${params.size > 0 ? `?${params.toString()}` : ""}`, { method: "DELETE" });
        if (res.ok) { showToast(`"${name}" removed.`); await loadConnectors(); }
        else showToast("Failed to remove connector.", "error");
    }

    async function handleRename(connectorId: string, displayName: string) {
        const res = await fetch(`/api/connectors/${connectorId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ displayName }),
        });
        if (res.ok) { showToast(`Renamed to "${displayName}".`); await loadConnectors(); }
        else { showToast("Failed to rename connector.", "error"); }
    }

    async function handleHealthCheck(connectorId: string): Promise<HealthCheckResult> {
        const params = new URLSearchParams();
        if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
        const res = await fetch(`/api/connectors/${connectorId}/health${params.size > 0 ? `?${params.toString()}` : ""}`, { method: "POST" });
        const json = await res.json() as HealthCheckResult;
        showToast(json.healthy ? (json.message ?? "Connector is healthy.") : (json.message ?? "Check failed."), json.healthy ? "success" : "error");
        await loadConnectors();
        return json;
    }

    const filteredAvailable = available.filter((c) => activeCategory === "all" || c.category === activeCategory);

    const customToolByCategory: Record<ConnectorCategory, string> = {
        task_tracker: "generic_rest", messaging: "generic_rest_messaging",
        code: "generic_rest_code", email: "generic_rest_email",
        monitoring: "generic_rest", crm: "generic_rest",
        ats: "generic_rest", cms: "generic_rest", cloud: "generic_rest",
    };

    const getPreferredCustomConnector = (): AvailableConnector | undefined =>
        activeCategory !== "all"
            ? available.find((c) => c.tool === customToolByCategory[activeCategory])
            : (available.find((c) => c.tool === "generic_rest") ?? available.find((c) => c.tool.startsWith("generic_rest")));

    const groupedAvailable = CATEGORY_ORDER.reduce<Record<ConnectorCategory, AvailableConnector[]>>(
        (acc, cat) => { acc[cat] = filteredAvailable.filter((c) => c.category === cat); return acc; },
        {} as Record<ConnectorCategory, AvailableConnector[]>,
    );

    const selectedBot = context?.options.find((o) => o.workspaceId === selectedWorkspaceId && o.botId === selectedBotId) ?? context?.options[0] ?? null;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.message}
                </div>
            )}

            {/* Add connector modal */}
            {addingConnector && (
                <AddConnectorModal
                    connector={addingConnector}
                    workspaceId={selectedWorkspaceId}
                    botId={selectedBotId}
                    onClose={() => setAddingConnector(null)}
                    onAdded={() => { showToast(`${addingConnector.displayName} added successfully.`); void loadConnectors(); }}
                />
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-400">
                                <Link2 className="w-3.5 h-3.5" />
                                Integrations
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Connectors</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Integrations</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">
                                    Connect tools so your agent can work across your entire stack.
                                    {available.length > 0 && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                                            {available.length} connectors available
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Connector showcase */}
                {!loading && available.length > 0 && (
                    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Supported tools</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">All tools your agent can connect to. More added every sprint.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                            {available.slice(0, 16).map((c) => (
                                <div key={c.tool} className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-default">
                                    <ConnectorIcon tool={c.tool} size={26} />
                                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 text-center leading-none">{c.displayName}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Bot scope selector */}
                {context && context.options.length > 0 && (
                    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Connector scope</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Connectors are scoped per workspace and filtered by bot role policy.</p>
                                </div>
                            </div>
                            <select
                                value={`${context.selectedWorkspaceId}::${context.selectedBotId}`}
                                onChange={(e) => handleScopeChange(e.target.value)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                aria-label="Select workspace bot"
                            >
                                {context.options.map((o) => (
                                    <option key={`${o.workspaceId}::${o.botId}`} value={`${o.workspaceId}::${o.botId}`}>
                                        {o.workspaceName} — {o.botName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedBot && (
                            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                                <span>Role: <strong className="text-slate-700 dark:text-slate-300">{context.selectedRoleKey}</strong></span>
                                <span>Policy: <strong className="text-slate-700 dark:text-slate-300">{selectedBot.policyPackVersion}</strong></span>
                                {context.disallowed_tools_hidden_count > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400">{context.disallowed_tools_hidden_count} tools hidden by policy</span>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* Connected tools */}
                {configured.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide mb-3">
                            Connected Tools <span className="font-normal text-slate-400 dark:text-slate-500 normal-case">({configured.length})</span>
                        </h2>
                        <div className="space-y-2">
                            {configured.map((c) => (
                                <ConnectorRow
                                    key={c.connectorId}
                                    connector={c}
                                    onRemove={() => void handleRemove(c.connectorId, c.displayName)}
                                    onHealthCheck={() => handleHealthCheck(c.connectorId)}
                                    onRename={(newName) => handleRename(c.connectorId, newName)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Empty state */}
                {!loading && configured.length === 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
                        <div className="text-4xl mb-3">🔌</div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">No tools connected yet</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Add an integration below to let your agent work across your stack.</p>
                    </div>
                )}

                {/* Available integrations */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Available Integrations</h2>
                    </div>

                    {/* Category filter */}
                    <div className="flex gap-2 mb-5 flex-wrap">
                        {(["all", ...CATEGORY_ORDER] as const).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`text-xs rounded-full px-3 py-1.5 border font-medium transition ${activeCategory === cat
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                                    }`}
                            >
                                {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                                        <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {CATEGORY_ORDER.map((cat) => {
                                const items = groupedAvailable[cat];
                                if (!items || items.length === 0) return null;
                                return (
                                    <div key={cat}>
                                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {items.map((c) => (
                                                <AvailableCard
                                                    key={c.tool}
                                                    connector={c}
                                                    configuredStatus={configured.find((cc) => cc.tool === c.tool)?.status ?? null}
                                                    onAdd={() => setAddingConnector(c)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Custom API callout */}
                <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                    <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-2xl">🔌</div>
                        <div className="flex-1">
                            <p className="font-bold text-slate-900 dark:text-slate-100">Using a custom or internal tool?</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                Any tool with a REST API can be connected using category-specific Custom REST connectors for tasks, messaging, code, and email.
                            </p>
                        </div>
                        <button
                            onClick={() => { const g = getPreferredCustomConnector(); if (g) setAddingConnector(g); }}
                            className="flex items-center gap-1.5 shrink-0 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Custom API
                        </button>
                    </div>
                </section>

            </div>
        </div>
    );
}
