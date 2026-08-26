import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, ParamTable, Response, Endpoint, PageNav, Tag, TypeTable, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Connectors — 18 AgentFarms Tool Integrations and OAuth",
    description: "All 18 AgentFarms connectors — GitHub, Jira, Slack, Salesforce, Gmail, and more. OAuth setup, available actions, permission scopes, and integration guide.",
    alternates: { canonical: "https://agentfarms.in/docs/connectors" },
};

const connectors = [
    {
        category: "Code & Version Control",
        items: [
            { id: "github", name: "GitHub", auth: "OAuth 2.0", status: "GA", actions: ["create_pr", "add_pr_comment", "merge_pr", "list_prs", "trigger_workflow", "list_workflow_runs", "get_workflow_run", "create_release"] },
            { id: "gitlab", name: "GitLab", auth: "Bearer Token", status: "GA", actions: ["create_pr", "add_pr_comment", "merge_pr", "list_prs", "create_task", "update_task_status"] },
            { id: "azure_devops", name: "Azure DevOps", auth: "OAuth 2.0", status: "GA", actions: ["create_pr", "add_pr_comment", "merge_pr", "list_prs", "create_task", "update_task_status", "assign_task"] },
        ],
    },
    {
        category: "Task & Project Management",
        items: [
            { id: "jira", name: "Jira", auth: "OAuth 2.0", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "assign_task", "list_tasks", "create_sprint", "update_sprint_status", "add_issue_to_sprint", "list_sprints"] },
            { id: "linear", name: "Linear", auth: "API Key", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "assign_task", "list_tasks"] },
            { id: "asana", name: "Asana", auth: "OAuth 2.0", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "list_tasks"] },
            { id: "monday", name: "Monday.com", auth: "OAuth 2.0", status: "Beta", actions: ["get_task", "create_task", "update_task_status", "add_comment"] },
            { id: "clickup", name: "ClickUp", auth: "OAuth 2.0", status: "Beta", actions: ["get_task", "create_task", "update_task_status", "add_comment", "assign_task", "list_tasks"] },
        ],
    },
    {
        category: "Messaging",
        items: [
            { id: "slack", name: "Slack", auth: "OAuth 2.0", status: "GA", actions: ["send_message", "create_channel", "mention_user"] },
            { id: "teams", name: "Microsoft Teams", auth: "OAuth 2.0", status: "GA", actions: ["send_message", "create_channel", "mention_user"] },
        ],
    },
    {
        category: "Email",
        items: [
            { id: "gmail", name: "Gmail", auth: "OAuth 2.0", status: "GA", actions: ["list_emails", "read_email", "send_email", "reply_email", "read_thread"] },
            { id: "outlook", name: "Outlook / Microsoft 365", auth: "OAuth 2.0", status: "GA", actions: ["list_emails", "read_email", "send_email", "reply_email", "read_thread"] },
        ],
    },
    {
        category: "CRM & Sales",
        items: [
            { id: "salesforce", name: "Salesforce", auth: "OAuth 2.0", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "assign_task", "list_tasks"] },
            { id: "hubspot", name: "HubSpot", auth: "OAuth 2.0", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "list_tasks"] },
        ],
    },
    {
        category: "Customer Support",
        items: [
            { id: "zendesk", name: "Zendesk", auth: "API Key", status: "GA", actions: ["get_task", "create_task", "update_task_status", "add_comment", "assign_task", "list_tasks"] },
            { id: "intercom", name: "Intercom", auth: "OAuth 2.0", status: "Beta", actions: ["get_task", "create_task", "update_task_status", "add_comment"] },
        ],
    },
    {
        category: "Cloud & CI/CD",
        items: [
            { id: "github_actions", name: "GitHub Actions", auth: "OAuth 2.0 (via GitHub)", status: "GA", actions: ["trigger_workflow", "list_workflow_runs", "get_workflow_run"] },
            { id: "azure", name: "Azure", auth: "Service Principal", status: "GA", actions: ["trigger_workflow", "list_workflow_runs", "get_workflow_run"] },
        ],
    },
];

export default function ConnectorsPage() {
    return (
        <article>
            <Tag>Integrations</Tag>
            <H1>Connectors</H1>
            <Lead>
                18 connectors across code, task management, messaging, email, CRM, support, and cloud.
                All use OAuth 2.0 with automatic token refresh and per-workspace scoped permissions.
            </Lead>

            <Callout type="tip">
                Workers only access the connectors you explicitly authorize in your workspace settings. Each connector credential is encrypted at rest and scoped to the minimum permissions the role requires.
            </Callout>

            {/* Adding a connector */}
            <H2 id="adding">Adding a connector</H2>
            <P>Add a connector via the API or through <strong>Settings → Connectors</strong> in the dashboard.</P>
            <Endpoint method="POST" path="/v1/connectors" description="Add a new connector to your workspace." />
            <ParamTable params={[
                { name: "tool", type: "string", required: true, description: "Connector identifier (e.g. github, jira, slack)" },
                { name: "workspace_id", type: "string", required: true, description: "Workspace this connector belongs to" },
                { name: "credentials", type: "object", description: "Auth credentials (OAuth token, API key, etc.) — see connector-specific docs below" },
                { name: "scope", type: "string[]", description: "Optional: restrict the connector to specific repos, projects, or channels" },
            ]} />

            <Code lang="http">{`POST https://api.agentfarms.in/v1/connectors
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "tool": "github",
  "workspace_id": "ws_01HXYZ",
  "credentials": {
    "type": "oauth2",
    "oauth_token": "gho_xxxxxxxxxxxxxxxxxxxx"
  },
  "scope": {
    "repo_ids": ["org/backend-api", "org/frontend"]
  }
}`}</Code>

            <Response status={201} label="Connector added">
{`{
  "connector": {
    "id": "con_01HXYZ",
    "tool": "github",
    "status": "connected",
    "scoped_repos": ["org/backend-api", "org/frontend"],
    "created_at": "2026-05-30T09:00:00Z"
  }
}`}
            </Response>

            <H3 id="health">Check connector health</H3>
            <Endpoint method="GET" path="/v1/connectors" description="List all connectors and their current health status." />
            <Response status={200} label="Connector list">
{`{
  "connectors": [
    {
      "id": "con_01HXYZ",
      "tool": "github",
      "name": "GitHub",
      "status": "connected",
      "token_expires_at": "2026-06-30T09:00:00Z",
      "last_used_at": "2026-05-30T08:55:00Z"
    }
  ]
}`}
            </Response>

            <Divider />

            {/* Connector catalog */}
            {connectors.map((cat) => (
                <div key={cat.category}>
                    <H2 id={cat.category.toLowerCase().replace(/[^a-z]/g, "-")}>{cat.category}</H2>
                    {cat.items.map((conn) => (
                        <div key={conn.id} className="my-5">
                            <div className="flex items-center gap-3 mb-3">
                                <h3 className="font-semibold text-[15px] text-[var(--op-ink)]">{conn.name}</h3>
                                <span
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-[0.04em]"
                                    style={{
                                        background: conn.status === "GA" ? "rgba(52,199,89,0.1)" : "rgba(255,159,10,0.1)",
                                        color: conn.status === "GA" ? "#1a7a4a" : "#b86800",
                                    }}
                                >
                                    {conn.status}
                                </span>
                                <span className="text-[12px] text-[var(--op-muted)]">Auth: {conn.auth}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {conn.actions.map((action) => (
                                    <code
                                        key={action}
                                        className="text-[12px] font-mono px-2 py-0.5 rounded"
                                        style={{ background: "var(--op-paper-2)", color: "#5856d6", border: "1px solid var(--op-line)" }}
                                    >
                                        {action}
                                    </code>
                                ))}
                            </div>
                        </div>
                    ))}
                    <Divider />
                </div>
            ))}

            {/* Custom connector */}
            <H2 id="custom">Custom REST connectors</H2>
            <P>
                Connect any internal tool or third-party API not in the standard catalog using the
                <InlineCode>generic_rest</InlineCode> connector type.
            </P>
            <Code lang="http">{`POST https://api.agentfarms.in/v1/connectors
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx

{
  "tool": "generic_rest",
  "workspace_id": "ws_01HXYZ",
  "credentials": {
    "type": "bearer_token",
    "token": "your-internal-api-token"
  },
  "config": {
    "base_url": "https://internal-api.yourcompany.com/v1",
    "actions": {
      "create_ticket": {
        "method": "POST",
        "path": "/tickets",
        "body_template": { "title": "{{title}}", "assignee": "{{assignee}}" }
      },
      "get_ticket": {
        "method": "GET",
        "path": "/tickets/{{id}}"
      }
    }
  }
}`}</Code>

            <Callout type="note">
                Custom connector configuration is available on Pro+ and Enterprise plans. Contact support for help mapping your internal API to the connector action schema.
            </Callout>

            <PageNav
                prev={{ href: "/docs/workers", label: "Worker Roles" }}
                next={{ href: "/docs/api-reference", label: "REST API Reference" }}
            />
        </article>
    );
}
