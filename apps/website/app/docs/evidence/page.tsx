import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, TypeTable, Response, Endpoint, PageNav, Tag, ParamTable, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Evidence Trail — Audit and Compliance Records in AgentFarms",
    description: "How AgentFarms captures, stores, and exposes every action, decision, and output for audit, compliance, and review. Full evidence API reference included.",
    alternates: { canonical: "https://agentfarms.in/docs/evidence" },
};

export default function EvidencePage() {
    return (
        <article>
            <Tag>Core Concepts</Tag>
            <H1>Evidence Trail</H1>
            <Lead>
                Every action a worker takes is captured in an append-only evidence trail —
                timestamped, tied to identity, and exportable for compliance review.
                Nothing happens without a record.
            </Lead>

            {/* What is captured */}
            <H2 id="what-is-captured">What is captured</H2>
            <P>The evidence plane records every meaningful event during task execution:</P>

            <div className="my-5 overflow-hidden rounded-[11px]" style={{ border: "1px solid var(--op-line)" }}>
                <table className="w-full text-[13px]">
                    <thead>
                        <tr style={{ background: "var(--op-paper-2)", borderBottom: "1px solid var(--op-line)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Event type</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">What it captures</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { type: "task.created", capture: "Task description, assigned worker, risk level, creation timestamp" },
                            { type: "task.planned", capture: "LLM-generated execution plan, confidence score, context summary" },
                            { type: "action.executed", capture: "Tool called, parameters, output, execution time, risk classification" },
                            { type: "action.skipped", capture: "Action type, reason skipped (policy, threshold, dependency)" },
                            { type: "approval.requested", capture: "Action payload, risk level, expiry time, notification channels triggered" },
                            { type: "approval.decided", capture: "Decision (approved/rejected), reviewer identity, reviewer note, timestamp" },
                            { type: "connector.called", capture: "Connector name, action type, response status, latency" },
                            { type: "llm.decision", capture: "Model used, token usage, planned actions, confidence, risk signal" },
                            { type: "task.completed", capture: "Final status, total actions, approvals, duration, outputs" },
                            { type: "task.failed", capture: "Failure reason, last action before failure, recovery options" },
                        ].map((row, i, arr) => (
                            <tr key={row.type} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--op-line)" : "none" }}>
                                <td className="px-4 py-3 align-top">
                                    <code className="font-mono text-[#5856d6] text-[12px]">{row.type}</code>
                                </td>
                                <td className="px-4 py-3 text-[var(--op-muted)]">{row.capture}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Callout type="note">
                The evidence trail is <strong>append-only</strong> — records cannot be modified or deleted. Retention periods are configurable per workspace (default: 12 months, Enterprise: unlimited).
            </Callout>

            <Divider />

            {/* Evidence object */}
            <H2 id="evidence-object">Evidence record object</H2>
            <TypeTable rows={[
                { field: "id", type: "string", description: "Unique evidence record ID (evi_...)" },
                { field: "task_id", type: "string", description: "Task this evidence belongs to" },
                { field: "worker_id", type: "string", description: "Worker that produced this evidence" },
                { field: "event_type", type: "string", description: "Event type (see table above)" },
                { field: "action_type", type: "string | null", description: "Specific tool action taken (e.g. create_pr, send_email)" },
                { field: "actor", type: "object", description: "Identity of who/what triggered the event (worker, system, or reviewer)" },
                { field: "payload", type: "object", description: "Full event context — varies by event_type" },
                { field: "risk_level", type: "low | medium | high | null", description: "Risk level for action events" },
                { field: "outcome", type: "success | failure | skipped", description: "Whether the action succeeded" },
                { field: "latency_ms", type: "number | null", description: "Execution time for connector calls" },
                { field: "timestamp", type: "ISO 8601", description: "When this event occurred" },
            ]} />

            <Divider />

            {/* Evidence API */}
            <H2 id="api">Evidence API</H2>

            <H3 id="query-evidence">Query the evidence trail</H3>
            <Endpoint method="GET" path="/v1/evidence" description="Query evidence records across tasks, workers, and connectors." />
            <ParamTable params={[
                { name: "task_id", type: "string", description: "Filter to evidence for a specific task" },
                { name: "worker_id", type: "string", description: "Filter to evidence for a specific worker" },
                { name: "event_type", type: "string", description: "Filter by event type (e.g. approval.decided)" },
                { name: "from", type: "ISO 8601", description: "Start of time range" },
                { name: "to", type: "ISO 8601", description: "End of time range" },
                { name: "limit", type: "number", default: "50", description: "Max results (1–500)" },
                { name: "cursor", type: "string", description: "Pagination cursor" },
            ]} />
            <Response status={200} label="Evidence list">
{`{
  "evidence": [
    {
      "id": "evi_01HXYZ",
      "task_id": "tsk_01ABCD",
      "worker_id": "wkr_01HXYZ",
      "event_type": "action.executed",
      "action_type": "create_pr",
      "risk_level": "low",
      "outcome": "success",
      "payload": {
        "pr_url": "https://github.com/org/repo/pull/482",
        "pr_title": "Fix: auth timeout in billing retries",
        "branch": "fix/billing-auth-timeout",
        "files_changed": 3,
        "additions": 47,
        "deletions": 12
      },
      "latency_ms": 1243,
      "timestamp": "2026-05-30T09:02:14Z"
    }
  ],
  "cursor": "evi_01WXYZ"
}`}
            </Response>

            <H3 id="export">Export evidence</H3>
            <Endpoint method="GET" path="/v1/evidence/export" description="Export a full evidence bundle for a task or date range in JSON or CSV format." />
            <ParamTable params={[
                { name: "task_id", type: "string", description: "Export evidence for a specific task" },
                { name: "from", type: "ISO 8601", description: "Start date for export range" },
                { name: "to", type: "ISO 8601", description: "End date for export range" },
                { name: "format", type: "json | csv", default: "json", description: "Export file format" },
            ]} />
            <Code lang="bash">{`# Export all evidence for a task as JSON
curl -H "Authorization: Bearer af_live_xxx" \\
  "https://api.agentfarms.in/v1/evidence/export?task_id=tsk_01ABCD&format=json" \\
  --output task_evidence.json

# Export last 30 days as CSV (for compliance review)
curl -H "Authorization: Bearer af_live_xxx" \\
  "https://api.agentfarms.in/v1/evidence/export?from=2026-05-01&to=2026-05-31&format=csv" \\
  --output may_audit.csv`}</Code>

            <Callout type="tip" title="Compliance exports">
                Enterprise plans include automated monthly evidence exports delivered to an Azure Blob Storage container or S3 bucket. Contact support to configure automated exports.
            </Callout>

            <PageNav
                prev={{ href: "/docs/approvals", label: "Approval Gates" }}
                next={{ href: "/docs/workers", label: "Worker Roles" }}
            />
        </article>
    );
}
