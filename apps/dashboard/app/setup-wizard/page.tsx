'use client';

/**
 * Sprint 3 â€” Setup Wizard Page (complete)
 *
 * Five-step self-service onboarding wizard for hiring companies.
 * Steps: select_role â†’ connect_tools â†’ configure_persona â†’ set_approval_rules â†’ deploy
 *
 * Supports ?role=<roleKey> URL param to pre-select a role and skip step 1.
 * Calls the Next.js proxy routes at /api/setup-wizard/... (never the gateway directly).
 */

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

type SetupStep = 'select_role' | 'connect_tools' | 'configure_persona' | 'set_approval_rules' | 'deploy';

const STEPS: { id: SetupStep; label: string }[] = [
    { id: 'select_role', label: 'Select Role' },
    { id: 'connect_tools', label: 'Connect Tools' },
    { id: 'configure_persona', label: 'Agent Persona' },
    { id: 'set_approval_rules', label: 'Approval Rules' },
    { id: 'deploy', label: 'Deploy' },
];

// ---------------------------------------------------------------------------
// Roles catalog
// ---------------------------------------------------------------------------

type RoleEntry = { key: string; label: string; description: string; category: string };

const AVAILABLE_ROLES: RoleEntry[] = [
    { key: 'developer', label: 'Developer', description: 'Writes and reviews code, opens PRs, fixes bugs', category: 'Engineering' },
    { key: 'fullstack_developer', label: 'Full Stack Developer', description: 'Frontend + backend development', category: 'Engineering' },
    { key: 'tester', label: 'Tester', description: 'Runs test suites, reports failures, tracks coverage', category: 'Engineering' },
    { key: 'business_analyst', label: 'Business Analyst', description: 'Requirements gathering, Jira, specs', category: 'Product' },
    { key: 'technical_writer', label: 'Technical Writer', description: 'Writes docs, changelogs, API references', category: 'Product' },
    { key: 'content_writer', label: 'Content Writer', description: 'Blog posts, social content, CMS management', category: 'Marketing' },
    { key: 'sales_rep', label: 'Sales Representative', description: 'Manages leads, sends outreach, books demos', category: 'Sales' },
    { key: 'marketing_specialist', label: 'Marketing Specialist', description: 'Campaigns, analytics, CMS', category: 'Marketing' },
    { key: 'corporate_assistant', label: 'Corporate Assistant', description: 'Calendar, email, meetings, scheduling', category: 'Operations' },
    { key: 'customer_support_executive', label: 'Customer Support', description: 'Voice / chat / email support, ticket routing', category: 'Support' },
    { key: 'recruiter', label: 'Recruiter', description: 'Sourcing, screening, ATS management', category: 'HR' },
    {
        key: 'project_manager_product_owner_scrum_master',
        label: 'Project Manager / Scrum Master',
        description: 'Sprints, standups, Jira backlog management',
        category: 'Operations',
    },
];

// ---------------------------------------------------------------------------
// Connector catalog (mirrors managed-mcp-catalog.ts in api-gateway)
// ---------------------------------------------------------------------------

type ConnectorFieldType = 'secret' | 'text' | 'url';

type CatalogField = {
    name: string;
    label: string;
    type: ConnectorFieldType;
    placeholder?: string;
    helpText?: string;
    required: boolean;
};

type CatalogEntry = {
    id: string;
    displayName: string;
    authType: 'api_token' | 'oauth' | 'basic';
    fields: CatalogField[];
};

const CONNECTOR_CATALOG: CatalogEntry[] = [
    {
        id: 'github',
        displayName: 'GitHub',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'Personal Access Token', type: 'secret', placeholder: 'ghp_\u2026', helpText: 'Needs repo + read:org scopes.', required: true },
            { name: 'default_owner', label: 'Default owner / org', type: 'text', placeholder: 'my-org', required: false },
            { name: 'default_repo', label: 'Default repository', type: 'text', placeholder: 'my-repo', required: false },
        ],
    },
    {
        id: 'jira',
        displayName: 'Jira',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'API Token', type: 'secret', placeholder: 'ATATT3x\u2026', helpText: 'Generate at id.atlassian.com \u2192 Security \u2192 API tokens.', required: true },
            { name: 'email', label: 'Account email', type: 'text', placeholder: 'you@company.com', helpText: 'The email address of the API token owner.', required: true },
            { name: 'base_url', label: 'Jira base URL', type: 'url', placeholder: 'https://mycompany.atlassian.net', required: true },
        ],
    },
    {
        id: 'slack',
        displayName: 'Slack',
        authType: 'oauth',
        fields: [
            { name: 'token', label: 'Bot Token', type: 'secret', placeholder: 'xoxb-\u2026', helpText: 'OAuth bot token from your Slack app settings.', required: true },
        ],
    },
    {
        id: 'linear',
        displayName: 'Linear',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'API Key', type: 'secret', placeholder: 'lin_api_\u2026', required: true },
        ],
    },
    {
        id: 'notion',
        displayName: 'Notion',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'Integration Secret', type: 'secret', placeholder: 'secret_\u2026', required: true },
        ],
    },
    {
        id: 'salesforce',
        displayName: 'Salesforce',
        authType: 'oauth',
        fields: [
            { name: 'token', label: 'Access Token', type: 'secret', placeholder: '00Dxx\u2026', required: true },
            { name: 'instance_url', label: 'Instance URL', type: 'url', placeholder: 'https://myorg.my.salesforce.com', required: true },
        ],
    },
    // ---- QA / Testing tools ------------------------------------------------
    {
        id: 'testrail',
        displayName: 'TestRail',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'API Key', type: 'secret', placeholder: 'your-testrail-api-key', helpText: 'Generate at My Settings \u2192 API Keys in your TestRail instance.', required: true },
            { name: 'base_url', label: 'TestRail URL', type: 'url', placeholder: 'https://mycompany.testrail.io', required: true },
        ],
    },
    {
        id: 'zephyr',
        displayName: 'Zephyr Scale',
        authType: 'api_token',
        fields: [
            { name: 'token', label: 'API Token', type: 'secret', placeholder: 'your-zephyr-token', helpText: 'Create a Zephyr Scale API access token in Jira user settings.', required: true },
            { name: 'jira_base_url', label: 'Jira Base URL', type: 'url', placeholder: 'https://mycompany.atlassian.net', required: true },
            { name: 'project_key', label: 'Jira Project Key', type: 'text', placeholder: 'PROJ', required: false },
        ],
    },
    {
        id: 'newman',
        displayName: 'Newman / Postman',
        authType: 'api_token',
        fields: [
            { name: 'api_key', label: 'Postman API Key', type: 'secret', placeholder: 'PMAK-\u2026', helpText: 'Optional — required only if the agent should import collections from Postman cloud.', required: false },
        ],
    },
    {
        id: 'owasp_zap',
        displayName: 'OWASP ZAP',
        authType: 'api_token',
        fields: [
            { name: 'api_key', label: 'ZAP API Key', type: 'secret', placeholder: 'changeme', helpText: 'Set via ZAP -config api.key=<key> or in zap.xml.', required: true },
            { name: 'zap_url', label: 'ZAP Base URL', type: 'url', placeholder: 'http://localhost:8080', helpText: 'URL of the running ZAP daemon (REST API).', required: true },
        ],
    },
    {
        id: 'burpsuite',
        displayName: 'Burp Suite',
        authType: 'api_token',
        fields: [
            { name: 'api_key', label: 'REST API Key', type: 'secret', placeholder: 'your-burp-api-key', helpText: 'Enable the REST API in Burp Suite Pro under User options \u2192 Suite \u2192 REST API.', required: true },
            { name: 'burp_url', label: 'Burp URL', type: 'url', placeholder: 'http://localhost:1337', required: true },
        ],
    },
    {
        id: 'appium',
        displayName: 'Appium Server',
        authType: 'basic',
        fields: [
            { name: 'server_url', label: 'Appium Server URL', type: 'url', placeholder: 'http://localhost:4723', helpText: 'URL of your Appium server. Leave as default if running in the agent VM.', required: true },
        ],
    },
    {
        id: 'google_meet',
        displayName: 'Google Meet',
        authType: 'oauth',
        fields: [
            { name: 'client_id', label: 'OAuth Client ID', type: 'secret', placeholder: 'your-google-client-id', helpText: 'Create an OAuth 2.0 Client ID in Google Cloud Console with Calendar and Meet scopes.', required: true },
            { name: 'client_secret', label: 'OAuth Client Secret', type: 'secret', placeholder: 'your-google-client-secret', required: true },
        ],
    },
    {
        id: 'microsoft_teams',
        displayName: 'Microsoft Teams',
        authType: 'oauth',
        fields: [
            { name: 'tenant_id', label: 'Azure Tenant ID', type: 'text', placeholder: 'your-tenant-id', required: true },
            { name: 'client_id', label: 'App Registration Client ID', type: 'secret', placeholder: 'your-client-id', required: true },
            { name: 'client_secret', label: 'App Registration Secret', type: 'secret', placeholder: 'your-client-secret', required: true },
        ],
    },
    {
        id: 'zoom',
        displayName: 'Zoom',
        authType: 'oauth',
        fields: [
            { name: 'account_id', label: 'Zoom Account ID', type: 'text', placeholder: 'your-account-id', required: true },
            { name: 'client_id', label: 'OAuth Client ID', type: 'secret', placeholder: 'your-zoom-client-id', helpText: 'Create a Server-to-Server OAuth app in the Zoom App Marketplace.', required: true },
            { name: 'client_secret', label: 'OAuth Client Secret', type: 'secret', placeholder: 'your-zoom-client-secret', required: true },
        ],
    },
];

// ---------------------------------------------------------------------------
// Role-aware connector suggestions (shown as a hint in step 2)
// ---------------------------------------------------------------------------

const ROLE_SUGGESTED_CONNECTORS: Record<string, string[]> = {
    tester: ['github', 'jira', 'testrail', 'zephyr', 'newman', 'owasp_zap', 'google_meet', 'microsoft_teams', 'zoom'],
    developer: ['github', 'jira', 'slack', 'linear'],
    fullstack_developer: ['github', 'jira', 'slack'],
    business_analyst: ['jira', 'notion', 'slack'],
    sales_rep: ['salesforce', 'slack'],
    recruiter: ['slack'],
    project_manager_product_owner_scrum_master: ['jira', 'slack', 'linear'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectorEntry = {
    name: string;
    displayName: string;
    authType: 'api_token' | 'oauth' | 'basic';
};

type WizardState = {
    sessionId: string | null;
    currentStepIndex: number;
    // Step 1
    selectedRole: string;
    // Step 2
    selectedConnectors: ConnectorEntry[];
    connectorCredentials: Record<string, Record<string, string>>;
    // Step 3
    displayName: string;
    emailAddress: string;
    communicationStyle: 'professional' | 'friendly' | 'concise' | 'formal';
    disclosureStatement: string;
    // Step 4
    highRiskRequiresApproval: boolean;
    mediumRiskRequiresApproval: boolean;
    approvalTimeoutSeconds: number;
    // UI
    submitting: boolean;
    error: string | null;
    completed: boolean;
};

// ---------------------------------------------------------------------------
// Stepper indicator
// ---------------------------------------------------------------------------

function StepIndicator({
    steps,
    currentIndex,
}: {
    steps: typeof STEPS;
    currentIndex: number;
}) {
    return (
        <ol className="flex items-center gap-0 mb-10">
            {steps.map((step, idx) => {
                const done = idx < currentIndex;
                const active = idx === currentIndex;
                return (
                    <li key={step.id} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${done
                                    ? 'bg-green-600 border-green-600 text-white'
                                    : active
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'bg-white border-gray-300 text-gray-400'
                                    }`}
                            >
                                {done ? '\u2713' : idx + 1}
                            </div>
                            <span
                                className={`mt-1 text-xs text-center ${active ? 'text-blue-600 font-semibold' : done ? 'text-green-600' : 'text-gray-400'
                                    }`}
                            >
                                {step.label}
                            </span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`h-0.5 flex-1 mx-1 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

// ---------------------------------------------------------------------------
// Step 1: Select Role
// ---------------------------------------------------------------------------

function SelectRoleStep({
    selectedRole,
    onChange,
}: {
    selectedRole: string;
    onChange: (role: string) => void;
}) {
    return (
        <div>
            <h2 className="text-lg font-semibold mb-2">Choose an Agent Role</h2>
            <p className="text-sm text-gray-500 mb-5">
                Each role comes pre-configured with the right tools and default approval policies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AVAILABLE_ROLES.map((r) => (
                    <button
                        key={r.key}
                        type="button"
                        onClick={() => onChange(r.key)}
                        className={`text-left p-3 rounded-lg border-2 transition-colors ${selectedRole === r.key
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-400'
                            }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">{r.label}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                                {r.category}
                            </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{r.description}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 2: Connect Tools
// ---------------------------------------------------------------------------

function ConnectToolsStep({
    selected,
    credentials,
    onToggle,
    onCredentialChange,
    selectedRole,
}: {
    selected: ConnectorEntry[];
    credentials: Record<string, Record<string, string>>;
    onToggle: (connector: ConnectorEntry) => void;
    onCredentialChange: (connectorId: string, fieldName: string, value: string) => void;
    selectedRole: string;
}) {
    const isSelected = (id: string) => selected.some((c) => c.name === id);
    const suggestedIds = ROLE_SUGGESTED_CONNECTORS[selectedRole] ?? [];
    const roleLabel = AVAILABLE_ROLES.find((r) => r.key === selectedRole)?.label ?? selectedRole;

    return (
        <div>
            <h2 className="text-lg font-semibold mb-2">Connect Tools</h2>
            <p className="text-sm text-gray-500 mb-4">
                Select tools for this agent to access. Credentials are stored encrypted and never logged.
            </p>
            {suggestedIds.length > 0 && (
                <div className="mb-4 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    <span className="font-semibold">Recommended for {roleLabel}:</span>{' '}
                    {suggestedIds
                        .map((id) => CONNECTOR_CATALOG.find((c) => c.id === id)?.displayName)
                        .filter(Boolean)
                        .join(', ')}
                </div>
            )}
            <div className="space-y-2">
                {CONNECTOR_CATALOG.map((entry) => {
                    const checked = isSelected(entry.id);
                    const isSuggested = suggestedIds.includes(entry.id);
                    const creds = credentials[entry.id] ?? {};
                    const requiredFields = entry.fields.filter((f) => f.required);
                    const optionalFields = entry.fields.filter((f) => !f.required);

                    return (
                        <div
                            key={entry.id}
                            className={`rounded-lg border-2 transition-colors ${checked ? 'border-blue-500' : isSuggested ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                                }`}
                        >
                            <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                        onToggle({
                                            name: entry.id,
                                            displayName: entry.displayName,
                                            authType: entry.authType,
                                        })
                                    }
                                    className="w-4 h-4 accent-blue-600 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium text-sm">{entry.displayName}</span>
                                    <span className="ml-2 text-xs text-gray-400">{entry.authType}</span>
                                    {isSuggested && !checked && (
                                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">Suggested</span>
                                    )}
                                </div>
                            </label>

                            {checked && (
                                <div className="px-4 pb-4 space-y-3 border-t border-blue-100 bg-blue-50/30 rounded-b-lg">
                                    {requiredFields.length > 0 && (
                                        <p className="text-xs font-medium text-gray-500 pt-3">Required credentials</p>
                                    )}
                                    {requiredFields.map((field) => (
                                        <div key={field.name}>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                {field.label} <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type={
                                                    field.type === 'secret'
                                                        ? 'password'
                                                        : field.type === 'url'
                                                            ? 'url'
                                                            : 'text'
                                                }
                                                value={creds[field.name] ?? ''}
                                                onChange={(e) =>
                                                    onCredentialChange(entry.id, field.name, e.target.value)
                                                }
                                                placeholder={field.placeholder ?? ''}
                                                autoComplete="off"
                                                className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            {field.helpText && (
                                                <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>
                                            )}
                                        </div>
                                    ))}
                                    {optionalFields.length > 0 && (
                                        <p className="text-xs font-medium text-gray-500 pt-1">Optional</p>
                                    )}
                                    {optionalFields.map((field) => (
                                        <div key={field.name}>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                {field.label}
                                            </label>
                                            <input
                                                type={
                                                    field.type === 'secret'
                                                        ? 'password'
                                                        : field.type === 'url'
                                                            ? 'url'
                                                            : 'text'
                                                }
                                                value={creds[field.name] ?? ''}
                                                onChange={(e) =>
                                                    onCredentialChange(entry.id, field.name, e.target.value)
                                                }
                                                placeholder={field.placeholder ?? ''}
                                                autoComplete="off"
                                                className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {selected.length === 0 && (
                <p className="mt-3 text-xs text-amber-600">Select at least one connector to continue.</p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 3: Configure Persona
// ---------------------------------------------------------------------------

function ConfigurePersonaStep({
    displayName,
    emailAddress,
    communicationStyle,
    disclosureStatement,
    onChangeName,
    onChangeEmail,
    onChangeStyle,
    onChangeDisclosure,
}: {
    displayName: string;
    emailAddress: string;
    communicationStyle: string;
    disclosureStatement: string;
    onChangeName: (v: string) => void;
    onChangeEmail: (v: string) => void;
    onChangeStyle: (v: string) => void;
    onChangeDisclosure: (v: string) => void;
}) {
    return (
        <div>
            <h2 className="text-lg font-semibold mb-2">Configure Agent Persona</h2>
            <p className="text-sm text-gray-500 mb-5">
                Give your agent an identity. It uses this name and email when communicating with your team
                and external parties.
            </p>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => onChangeName(e.target.value)}
                        placeholder="e.g. Alex (Developer Agent)"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="email"
                        value={emailAddress}
                        onChange={(e) => onChangeEmail(e.target.value)}
                        placeholder="e.g. alex-dev@company.ai"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Appears in notifications and outbound messages sent by the agent.
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Communication Style
                    </label>
                    <select
                        value={communicationStyle}
                        onChange={(e) => onChangeStyle(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="professional">Professional &mdash; balanced and business-appropriate</option>
                        <option value="friendly">Friendly &mdash; warm and approachable</option>
                        <option value="concise">Concise &mdash; brief, direct, minimal prose</option>
                        <option value="formal">Formal &mdash; formal language, no contractions</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Disclosure Statement
                    </label>
                    <textarea
                        value={disclosureStatement}
                        onChange={(e) => onChangeDisclosure(e.target.value)}
                        rows={2}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Appended to outbound emails and messages. Required in many jurisdictions (EU AI Act, FTC).
                    </p>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 4: Set Approval Rules
// ---------------------------------------------------------------------------

function SetApprovalRulesStep({
    highRisk,
    mediumRisk,
    timeoutSeconds,
    onChangeHighRisk,
    onChangeMediumRisk,
    onChangeTimeout,
}: {
    highRisk: boolean;
    mediumRisk: boolean;
    timeoutSeconds: number;
    onChangeHighRisk: (v: boolean) => void;
    onChangeMediumRisk: (v: boolean) => void;
    onChangeTimeout: (v: number) => void;
}) {
    return (
        <div>
            <h2 className="text-lg font-semibold mb-2">Set Approval Rules</h2>
            <p className="text-sm text-gray-500 mb-5">
                Choose when this agent must wait for a human to approve an action before it executes.
            </p>
            <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={highRisk}
                        onChange={(e) => onChangeHighRisk(e.target.checked)}
                        className="w-4 h-4 mt-0.5 accent-blue-600 shrink-0"
                    />
                    <div>
                        <div className="font-medium text-sm">High-risk actions require approval</div>
                        <div className="text-xs text-gray-400">
                            e.g. deploy to production, delete records, send mass emails
                        </div>
                    </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={mediumRisk}
                        onChange={(e) => onChangeMediumRisk(e.target.checked)}
                        className="w-4 h-4 mt-0.5 accent-blue-600 shrink-0"
                    />
                    <div>
                        <div className="font-medium text-sm">Medium-risk actions require approval</div>
                        <div className="text-xs text-gray-400">
                            e.g. open pull requests, post to Slack, create Jira tickets
                        </div>
                    </div>
                </label>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Approval timeout (seconds)
                    </label>
                    <input
                        type="number"
                        min={60}
                        value={timeoutSeconds}
                        onChange={(e) => onChangeTimeout(Math.max(60, Number(e.target.value)))}
                        className="block w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        If unanswered within this window the action is auto-skipped. Minimum 60 s.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 5: Deploy
// ---------------------------------------------------------------------------

function DeployStep({
    completed,
    selectedRole,
    displayName,
    connectors,
}: {
    completed: boolean;
    selectedRole: string;
    displayName: string;
    connectors: ConnectorEntry[];
}) {
    const roleLabel = AVAILABLE_ROLES.find((r) => r.key === selectedRole)?.label ?? selectedRole;

    if (completed) {
        return (
            <div className="text-center py-6">
                <div className="text-5xl mb-4">&#x1F680;</div>
                <h2 className="text-xl font-semibold mb-2 text-green-700">Agent Deployed!</h2>
                <p className="text-sm text-gray-600 max-w-sm mx-auto">
                    <strong>{displayName}</strong> is being provisioned as a{' '}
                    <strong>{roleLabel}</strong> agent. It will appear in the Agents list within a few
                    minutes. Track status in the Activity feed.
                </p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4">Review &amp; Deploy</h2>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm mb-4">
                <div className="flex px-4 py-3 gap-4">
                    <span className="text-gray-500 w-32 shrink-0">Role</span>
                    <span className="font-medium">{roleLabel}</span>
                </div>
                <div className="flex px-4 py-3 gap-4">
                    <span className="text-gray-500 w-32 shrink-0">Agent name</span>
                    <span className="font-medium">{displayName || '\u2014'}</span>
                </div>
                <div className="flex px-4 py-3 gap-4">
                    <span className="text-gray-500 w-32 shrink-0">Connectors</span>
                    <span className="font-medium">
                        {connectors.length === 0
                            ? '\u2014'
                            : connectors.map((c) => c.displayName).join(', ')}
                    </span>
                </div>
            </div>
            <p className="text-sm text-gray-500">
                Click <strong>Deploy Agent</strong> to provision a dedicated VM and activate this agent.
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main wizard content (uses useSearchParams â€” must be inside Suspense)
// ---------------------------------------------------------------------------

function WizardContent() {
    const searchParams = useSearchParams();
    const roleFromUrl = searchParams.get('role') ?? '';

    const [state, setState] = useState<WizardState>({
        sessionId: null,
        currentStepIndex: roleFromUrl ? 1 : 0,
        selectedRole: roleFromUrl,
        selectedConnectors: [],
        connectorCredentials: {},
        displayName: '',
        emailAddress: '',
        communicationStyle: 'professional',
        disclosureStatement: 'This message was sent by an AI agent.',
        highRiskRequiresApproval: true,
        mediumRiskRequiresApproval: false,
        approvalTimeoutSeconds: 300,
        submitting: false,
        error: null,
        completed: false,
    });

    const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }));

    // -----------------------------------------------------------------------
    // API helpers â€” all via Next.js proxy routes
    // -----------------------------------------------------------------------

    const startSession = async (initialRoleKey?: string): Promise<string> => {
        const res = await fetch('/api/setup-wizard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(initialRoleKey ? { initialRoleKey } : {}),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string };
            throw new Error(body.error ?? 'Failed to start wizard session');
        }
        const data = (await res.json()) as { session: { id: string } };
        return data.session.id;
    };

    const advanceStep = async (
        sessionId: string,
        nextStep: SetupStep,
        payload: unknown,
    ): Promise<void> => {
        const res = await fetch(`/api/setup-wizard/${sessionId}/step`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ step: nextStep, payload }),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({ error: 'unknown' }))) as {
                error?: string;
                reason?: string;
            };
            throw new Error(body.reason ?? body.error ?? 'Step validation failed');
        }
    };

    const completeWizard = async (sessionId: string): Promise<void> => {
        const res = await fetch(`/api/setup-wizard/${sessionId}/complete`, {
            method: 'POST',
            credentials: 'include',
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({ error: 'unknown' }))) as {
                error?: string;
                message?: string;
            };
            throw new Error(body.message ?? body.error ?? 'Completion failed');
        }
    };

    // Best-effort: connector enable failures are non-fatal â€” user can reconnect from settings
    const enableConnectors = async (
        connectors: ConnectorEntry[],
        credentials: Record<string, Record<string, string>>,
    ): Promise<void> => {
        await Promise.allSettled(
            connectors.map((c) =>
                fetch(`/api/mcp/catalog/${c.name}/enable`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(credentials[c.name] ?? {}),
                }),
            ),
        );
    };

    // -----------------------------------------------------------------------
    // Step payloads
    // -----------------------------------------------------------------------

    const buildPayloadForCurrentStep = (): unknown => {
        const stepId = STEPS[state.currentStepIndex].id;
        switch (stepId) {
            case 'select_role':
                return { roleKey: state.selectedRole };
            case 'connect_tools':
                return {
                    connectors: state.selectedConnectors.map((c) => ({
                        name: c.name,
                        displayName: c.displayName,
                        authType: c.authType,
                    })),
                };
            case 'configure_persona':
                return {
                    displayName: state.displayName.trim(),
                    emailAddress: state.emailAddress.trim(),
                    communicationStyle: state.communicationStyle,
                    disclosureStatement: state.disclosureStatement.trim(),
                };
            case 'set_approval_rules':
                return {
                    approvalPolicy: {
                        highRiskRequiresApproval: state.highRiskRequiresApproval,
                        mediumRiskRequiresApproval: state.mediumRiskRequiresApproval,
                        approvalTimeoutSeconds: state.approvalTimeoutSeconds,
                    },
                };
            case 'deploy':
                return {};
        }
    };

    // -----------------------------------------------------------------------
    // "Next" button enabled state
    // -----------------------------------------------------------------------

    const canAdvance = (): boolean => {
        const stepId = STEPS[state.currentStepIndex].id;
        switch (stepId) {
            case 'select_role':
                return state.selectedRole !== '';
            case 'connect_tools': {
                if (state.selectedConnectors.length === 0) return false;
                return state.selectedConnectors.every((c) => {
                    const entry = CONNECTOR_CATALOG.find((e) => e.id === c.name);
                    if (!entry) return true;
                    const creds = state.connectorCredentials[c.name] ?? {};
                    return entry.fields
                        .filter((f) => f.required)
                        .every((f) => (creds[f.name] ?? '').trim() !== '');
                });
            }
            case 'configure_persona':
                return state.displayName.trim() !== '' && state.emailAddress.trim() !== '';
            case 'set_approval_rules':
                return state.approvalTimeoutSeconds >= 60;
            case 'deploy':
                return !state.completed;
        }
    };

    // -----------------------------------------------------------------------
    // Navigation handlers
    // -----------------------------------------------------------------------

    const handleNext = async () => {
        update({ error: null, submitting: true });
        try {
            const currentStepId = STEPS[state.currentStepIndex].id;

            let { sessionId } = state;

            // Start session on first submission â€” pass initialRoleKey when role came from URL
            if (!sessionId) {
                const initialRoleKey =
                    currentStepId === 'connect_tools' ? state.selectedRole : undefined;
                sessionId = await startSession(initialRoleKey);
                update({ sessionId });
            }

            if (currentStepId === 'deploy') {
                await completeWizard(sessionId!);
                update({ completed: true, submitting: false });
                return;
            }

            if (currentStepId === 'connect_tools') {
                await enableConnectors(state.selectedConnectors, state.connectorCredentials);
            }

            const nextStep = STEPS[state.currentStepIndex + 1].id;
            const payload = buildPayloadForCurrentStep();
            await advanceStep(sessionId!, nextStep, payload);
            update({ currentStepIndex: state.currentStepIndex + 1, submitting: false });
        } catch (err) {
            update({ error: (err as Error).message, submitting: false });
        }
    };

    const handleBack = () => {
        if (state.currentStepIndex > 0) {
            update({ currentStepIndex: state.currentStepIndex - 1, error: null });
        }
    };

    const toggleConnector = (connector: ConnectorEntry) => {
        const already = state.selectedConnectors.some((c) => c.name === connector.name);
        update({
            selectedConnectors: already
                ? state.selectedConnectors.filter((c) => c.name !== connector.name)
                : [...state.selectedConnectors, connector],
        });
    };

    const handleCredentialChange = (connectorId: string, fieldName: string, value: string) => {
        update({
            connectorCredentials: {
                ...state.connectorCredentials,
                [connectorId]: {
                    ...(state.connectorCredentials[connectorId] ?? {}),
                    [fieldName]: value,
                },
            },
        });
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    const currentStepId = STEPS[state.currentStepIndex].id;
    const isLast = state.currentStepIndex === STEPS.length - 1;
    const isFirst = state.currentStepIndex === 0;

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-12 pb-16 px-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8">
                <h1 className="text-2xl font-bold mb-1 text-gray-900">Hire an AI Agent</h1>
                <p className="text-sm text-gray-500 mb-8">
                    Follow the steps below to configure and deploy your agent.
                </p>

                <StepIndicator steps={STEPS} currentIndex={state.currentStepIndex} />

                <div className="min-h-[320px]">
                    {currentStepId === 'select_role' && (
                        <SelectRoleStep
                            selectedRole={state.selectedRole}
                            onChange={(role) => update({ selectedRole: role })}
                        />
                    )}
                    {currentStepId === 'connect_tools' && (
                        <ConnectToolsStep
                            selected={state.selectedConnectors}
                            credentials={state.connectorCredentials}
                            onToggle={toggleConnector}
                            onCredentialChange={handleCredentialChange}
                            selectedRole={state.selectedRole}
                        />
                    )}
                    {currentStepId === 'configure_persona' && (
                        <ConfigurePersonaStep
                            displayName={state.displayName}
                            emailAddress={state.emailAddress}
                            communicationStyle={state.communicationStyle}
                            disclosureStatement={state.disclosureStatement}
                            onChangeName={(v) => update({ displayName: v })}
                            onChangeEmail={(v) => update({ emailAddress: v })}
                            onChangeStyle={(v) =>
                                update({ communicationStyle: v as WizardState['communicationStyle'] })
                            }
                            onChangeDisclosure={(v) => update({ disclosureStatement: v })}
                        />
                    )}
                    {currentStepId === 'set_approval_rules' && (
                        <SetApprovalRulesStep
                            highRisk={state.highRiskRequiresApproval}
                            mediumRisk={state.mediumRiskRequiresApproval}
                            timeoutSeconds={state.approvalTimeoutSeconds}
                            onChangeHighRisk={(v) => update({ highRiskRequiresApproval: v })}
                            onChangeMediumRisk={(v) => update({ mediumRiskRequiresApproval: v })}
                            onChangeTimeout={(v) => update({ approvalTimeoutSeconds: v })}
                        />
                    )}
                    {currentStepId === 'deploy' && (
                        <DeployStep
                            completed={state.completed}
                            selectedRole={state.selectedRole}
                            displayName={state.displayName}
                            connectors={state.selectedConnectors}
                        />
                    )}
                </div>

                {state.error && (
                    <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
                        {state.error}
                    </div>
                )}

                {!state.completed && (
                    <div className="flex justify-between mt-8">
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={isFirst || state.submitting}
                            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition"
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={!canAdvance() || state.submitting}
                            className="px-6 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-40 hover:bg-blue-700 transition"
                        >
                            {state.submitting
                                ? 'Please wait\u2026'
                                : isLast
                                    ? 'Deploy Agent'
                                    : 'Next \u2192'}
                        </button>
                    </div>
                )}

                {state.completed && (
                    <div className="mt-8 text-center">
                        <a
                            href="/dashboard"
                            className="px-6 py-2 text-sm rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition"
                        >
                            Go to Dashboard
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page export â€” Suspense required for useSearchParams in Next.js 14+
// ---------------------------------------------------------------------------

export default function SetupWizardPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Loading wizard\u2026</span>
                </div>
            }
        >
            <WizardContent />
        </Suspense>
    );
}
