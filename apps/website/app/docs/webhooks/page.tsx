import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, TypeTable, Response, PageNav, Tag, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Webhooks — AgentFarms Real-Time Lifecycle Event Subscriptions",
    description: "Subscribe to AgentFarms lifecycle events over HTTP. Task status changes, approval requests, and evidence events delivered securely to your endpoint.",
    alternates: { canonical: "https://agentfarms.in/docs/webhooks" },
};

export default function WebhooksPage() {
    return (
        <article>
            <Tag>API Reference</Tag>
            <H1>Webhooks</H1>
            <Lead>
                Subscribe to lifecycle events from AgentFarms workers over HTTP. Every time a task
                changes state, an approval is created, or a worker completes work, your endpoint
                receives a signed payload.
            </Lead>

            <H2 id="setup">Setting up a webhook</H2>
            <P>Register a webhook endpoint in your workspace settings or via API:</P>
            <Code lang="http">{`POST https://api.agentfarms.in/v1/webhooks
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "url": "https://yourapp.com/webhooks/agentfarms",
  "events": [
    "task.completed",
    "task.failed",
    "approval.created",
    "approval.decided"
  ],
  "secret": "your-signing-secret"
}`}</Code>
            <Response status={201} label="Webhook registered">
{`{
  "webhook": {
    "id": "whk_01HXYZ",
    "url": "https://yourapp.com/webhooks/agentfarms",
    "events": ["task.completed", "task.failed", "approval.created", "approval.decided"],
    "status": "active",
    "created_at": "2026-05-30T09:00:00Z"
  }
}`}
            </Response>

            <Divider />

            <H2 id="payload">Webhook payload structure</H2>
            <P>All webhooks deliver the same envelope shape — only the <InlineCode>data</InlineCode> object varies by event type:</P>
            <Code lang="json">{`{
  "id": "evt_01HXYZ",
  "event": "task.completed",
  "created_at": "2026-05-30T09:18:00Z",
  "workspace_id": "ws_01HXYZ",
  "data": {
    // event-specific payload
  }
}`}</Code>
            <TypeTable rows={[
                { field: "id", type: "string", description: "Unique event ID (evt_...)" },
                { field: "event", type: "string", description: "Event type — see full list below" },
                { field: "created_at", type: "ISO 8601", description: "When this event was generated" },
                { field: "workspace_id", type: "string", description: "Workspace that generated the event" },
                { field: "data", type: "object", description: "Event-specific payload object" },
            ]} />

            <Divider />

            <H2 id="signing">Verifying signatures</H2>
            <P>
                Every webhook payload includes an HMAC-SHA256 signature in the
                <InlineCode>X-AgentFarms-Signature</InlineCode> header. Verify it before processing:
            </P>
            <Code lang="typescript">{`import crypto from "crypto";

export function verifyWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

// In your handler:
app.post("/webhooks/agentfarms", (req, res) => {
  const sig = req.headers["x-agentfarms-signature"] as string;
  const valid = verifyWebhook(req.rawBody, sig, process.env.WEBHOOK_SECRET!);
  if (!valid) return res.status(401).send("Invalid signature");

  const { event, data } = req.body;
  // handle event...
  res.status(200).send("ok");
});`}</Code>
            <Callout type="warning" title="Always verify signatures">
                Process webhook payloads only after verifying the HMAC signature. This prevents malicious actors from spoofing events to your endpoint.
            </Callout>

            <Divider />

            <H2 id="events">Event reference</H2>

            <H3 id="task-events">Task events</H3>

            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#5856d6]" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    task.queued
                </div>
                <div className="px-4 py-3">
                    <p className="text-[13px] text-[#6e6e73] mb-3">Fires when a task is accepted and added to the worker queue.</p>
                    <Code lang="json">{`{
  "event": "task.queued",
  "data": {
    "task_id": "tsk_01ABCD",
    "worker_id": "wkr_01HXYZ",
    "description": "Fix email validation in /api/users",
    "priority": "normal",
    "estimated_completion": "2026-05-30T09:20:00Z"
  }
}`}</Code>
                </div>
            </div>

            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#5856d6]" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    task.completed
                </div>
                <div className="px-4 py-3">
                    <p className="text-[13px] text-[#6e6e73] mb-3">Fires when a task finishes successfully.</p>
                    <Code lang="json">{`{
  "event": "task.completed",
  "data": {
    "task_id": "tsk_01ABCD",
    "worker_id": "wkr_01HXYZ",
    "duration_seconds": 982,
    "actions_taken": 7,
    "approvals_required": 1,
    "outputs": {
      "pr_url": "https://github.com/org/repo/pull/482"
    },
    "evidence_url": "https://api.agentfarms.in/v1/evidence?task_id=tsk_01ABCD"
  }
}`}</Code>
                </div>
            </div>

            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#5856d6]" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    task.failed
                </div>
                <div className="px-4 py-3">
                    <p className="text-[13px] text-[#6e6e73] mb-3">Fires when a task fails due to an error or irrecoverable blocker.</p>
                    <Code lang="json">{`{
  "event": "task.failed",
  "data": {
    "task_id": "tsk_01ABCD",
    "worker_id": "wkr_01HXYZ",
    "failure_reason": "CI checks failed after 3 fix attempts",
    "last_action": "push_branch",
    "duration_seconds": 1840
  }
}`}</Code>
                </div>
            </div>

            <H3 id="approval-events">Approval events</H3>

            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#5856d6]" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    approval.created
                </div>
                <div className="px-4 py-3">
                    <p className="text-[13px] text-[#6e6e73] mb-3">Fires when a worker pauses and requires human review before an action.</p>
                    <Code lang="json">{`{
  "event": "approval.created",
  "data": {
    "approval_id": "apr_01HXYZ",
    "task_id": "tsk_01ABCD",
    "worker_id": "wkr_01HXYZ",
    "action_type": "merge_pr",
    "risk_level": "medium",
    "action_payload": {
      "pr_url": "https://github.com/org/repo/pull/482",
      "pr_title": "Fix: auth timeout in billing retries",
      "files_changed": 3,
      "additions": 47,
      "deletions": 12
    },
    "expires_at": "2026-05-31T09:00:00Z",
    "decide_url": "https://api.agentfarms.in/v1/approvals/apr_01HXYZ"
  }
}`}</Code>
                </div>
            </div>

            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#5856d6]" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    approval.decided
                </div>
                <div className="px-4 py-3">
                    <p className="text-[13px] text-[#6e6e73] mb-3">Fires when a reviewer approves or rejects an approval request.</p>
                    <Code lang="json">{`{
  "event": "approval.decided",
  "data": {
    "approval_id": "apr_01HXYZ",
    "task_id": "tsk_01ABCD",
    "decision": "approved",
    "reviewer_id": "usr_01HXYZ",
    "note": "Looks good — proceed with the merge.",
    "decided_at": "2026-05-30T09:15:00Z"
  }
}`}</Code>
                </div>
            </div>

            <H3 id="all-events">All event types</H3>
            <TypeTable rows={[
                { field: "task.queued", type: "Task", description: "Task accepted and added to the queue" },
                { field: "task.planning", type: "Task", description: "Worker started planning the task" },
                { field: "task.executing", type: "Task", description: "Worker started executing actions" },
                { field: "task.completed", type: "Task", description: "Task finished successfully" },
                { field: "task.failed", type: "Task", description: "Task failed due to error or blocker" },
                { field: "task.cancelled", type: "Task", description: "Task cancelled by user or policy" },
                { field: "approval.created", type: "Approval", description: "Worker paused and requires human review" },
                { field: "approval.decided", type: "Approval", description: "Reviewer approved or rejected an action" },
                { field: "approval.expired", type: "Approval", description: "Approval request expired with no decision" },
                { field: "worker.status_changed", type: "Worker", description: "Worker status changed (e.g. active → paused)" },
                { field: "connector.token_expired", type: "Connector", description: "OAuth token could not be refreshed — reconnection needed" },
            ]} />

            <Divider />

            <H2 id="retries">Retry policy</H2>
            <P>If your endpoint returns a non-2xx response or times out (30s limit), AgentFarms retries with exponential backoff:</P>
            <TypeTable rows={[
                { field: "Attempt 1", type: "Immediate", description: "First delivery on event" },
                { field: "Attempt 2", type: "+30s", description: "First retry" },
                { field: "Attempt 3", type: "+2m", description: "Second retry" },
                { field: "Attempt 4", type: "+10m", description: "Third retry" },
                { field: "Attempt 5", type: "+1h", description: "Final retry — marked failed after this" },
            ]} />
            <Callout type="tip">
                Respond with <InlineCode>200 OK</InlineCode> as fast as possible, then process the event asynchronously. This prevents timeouts and unnecessary retries.
            </Callout>

            <PageNav
                prev={{ href: "/docs/api-reference", label: "REST API Reference" }}
                next={{ href: "/docs/sdk", label: "TypeScript SDK" }}
            />
        </article>
    );
}
