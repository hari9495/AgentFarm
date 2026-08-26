import type { Metadata } from "next";
import Link from "next/link";
import { H1, H2, H3, Lead, P, Code, Callout, Steps, Step, Endpoint, Response, InlineCode, PageNav, Tag } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Quickstart — AgentFarms Docs",
    description: "Deploy your first governed AI worker in under 10 minutes. Step-by-step guide to connect tools, set approval policy, and assign the first task.",
    alternates: { canonical: "https://agentfarms.in/docs/quickstart" },
};

export default function QuickstartPage() {
    return (
        <article>
            <Tag>Getting Started</Tag>
            <H1>Quickstart</H1>
            <Lead>Deploy your first governed AI worker in under 10 minutes.</Lead>

            <Callout type="note">
                This guide assumes you have an AgentFarms account. If you don&apos;t, <Link href="/get-started" className="text-[var(--op-indigo)] hover:underline font-medium">start your free trial</Link> — no credit card required.
            </Callout>

            {/* Prerequisites */}
            <H2 id="prerequisites">Prerequisites</H2>
            <P>Before you begin, make sure you have:</P>
            <ul className="list-disc pl-6 my-4 space-y-1.5 text-[15px] text-[var(--op-ink-soft)]">
                <li>An AgentFarms account (Starter+ or above)</li>
                <li>At least one connected tool — GitHub, Jira, or Slack (you can add these during setup)</li>
                <li>Your <InlineCode>af_live_</InlineCode> API key from the workspace settings</li>
            </ul>

            {/* Steps */}
            <H2 id="steps">Deployment steps</H2>
            <Steps>
                <Step n={1} title="Create your account and choose a starting role">
                    <P>Sign up with a work email at <Link href="/get-started" className="text-[var(--op-indigo)] hover:underline">agentfarms.in/get-started</Link>. During onboarding you&apos;ll be asked to choose your first worker role.</P>
                    <P>Available roles include Backend Developer, QA Engineer, Technical Writer, Sales Rep, Customer Support Agent, Project Manager, and more. If you&apos;re unsure, start with <strong>AI Backend Developer</strong> — it&apos;s the fastest to prove value.</P>
                    <Callout type="tip">Choose the role that maps to the workflow costing your team the most time this week. You can add more workers after the first one proves itself.</Callout>
                </Step>

                <Step n={2} title="Connect GitHub (or another tool)">
                    <P>From <strong>Settings → Connectors</strong>, add GitHub and authorize access to the repositories the worker should use.</P>
                    <Code lang="bash">{`# Permissions AgentFarms requests for GitHub:
# - Read and write access to selected repositories
# - Pull request creation and management
# - GitHub Actions: read CI status, trigger workflows
# - Issues: read and write

# Tip: keep scope as narrow as possible
# You can update access at any time from GitHub App settings`}</Code>
                    <P>AgentFarms uses OAuth 2.0 with automatic token refresh. The worker only accesses repositories you explicitly authorize.</P>
                    <Callout type="note">Other available connectors: Jira, Linear, Slack, Microsoft Teams, Gmail, Outlook, Salesforce, HubSpot, Zendesk, and more. See the <Link href="/docs/connectors" className="text-[var(--op-indigo)] hover:underline">full connector list</Link>.</Callout>
                </Step>

                <Step n={3} title="Set identity and approval policy">
                    <P>Configure how the worker presents itself and where human approval is required before actions execute.</P>
                    <Code lang="http">{`POST https://api.agentfarms.in/v1/personas
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "botId": "wkr_01HXYZ",
  "name": "Rex",
  "email": "rex@yourcompany.com",
  "approvalThreshold": "medium"
}`}</Code>
                    <P>The <InlineCode>approvalThreshold</InlineCode> controls when the worker pauses for human review:</P>
                    <div className="overflow-hidden rounded-[11px] my-4" style={{ border: "1px solid var(--op-line)" }}>
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr style={{ background: "var(--op-paper-2)", borderBottom: "1px solid var(--op-line)" }}>
                                    <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Threshold</th>
                                    <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Behaviour</th>
                                    <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Best for</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { t: "low", b: "Only high-risk actions pause for approval. Low + medium proceed automatically.", bf: "Teams comfortable with the worker's judgment" },
                                    { t: "medium", b: "High and medium-risk actions pause. Low-risk actions proceed automatically.", bf: "Recommended starting point" },
                                    { t: "high", b: "All actions pause for approval, including low-risk ones.", bf: "Initial evaluation or sensitive environments" },
                                ].map((r, i) => (
                                    <tr key={r.t} style={{ borderBottom: i < 2 ? "1px solid var(--op-line)" : "none" }}>
                                        <td className="px-4 py-3"><code className="font-mono text-[#5856d6]">{r.t}</code></td>
                                        <td className="px-4 py-3 text-[var(--op-muted)]">{r.b}</td>
                                        <td className="px-4 py-3 text-[var(--op-muted)]">{r.bf}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Step>

                <Step n={4} title="Deploy your first worker">
                    <P>Create a worker by calling the Workers API or using the Dashboard wizard.</P>
                    <Code lang="http">{`POST https://api.agentfarms.in/v1/workers
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "name": "Rex",
  "role": "backend-developer",
  "repo_ids": ["repo_abc123"],
  "approval_threshold": "medium"
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
                    <P>The worker status moves from <InlineCode>provisioning</InlineCode> → <InlineCode>active</InlineCode> in about 30–60 seconds.</P>
                </Step>

                <Step n={5} title="Assign the first task">
                    <P>Send a real task to the worker. Keep it bounded and specific for the first run.</P>
                    <Code lang="http">{`POST https://api.agentfarms.in/v1/tasks
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "worker_id": "wkr_01HXYZ",
  "repo_id": "repo_abc123",
  "description": "Prepare a fix for the /api/users validation path.
Return clear 400 responses for invalid email input.
Add or update tests that prove the behavior."
}`}</Code>
                    <Response status={201} label="Task queued">
{`{
  "task": {
    "id": "tsk_01ABCD",
    "status": "queued",
    "worker_id": "wkr_01HXYZ",
    "estimated_completion": "2026-05-30T09:20:00Z"
  }
}`}
                    </Response>
                    <P>The worker will plan the task, execute it inside the connected repository, and either complete it automatically (if all actions are below your threshold) or surface an approval request for you to review.</P>
                </Step>
            </Steps>

            {/* What happens next */}
            <H2 id="what-next">What happens after the first task</H2>
            <P>Check the evidence trail in the Dashboard or via the API:</P>
            <Code lang="http">{`GET https://api.agentfarms.in/v1/tasks/tsk_01ABCD
Authorization: Bearer af_live_xxxxxxxxxxxxxxxxxxxx`}</Code>
            <Response status={200} label="Task detail">
{`{
  "task": {
    "id": "tsk_01ABCD",
    "status": "completed",
    "progress": 1.0,
    "actions_taken": 7,
    "approvals_required": 1,
    "approvals_granted": 1,
    "pr_url": "https://github.com/org/repo/pull/482",
    "evidence_url": "https://api.agentfarms.in/v1/evidence?task_id=tsk_01ABCD"
  }
}`}
            </Response>

            <Callout type="tip" title="Approval notifications">
                If a task requires your approval, you&apos;ll receive a notification in Slack (if connected) and in the Dashboard. Approvals expire after 24 hours by default.
            </Callout>

            {/* Popular topics */}
            <H2 id="popular-topics">Popular next steps</H2>
            <div className="grid sm:grid-cols-2 gap-3 my-4">
                {[
                    { href: "/docs/concepts", label: "Understand the task lifecycle" },
                    { href: "/docs/approvals", label: "Configure approval gates" },
                    { href: "/docs/connectors", label: "Add more connectors" },
                    { href: "/docs/workers", label: "Browse all 12 worker roles" },
                    { href: "/docs/api-reference", label: "Full REST API reference" },
                    { href: "/docs/webhooks", label: "Subscribe to task events" },
                ].map((l) => (
                    <Link
                        key={l.href}
                        href={l.href}
                        className="flex items-center gap-2 px-4 py-3 rounded-[11px] text-[14px] font-medium text-[var(--op-indigo)] hover:text-[var(--op-indigo-ink)] transition-colors"
                        style={{ border: "1px solid var(--op-line)" }}
                    >
                        {l.label} →
                    </Link>
                ))}
            </div>

            <PageNav
                prev={{ href: "/docs", label: "Overview" }}
                next={{ href: "/docs/concepts", label: "How Workers Operate" }}
            />
        </article>
    );
}
