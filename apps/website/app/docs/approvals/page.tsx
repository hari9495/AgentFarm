import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, ParamTable, Response, Endpoint, PageNav, Tag, TypeTable, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Approval Gates — AgentFarms Risk Classification and Review",
    description: "How AgentFarms risk classification, approval queues, and human-in-the-loop review work. Configure thresholds and handle approval decisions via API.",
    alternates: { canonical: "https://agentfarms.in/docs/approvals" },
};

export default function ApprovalsPage() {
    return (
        <article>
            <Tag>Core Concepts</Tag>
            <H1>Approval Gates</H1>
            <Lead>
                The approval system is the governance layer that makes AgentFarms safe to run in production.
                Every action is risk-classified before it executes. Actions above your configured threshold
                pause and route to a human reviewer.
            </Lead>

            <Callout type="note">
                Approval gates are not a bottleneck — they&apos;re a filter. Most routine actions (lint fixes, doc updates, draft PRs) are classified as low-risk and auto-execute. Only meaningful decisions surface for review.
            </Callout>

            {/* How approval gates work */}
            <H2 id="how-it-works">How approval gates work</H2>
            <P>When a worker reaches an action during task execution, it follows this flow:</P>
            <div
                className="rounded-[12px] p-5 my-5 font-mono text-[13px]"
                style={{ background: "#1a1a1c", color: "#e5e5ea" }}
            >
                <div className="text-[var(--op-muted)]"># Approval flow per action</div>
                <br />
                <div><span className="text-[#0a84ff]">Worker plans action</span></div>
                <div className="pl-4 text-[var(--op-muted)]">↓ classify risk level</div>
                <div><span className="text-[#30d158]">low</span> <span className="text-[var(--op-muted)]">→ auto-execute immediately</span></div>
                <div><span className="text-[#ffd60a]">medium</span> <span className="text-[var(--op-muted)]">→ pause if threshold ≤ medium</span></div>
                <div><span className="text-[#ff453a]">high</span> <span className="text-[var(--op-muted)]">→ always pause for review</span></div>
                <br />
                <div className="text-[var(--op-muted)]"># If paused:</div>
                <div><span className="text-[#0a84ff]">Approval record created</span> <span className="text-[var(--op-muted)]">→ notification sent (Slack / dashboard)</span></div>
                <div className="pl-4 text-[var(--op-muted)]">↓ await decision</div>
                <div><span className="text-[#30d158]">approved</span> <span className="text-[var(--op-muted)]">→ action executes, task continues</span></div>
                <div><span className="text-[#ff453a]">rejected</span> <span className="text-[var(--op-muted)]">→ task pauses, worker awaits guidance</span></div>
                <div><span className="text-[#ffd60a]">expired</span> <span className="text-[var(--op-muted)]">→ task cancelled after 24h (configurable)</span></div>
            </div>

            {/* Approval object */}
            <H2 id="approval-object">Approval object</H2>
            <TypeTable rows={[
                { field: "id", type: "string", description: "Unique approval ID (apr_...)" },
                { field: "task_id", type: "string", description: "Task this approval belongs to" },
                { field: "worker_id", type: "string", description: "Worker that triggered the approval" },
                { field: "action_type", type: "string", description: "The type of action being approved (e.g. merge_pr, send_email)" },
                { field: "action_payload", type: "object", description: "Full context of the action — what will happen if approved" },
                { field: "risk_level", type: "low | medium | high", description: "Classified risk level for this specific action" },
                { field: "status", type: "pending | approved | rejected | expired", description: "Current approval state" },
                { field: "reviewer_id", type: "string | null", description: "ID of the user who made the decision (null if pending)" },
                { field: "reviewer_note", type: "string | null", description: "Optional note from the reviewer" },
                { field: "decided_at", type: "ISO 8601 | null", description: "When the decision was made" },
                { field: "expires_at", type: "ISO 8601", description: "When this approval request will expire if not acted on" },
            ]} />

            <Divider />

            {/* API */}
            <H2 id="api">Approvals API</H2>

            <H3 id="list-pending">List pending approvals</H3>
            <Endpoint method="GET" path="/v1/approvals" description="List all pending approval requests in your workspace." />
            <ParamTable params={[
                { name: "status", type: "string", default: "pending", description: "Filter by approval status: pending, approved, rejected, expired" },
                { name: "worker_id", type: "string", description: "Filter to approvals from a specific worker" },
                { name: "limit", type: "number", default: "20", description: "Max results to return (1–100)" },
                { name: "cursor", type: "string", description: "Pagination cursor from previous response" },
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
        "files_changed": 3,
        "additions": 47,
        "deletions": 12
      },
      "expires_at": "2026-05-31T09:00:00Z"
    }
  ],
  "cursor": "apr_01WXYZ"
}`}
            </Response>

            <H3 id="decide">Approve or reject</H3>
            <Endpoint method="PATCH" path="/v1/approvals/:id" description="Submit an approval decision. Once decided, a 409 is returned on re-decision." />
            <ParamTable params={[
                { name: "decision", type: "approved | rejected", required: true, description: "The approval decision" },
                { name: "note", type: "string", description: "Optional reviewer note or feedback for the worker" },
            ]} />
            <Code lang="http">{`PATCH https://api.agentfarms.in/v1/approvals/apr_01HXYZ
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "decision": "approved",
  "note": "Looks good. Proceed with the merge."
}`}</Code>
            <Response status={200} label="Decision recorded">
{`{
  "approval": {
    "id": "apr_01HXYZ",
    "status": "approved",
    "decided_at": "2026-05-30T09:15:00Z",
    "reviewer_note": "Looks good. Proceed with the merge."
  }
}`}
            </Response>
            <Callout type="warning">
                Decisions are final. A 409 Conflict is returned if you attempt to re-decide an already-decided approval. Contact support if you need to reverse a decision.
            </Callout>

            <Divider />

            {/* Notifications */}
            <H2 id="notifications">Approval notifications</H2>
            <P>When an approval is required, AgentFarms sends notifications through your connected channels:</P>
            <ul className="list-disc pl-6 my-4 space-y-2 text-[14px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.7 }}>
                <li><strong>Dashboard</strong> — the approvals queue in the operator dashboard updates in real time</li>
                <li><strong>Slack</strong> — if Slack is connected, a message is sent to your configured approval channel with approve/reject buttons</li>
                <li><strong>Microsoft Teams</strong> — same as Slack if Teams is connected</li>
                <li><strong>Webhooks</strong> — an <InlineCode>approval.created</InlineCode> event fires on your webhook endpoint (see <a href="/docs/webhooks" className="text-[var(--op-indigo)] hover:underline">Webhooks</a>)</li>
                <li><strong>Email</strong> — a summary email is sent to workspace administrators if no decision is made within 4 hours</li>
            </ul>

            <Divider />

            {/* Configuring thresholds */}
            <H2 id="configuring-thresholds">Configuring approval thresholds</H2>
            <P>The <InlineCode>approvalThreshold</InlineCode> on a worker controls the minimum risk level that triggers an approval gate:</P>
            <Code lang="http">{`# Update a worker's approval threshold
PATCH https://api.agentfarms.in/v1/workers/wkr_01HXYZ
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "approval_threshold": "medium"
}

# Available values:
# "low"    — pause on medium and high-risk actions
# "medium" — pause only on high-risk actions (recommended)
# "high"   — pause on all actions (maximum oversight)`}</Code>

            <Callout type="tip" title="Recommended starting threshold">
                Start with <InlineCode>medium</InlineCode>. This means low-risk work flows automatically while medium and high-risk actions (merges, sends, deployments) always get reviewed. You can lower the threshold as you build confidence in the worker&apos;s judgment.
            </Callout>

            <PageNav
                prev={{ href: "/docs/concepts", label: "How Workers Operate" }}
                next={{ href: "/docs/evidence", label: "Evidence Trail" }}
            />
        </article>
    );
}
