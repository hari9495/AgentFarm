import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, ParamTable, Response, Endpoint, PageNav, Tag, TypeTable, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "REST API Reference",
    description: "Full AgentFarms REST API reference. Workers, tasks, approvals, evidence, and connector endpoints with request/response examples.",
    alternates: { canonical: "https://agentfarms.in/docs/api-reference" },
};

export default function ApiReferencePage() {
    return (
        <article>
            <Tag>API Reference</Tag>
            <H1>REST API Reference</H1>
            <Lead>
                Manage workers, assign tasks, handle approvals, and query evidence programmatically.
                All endpoints live at <InlineCode>https://api.agentfarms.in/v1</InlineCode>.
            </Lead>

            <H2 id="authentication">Authentication</H2>
            <P>All API requests require a Bearer token. Generate one from <strong>Workspace → Settings → API Keys</strong>.</P>
            <Code lang="bash">{`# All requests require this header
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx

# Base URL
https://api.agentfarms.in/v1`}</Code>
            <Callout type="warning" title="Keep your key secret">
                Never commit API keys to source code or expose them in client-side code.
                All keys are prefixed <InlineCode>af_live_</InlineCode>. Rotate from Settings if exposed.
            </Callout>

            <H3 id="error-format">Error format</H3>
            <P>All errors return a consistent JSON body:</P>
            <Response status={400} label="Validation error">
{`{
  "error": {
    "code": "validation_error",
    "message": "worker_id is required",
    "field": "worker_id"
  }
}`}
            </Response>
            <TypeTable rows={[
                { field: "400", type: "Bad Request", description: "Missing or invalid parameters" },
                { field: "401", type: "Unauthorized", description: "Missing or invalid API key" },
                { field: "403", type: "Forbidden", description: "API key lacks access to this resource" },
                { field: "404", type: "Not Found", description: "Resource does not exist" },
                { field: "409", type: "Conflict", description: "Re-deciding an already-decided approval" },
                { field: "429", type: "Rate Limited", description: "Too many requests — retry with backoff" },
            ]} />

            <Divider />

            {/* Workers */}
            <H2 id="workers">Workers</H2>
            <P>Workers are role-based AI agents deployed into your workspace. Each worker has a defined role, tool access, and approval threshold.</P>

            <H3 id="list-workers">List workers</H3>
            <Endpoint method="GET" path="/v1/workers" description="Return all workers in the workspace." />
            <ParamTable params={[
                { name: "status", type: "string", description: "Filter: active | paused | failed | provisioning" },
                { name: "role", type: "string", description: "Filter by role slug (e.g. backend-developer)" },
                { name: "limit", type: "number", default: "20", description: "Results per page (1–100)" },
                { name: "cursor", type: "string", description: "Pagination cursor from previous response" },
            ]} />
            <Response status={200} label="Success">
{`{
  "workers": [
    {
      "id": "wkr_01HXYZ",
      "name": "Rex",
      "role": "backend-developer",
      "status": "active",
      "approval_threshold": "medium",
      "tasks_completed": 47,
      "tasks_active": 1,
      "created_at": "2026-05-01T09:00:00Z"
    }
  ],
  "has_more": false,
  "cursor": null
}`}
            </Response>

            <H3 id="create-worker">Create a worker</H3>
            <Endpoint method="POST" path="/v1/workers" description="Deploy a new worker. Provisioning takes 30–60 seconds." />
            <ParamTable params={[
                { name: "name", type: "string", required: true, description: "Display name for this worker (e.g. Rex)" },
                { name: "role", type: "string", required: true, description: "Role slug — see worker roles reference" },
                { name: "workspace_id", type: "string", required: true, description: "Workspace to deploy into" },
                { name: "repo_ids", type: "string[]", description: "Repo IDs the worker may access (code roles)" },
                { name: "approval_threshold", type: "low | medium | high", default: "medium", description: "Minimum risk level that triggers approval" },
                { name: "persona", type: "object", description: "{ display_name, email } — worker identity in connected tools" },
            ]} />
            <Code lang="json">{`{
  "name": "Rex",
  "role": "backend-developer",
  "workspace_id": "ws_01HXYZ",
  "repo_ids": ["repo_abc123"],
  "approval_threshold": "medium",
  "persona": {
    "display_name": "Rex",
    "email": "rex@yourcompany.com"
  }
}`}</Code>
            <Response status={201} label="Worker created">
{`{
  "worker": {
    "id": "wkr_01HXYZ",
    "name": "Rex",
    "role": "backend-developer",
    "status": "provisioning",
    "created_at": "2026-05-30T09:00:00Z"
  }
}`}
            </Response>

            <H3 id="get-worker">Get a worker</H3>
            <Endpoint method="GET" path="/v1/workers/:id" description="Get full worker details including status and usage stats." />
            <Response status={200} label="Success">
{`{
  "worker": {
    "id": "wkr_01HXYZ",
    "name": "Rex",
    "role": "backend-developer",
    "status": "active",
    "approval_threshold": "medium",
    "connectors": ["github", "jira", "slack"],
    "tasks_completed": 47,
    "tasks_active": 1,
    "tasks_failed": 2,
    "last_active_at": "2026-05-30T08:55:00Z",
    "created_at": "2026-05-01T09:00:00Z"
  }
}`}
            </Response>

            <H3 id="update-worker">Update a worker</H3>
            <Endpoint method="PATCH" path="/v1/workers/:id" description="Update worker name, approval threshold, or persona." />
            <ParamTable params={[
                { name: "name", type: "string", description: "New display name" },
                { name: "approval_threshold", type: "low | medium | high", description: "Updated approval threshold" },
                { name: "persona", type: "object", description: "Updated persona fields" },
            ]} />

            <H3 id="retire-worker">Retire a worker</H3>
            <Endpoint method="DELETE" path="/v1/workers/:id" description="Retire a worker. Active tasks complete before removal." />
            <Response status={200} label="Success">
{`{ "success": true }`}
            </Response>

            <Divider />

            {/* Tasks */}
            <H2 id="tasks">Tasks</H2>
            <P>Tasks are units of work assigned to a worker. The worker plans, executes, and captures evidence for every task.</P>

            <H3 id="create-task">Assign a task</H3>
            <Endpoint method="POST" path="/v1/tasks" description="Assign a task to an active worker." />
            <ParamTable params={[
                { name: "worker_id", type: "string", required: true, description: "Target worker" },
                { name: "description", type: "string", required: true, description: "Natural language task description. Be specific and bounded." },
                { name: "repo_id", type: "string", description: "Repository context for code tasks" },
                { name: "priority", type: "low | normal | high", default: "normal", description: "Task priority affecting queue order" },
                { name: "metadata", type: "object", description: "Arbitrary key/value metadata attached to this task" },
                { name: "webhook_url", type: "string", description: "Override webhook URL for this task only" },
            ]} />
            <Code lang="json">{`{
  "worker_id": "wkr_01HXYZ",
  "description": "Fix the /api/users email validation. Return clear 400 errors for invalid formats. Add or update tests.",
  "repo_id": "repo_abc123",
  "priority": "normal",
  "metadata": { "jira_ticket": "ENG-482" }
}`}</Code>
            <Response status={201} label="Task queued">
{`{
  "task": {
    "id": "tsk_01ABCD",
    "status": "queued",
    "worker_id": "wkr_01HXYZ",
    "priority": "normal",
    "estimated_completion": "2026-05-30T09:20:00Z",
    "created_at": "2026-05-30T09:01:00Z"
  }
}`}
            </Response>

            <H3 id="get-task">Get task status</H3>
            <Endpoint method="GET" path="/v1/tasks/:id" description="Poll task status, progress, and outputs." />
            <Response status={200} label="Completed task">
{`{
  "task": {
    "id": "tsk_01ABCD",
    "status": "completed",
    "worker_id": "wkr_01HXYZ",
    "progress": 1.0,
    "risk_level": "medium",
    "actions_taken": 7,
    "approvals_required": 1,
    "approvals_granted": 1,
    "outputs": {
      "pr_url": "https://github.com/org/repo/pull/482",
      "pr_title": "Fix: email validation in /api/users",
      "tests_added": 3
    },
    "evidence_url": "https://api.agentfarms.in/v1/evidence?task_id=tsk_01ABCD",
    "started_at": "2026-05-30T09:02:00Z",
    "completed_at": "2026-05-30T09:18:00Z"
  }
}`}
            </Response>

            <H3 id="list-tasks">List tasks</H3>
            <Endpoint method="GET" path="/v1/tasks" description="List tasks with optional filters." />
            <ParamTable params={[
                { name: "worker_id", type: "string", description: "Filter by worker" },
                { name: "status", type: "string", description: "Filter: queued | planning | executing | awaiting_approval | completed | failed | cancelled" },
                { name: "from", type: "ISO 8601", description: "Created-at start range" },
                { name: "to", type: "ISO 8601", description: "Created-at end range" },
                { name: "limit", type: "number", default: "20", description: "Results per page (1–100)" },
            ]} />

            <H3 id="cancel-task">Cancel a task</H3>
            <Endpoint method="POST" path="/v1/tasks/:id/cancel" description="Cancel a queued or in-progress task. Evidence is preserved." />
            <Response status={200} label="Cancelled">
{`{ "success": true }`}
            </Response>

            <Divider />

            {/* Approvals */}
            <H2 id="approvals">Approvals</H2>
            <P>When a worker reaches an action above your approval threshold, it pauses and creates an approval request.</P>

            <H3 id="list-approvals">List approvals</H3>
            <Endpoint method="GET" path="/v1/approvals" description="List approval requests in your workspace." />
            <ParamTable params={[
                { name: "status", type: "string", default: "pending", description: "pending | approved | rejected | expired" },
                { name: "worker_id", type: "string", description: "Filter by worker" },
                { name: "risk_level", type: "string", description: "Filter by risk: low | medium | high" },
                { name: "limit", type: "number", default: "20", description: "Results per page" },
            ]} />
            <Response status={200} label="Approval list">
{`{
  "approvals": [
    {
      "id": "apr_01HXYZ",
      "task_id": "tsk_01ABCD",
      "worker_id": "wkr_01HXYZ",
      "action_type": "merge_pr",
      "risk_level": "medium",
      "status": "pending",
      "action_payload": {
        "pr_url": "https://github.com/org/repo/pull/482",
        "pr_title": "Fix: auth timeout in billing retries",
        "files_changed": 3
      },
      "expires_at": "2026-05-31T09:00:00Z"
    }
  ]
}`}
            </Response>

            <H3 id="decide-approval">Decide on an approval</H3>
            <Endpoint method="PATCH" path="/v1/approvals/:id" description="Approve or reject a pending action. Decisions are final (409 on re-decision)." />
            <ParamTable params={[
                { name: "decision", type: "approved | rejected", required: true, description: "Your decision" },
                { name: "note", type: "string", description: "Optional feedback for the worker on rejection" },
            ]} />
            <Code lang="json">{`{
  "decision": "approved",
  "note": "Looks good — proceed with the merge."
}`}</Code>
            <Response status={200} label="Decision recorded">
{`{
  "approval": {
    "id": "apr_01HXYZ",
    "status": "approved",
    "decided_at": "2026-05-30T09:15:00Z"
  }
}`}
            </Response>

            <Divider />

            {/* Evidence */}
            <H2 id="evidence">Evidence</H2>
            <H3 id="query-evidence">Query evidence</H3>
            <Endpoint method="GET" path="/v1/evidence" description="Query the append-only evidence trail." />
            <ParamTable params={[
                { name: "task_id", type: "string", description: "Filter to a specific task" },
                { name: "worker_id", type: "string", description: "Filter to a specific worker" },
                { name: "event_type", type: "string", description: "Filter by event type (e.g. action.executed)" },
                { name: "from", type: "ISO 8601", description: "Start of time range" },
                { name: "to", type: "ISO 8601", description: "End of time range" },
                { name: "limit", type: "number", default: "50", description: "Results per page (1–500)" },
            ]} />

            <H3 id="export-evidence">Export evidence</H3>
            <Endpoint method="GET" path="/v1/evidence/export" description="Export a full evidence bundle as JSON or CSV." />
            <ParamTable params={[
                { name: "task_id", type: "string", description: "Export for a specific task" },
                { name: "from", type: "ISO 8601", description: "Export range start" },
                { name: "to", type: "ISO 8601", description: "Export range end" },
                { name: "format", type: "json | csv", default: "json", description: "Export format" },
            ]} />

            <Divider />

            {/* Connectors */}
            <H2 id="connectors">Connectors</H2>
            <H3 id="list-connectors">List connectors</H3>
            <Endpoint method="GET" path="/v1/connectors" description="List configured connectors and health status." />
            <H3 id="add-connector">Add a connector</H3>
            <Endpoint method="POST" path="/v1/connectors" description="Add a new connector. See the Connectors guide for per-tool setup." />
            <H3 id="remove-connector">Remove a connector</H3>
            <Endpoint method="DELETE" path="/v1/connectors/:id" description="Remove a connector and revoke its credentials." />

            <Divider />

            {/* Rate limits */}
            <H2 id="rate-limits">Rate limits</H2>
            <TypeTable rows={[
                { field: "Starter+", type: "60 req/min", description: "100 tasks/day" },
                { field: "Pro+", type: "300 req/min", description: "500 tasks/day" },
                { field: "Enterprise", type: "Custom", description: "Unlimited tasks" },
            ]} />
            <P>Rate limit headers on every response: <InlineCode>X-RateLimit-Limit</InlineCode>, <InlineCode>X-RateLimit-Remaining</InlineCode>, <InlineCode>X-RateLimit-Reset</InlineCode>.</P>

            <PageNav
                prev={{ href: "/docs/connectors", label: "Connectors" }}
                next={{ href: "/docs/webhooks", label: "Webhooks" }}
            />
        </article>
    );
}
