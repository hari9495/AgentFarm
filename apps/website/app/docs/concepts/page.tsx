import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, TypeTable, PageNav, Tag, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "How Workers Operate — AgentFarms Docs",
    description: "Understand the AgentFarms task lifecycle, execution sandbox, working context model, risk classification, and workspace rules.",
    alternates: { canonical: "https://agentfarms.in/docs/concepts" },
};

export default function ConceptsPage() {
    return (
        <article>
            <Tag>Core Concepts</Tag>
            <H1>How Workers Operate</H1>
            <Lead>
                A practical mental model for how AgentFarms workers receive tasks, use context,
                execute inside boundaries, and hand decisions back to people when needed.
            </Lead>

            {/* Task lifecycle */}
            <H2 id="task-lifecycle">Task lifecycle</H2>
            <P>Every governed task moves through the same five-stage flow:</P>

            <div className="my-6 space-y-0">
                {[
                    { stage: "01  Receive", color: "#0066cc", description: "A task is assigned through the dashboard, API, or a connector path (Slack message, webhook, email). The worker acknowledges the task and queues it for planning." },
                    { stage: "02  Plan", color: "#5856d6", description: "The worker gathers context from connected tools and the workspace knowledge base, evaluates policy constraints, and generates a bounded execution plan before taking any action." },
                    { stage: "03  Execute", color: "#1a7a4a", description: "The task runs inside the execution sandbox with tool calls, file changes, and API calls captured as evidence. Actions are classified by risk level before execution." },
                    { stage: "04  Review", color: "#b86800", description: "Output, risk signals, and impact are checked against approval policy. Any action at or above the configured threshold pauses and routes to a human reviewer." },
                    { stage: "05  Iterate", color: "#6e6e73", description: "If the reviewer approves, the task continues. If feedback arrives, the worker adapts its plan, updates the output, and records the new state without losing prior context." },
                ].map((s, i) => (
                    <div key={s.stage} className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ background: s.color }}
                            >
                                {i + 1}
                            </div>
                            {i < 4 && <div className="w-px flex-1 my-1.5" style={{ background: "#e8e8ed" }} />}
                        </div>
                        <div className="pb-4">
                            <p className="font-semibold text-[15px] text-[#1d1d1f] mb-1">{s.stage}</p>
                            <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>{s.description}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Task object */}
            <H3 id="task-object">Task object</H3>
            <TypeTable rows={[
                { field: "id", type: "string", description: "Unique task identifier (tsk_...)" },
                { field: "status", type: "queued | planning | executing | awaiting_approval | completed | failed | cancelled", description: "Current task state" },
                { field: "worker_id", type: "string", description: "ID of the worker assigned to this task" },
                { field: "description", type: "string", description: "Natural language task description provided at creation" },
                { field: "risk_level", type: "low | medium | high", description: "Overall risk classification for this task" },
                { field: "actions_taken", type: "number", description: "Count of individual tool actions executed" },
                { field: "approvals_required", type: "number", description: "Number of approval gates triggered" },
                { field: "evidence_url", type: "string", description: "Link to the full evidence trail for this task" },
                { field: "created_at", type: "ISO 8601", description: "Task creation timestamp" },
                { field: "completed_at", type: "ISO 8601 | null", description: "Task completion timestamp (null if still running)" },
            ]} />

            <Divider />

            {/* Risk classification */}
            <H2 id="risk-classification">Risk classification</H2>
            <P>
                Every action a worker takes is classified into one of three risk levels before it executes.
                The classification is automatic — it does not require configuration per action.
            </P>

            <div className="my-5 space-y-3">
                {[
                    {
                        level: "low",
                        color: "#1a7a4a", bg: "rgba(52,199,89,0.06)", border: "rgba(52,199,89,0.2)",
                        label: "Low risk — auto-executes",
                        examples: ["Lint and formatting passes", "Adding code comments", "Generating documentation", "Reading repository files", "Creating draft PRs"],
                    },
                    {
                        level: "medium",
                        color: "#b86800", bg: "rgba(255,159,10,0.06)", border: "rgba(255,159,10,0.25)",
                        label: "Medium risk — requires approval (threshold: medium or high)",
                        examples: ["Merging a PR", "Sending an internal Slack message", "Updating a Jira ticket status", "Committing to a non-protected branch", "Drafting a customer email (not sent)"],
                    },
                    {
                        level: "high",
                        color: "#c4161c", bg: "rgba(255,59,48,0.06)", border: "rgba(255,59,48,0.2)",
                        label: "High risk — always requires approval",
                        examples: ["Production deployments", "Schema migrations", "Bulk customer emails / sends", "Deleting data or repositories", "Direct writes to production databases", "Modifying access control or permissions"],
                    },
                ].map((r) => (
                    <div key={r.level} className="rounded-[11px] p-4" style={{ background: r.bg, border: `1px solid ${r.border}` }}>
                        <p className="font-semibold text-[14px] mb-2" style={{ color: r.color }}>{r.label}</p>
                        <div className="flex flex-wrap gap-2">
                            {r.examples.map((e) => (
                                <span key={e} className="text-[12px] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.6)", color: "#424245" }}>
                                    {e}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <Callout type="note" title="Custom risk overrides">
                Enterprise plans can define custom risk rules for specific actions, repositories, or connector paths. Contact support to configure custom policy packs.
            </Callout>

            <Divider />

            {/* Execution sandbox */}
            <H2 id="execution-sandbox">Execution sandbox</H2>
            <P>Each task runs inside a dedicated execution environment designed for controlled delivery:</P>
            <ul className="list-disc pl-6 my-4 space-y-2 text-[14px] text-[#424245]" style={{ lineHeight: 1.7 }}>
                <li>A fresh environment is created per task — state is never shared between tasks</li>
                <li>Outbound access is limited to the connectors your workspace has explicitly authorized</li>
                <li>Execution state resets after task completion — a clean environment is guaranteed for the next run</li>
                <li>Workspace context (rules, connector configs) is loaded at task start and cannot be modified mid-task</li>
                <li>Long-running or stalled work can be paused and routed back for review before it continues</li>
            </ul>

            <Divider />

            {/* Working context */}
            <H2 id="working-context">Working context model</H2>
            <P>Workers operate with three practical layers of context:</P>

            <div className="my-5 grid gap-4">
                {[
                    {
                        title: "Workspace context",
                        color: "#0066cc", bg: "rgba(0,102,204,0.04)",
                        items: ["Shared conventions and approved tool access", "Persistent workspace rules (see below)", "Connector credentials and scope definitions", "Role-specific instructions and constraints"],
                    },
                    {
                        title: "Task context",
                        color: "#5856d6", bg: "rgba(88,86,214,0.04)",
                        items: ["Current files, task steps, and intermediate outputs", "Evidence captured during execution", "LLM decision history for this task", "Cleared when the task completes or is cancelled"],
                    },
                    {
                        title: "Conversation history",
                        color: "#1a7a4a", bg: "rgba(52,199,89,0.04)",
                        items: ["Reviewer comments and follow-up guidance on this task", "Slack or portal conversation context", "Retained according to workspace policy"],
                    },
                ].map((tier) => (
                    <div key={tier.title} className="rounded-[11px] p-4" style={{ background: tier.bg, border: `1px solid ${tier.color}25` }}>
                        <p className="font-semibold text-[14px] mb-2" style={{ color: tier.color }}>{tier.title}</p>
                        <ul className="space-y-1">
                            {tier.items.map((item) => (
                                <li key={item} className="flex items-start gap-2 text-[13px] text-[#424245]">
                                    <span style={{ color: tier.color }}>·</span> {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            <Divider />

            {/* Workspace rules */}
            <H2 id="workspace-rules">Workspace rules</H2>
            <P>
                Teams can define workspace-level rules that shape how every worker behaves across
                planning, execution, and review. Rules are defined in a Markdown file committed to
                the <InlineCode>.agentfarms/</InlineCode> directory of your primary repository.
            </P>
            <Code lang="markdown">{`# .agentfarms/rules.md

## Working style
- Prefer named exports for new modules
- Keep risky changes behind review-aware rollout steps
- Add tests for all new business logic before marking a task complete

## Boundaries
- Do not modify files in the /legacy directory without an explicit override
- Never push directly to main, staging, or any protected branch
- Escalate to the approval queue before any production-impacting change

## Code style
- TypeScript strict mode — no implicit any
- Prettier with 100-char line width, single quotes
- Prefer composition over class inheritance

## Escalation
- If a subtask is blocked for more than 30 minutes, surface a status update
- Flag ambiguous requirements before starting implementation`}</Code>

            <Callout type="tip">
                Workspace rules are version-controlled with your codebase. Changes to rules take effect on the next task run. No restart or redeploy required.
            </Callout>

            <Divider />

            {/* RAG + Learning */}
            <H2 id="rag-learning">RAG and the learning flywheel</H2>
            <P>
                Every agent has a dual-memory system that improves over time without retraining:
            </P>
            <div className="my-4 rounded-[11px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                <div className="px-4 py-3" style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                    <p className="font-semibold text-[13px] text-[#1d1d1f]">How the flywheel works</p>
                </div>
                <div className="p-4 space-y-3">
                    {[
                        { step: "Task approved", action: "Output ingested into semantic knowledge base — used as a reference for similar future tasks" },
                        { step: "Task rejected", action: "Feedback classified by category (e.g. code_quality, tone, accuracy) and stored as a lesson in episodic memory" },
                        { step: "Next task", action: "Worker retrieves relevant past outputs, templates, and lessons — performance improves automatically" },
                    ].map((item, i) => (
                        <div key={item.step} className="flex items-start gap-3">
                            <span
                                className="w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0 mt-0.5"
                                style={{ background: "#0066cc" }}
                            >
                                {i + 1}
                            </span>
                            <div>
                                <span className="font-semibold text-[14px] text-[#1d1d1f]">{item.step}</span>
                                <span className="text-[14px] text-[#6e6e73]"> — {item.action}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <PageNav
                prev={{ href: "/docs/quickstart", label: "Quickstart" }}
                next={{ href: "/docs/approvals", label: "Approval Gates" }}
            />
        </article>
    );
}
