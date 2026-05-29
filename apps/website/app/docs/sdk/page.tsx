import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, TypeTable, PageNav, Tag, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "TypeScript SDK",
    description: "The official AgentFarms TypeScript SDK. Install, authenticate, deploy workers, assign tasks, handle approvals, and query evidence.",
    alternates: { canonical: "https://agentfarms.in/docs/sdk" },
};

export default function SdkPage() {
    return (
        <article>
            <Tag>API Reference</Tag>
            <H1>TypeScript SDK</H1>
            <Lead>
                The official AgentFarms SDK for TypeScript and Node.js. Wraps the REST API with
                typed methods, automatic retries, and webhook signature verification.
            </Lead>

            <H2 id="installation">Installation</H2>
            <Code lang="bash">{`npm install @agentfarm/sdk
# or
pnpm add @agentfarm/sdk
# or
yarn add @agentfarm/sdk`}</Code>

            <H2 id="setup">Initializing the client</H2>
            <Code lang="typescript">{`import { AgentFarmClient } from "@agentfarm/sdk";

const client = new AgentFarmClient({
  apiKey: process.env.AGENTFARMS_API_KEY!, // af_live_xxx
  workspaceId: process.env.AGENTFARMS_WORKSPACE_ID!,
  // Optional:
  baseUrl: "https://api.agentfarms.in/v1", // default
  timeout: 30_000,   // request timeout in ms (default: 30s)
  retries: 3,        // auto-retry on 429 / 5xx (default: 3)
});`}</Code>
            <Callout type="note">
                The SDK reads <InlineCode>AGENTFARMS_API_KEY</InlineCode> and <InlineCode>AGENTFARMS_WORKSPACE_ID</InlineCode> from environment variables automatically if not passed explicitly.
            </Callout>

            <Divider />

            <H2 id="workers-sdk">Workers</H2>

            <H3 id="list-workers-sdk">List workers</H3>
            <Code lang="typescript">{`const { workers } = await client.workers.list({
  status: "active",    // optional filter
  role: "backend-developer", // optional filter
  limit: 20,
});

console.log(workers[0].id);   // "wkr_01HXYZ"
console.log(workers[0].name); // "Rex"`}</Code>

            <H3 id="create-worker-sdk">Create a worker</H3>
            <Code lang="typescript">{`const { worker } = await client.workers.create({
  name: "Rex",
  role: "backend-developer",
  repoIds: ["repo_abc123"],
  approvalThreshold: "medium",
  persona: {
    displayName: "Rex",
    email: "rex@yourcompany.com",
  },
});

// Poll until active
await client.workers.waitUntilActive(worker.id, { timeoutMs: 120_000 });
console.log("Worker is live:", worker.id);`}</Code>

            <H3 id="retire-worker-sdk">Retire a worker</H3>
            <Code lang="typescript">{`await client.workers.retire("wkr_01HXYZ");`}</Code>

            <Divider />

            <H2 id="tasks-sdk">Tasks</H2>

            <H3 id="assign-task-sdk">Assign a task</H3>
            <Code lang="typescript">{`const { task } = await client.tasks.create({
  workerId: "wkr_01HXYZ",
  description: \`
    Fix the /api/users email validation endpoint.
    Return clear 400 responses for invalid email formats.
    Add or update tests to prove the behavior.
  \`,
  repoId: "repo_abc123",
  priority: "normal",
  metadata: { jiraTicket: "ENG-482" },
});

console.log("Task queued:", task.id);`}</Code>

            <H3 id="poll-task-sdk">Poll until complete</H3>
            <Code lang="typescript">{`// Simple poll
const completed = await client.tasks.waitUntilComplete("tsk_01ABCD", {
  pollIntervalMs: 5_000,   // check every 5 seconds
  timeoutMs: 600_000,      // give up after 10 minutes
});

if (completed.status === "completed") {
  console.log("PR:", completed.outputs?.pr_url);
  console.log("Evidence:", completed.evidenceUrl);
} else if (completed.status === "awaiting_approval") {
  console.log("Approval needed:", completed.pendingApprovalId);
}`}</Code>

            <H3 id="cancel-task-sdk">Cancel a task</H3>
            <Code lang="typescript">{`await client.tasks.cancel("tsk_01ABCD");`}</Code>

            <Divider />

            <H2 id="approvals-sdk">Approvals</H2>

            <H3 id="list-approvals-sdk">List pending approvals</H3>
            <Code lang="typescript">{`const { approvals } = await client.approvals.list({
  status: "pending",
  workerId: "wkr_01HXYZ", // optional
});

for (const approval of approvals) {
  console.log(approval.id, approval.actionType, approval.riskLevel);
}`}</Code>

            <H3 id="decide-approval-sdk">Decide on an approval</H3>
            <Code lang="typescript">{`// Approve
await client.approvals.approve("apr_01HXYZ", {
  note: "Looks good — proceed with the merge.",
});

// Reject with feedback
await client.approvals.reject("apr_01HXYZ", {
  note: "Please add tests before merging. The changes look correct but coverage is low.",
});`}</Code>

            <H3 id="auto-approve-sdk">Auto-approve low-risk actions</H3>
            <Code lang="typescript">{`// Auto-approve all pending low-risk approvals
const { approvals } = await client.approvals.list({ status: "pending" });

for (const approval of approvals) {
  if (approval.riskLevel === "low") {
    await client.approvals.approve(approval.id);
  }
}`}</Code>

            <Divider />

            <H2 id="evidence-sdk">Evidence</H2>
            <Code lang="typescript">{`// Query evidence for a task
const { evidence } = await client.evidence.list({
  taskId: "tsk_01ABCD",
  eventType: "action.executed",
  limit: 100,
});

// Export to JSON
const bundle = await client.evidence.export({
  taskId: "tsk_01ABCD",
  format: "json",
});
// bundle is a ReadableStream — pipe to a file or process in memory`}</Code>

            <Divider />

            <H2 id="webhooks-sdk">Webhook utilities</H2>
            <Code lang="typescript">{`import { verifyWebhookSignature, parseWebhookPayload } from "@agentfarm/sdk/webhooks";

// In your Express / Fastify handler:
app.post("/webhooks/agentfarms", async (req, res) => {
  const rawBody = req.rawBody as string;
  const signature = req.headers["x-agentfarms-signature"] as string;

  const valid = verifyWebhookSignature(rawBody, signature, process.env.WEBHOOK_SECRET!);
  if (!valid) return res.status(401).send("Invalid signature");

  const event = parseWebhookPayload(rawBody);

  switch (event.event) {
    case "task.completed":
      await handleTaskCompleted(event.data);
      break;
    case "approval.created":
      await notifyTeam(event.data);
      break;
    case "task.failed":
      await alertOncall(event.data);
      break;
  }

  res.status(200).send("ok");
});`}</Code>

            <Divider />

            <H2 id="typescript-types">TypeScript types</H2>
            <P>All SDK methods return fully typed objects. Key types:</P>
            <TypeTable rows={[
                { field: "Worker", type: "interface", description: "id, name, role, status, approvalThreshold, tasksCompleted, createdAt" },
                { field: "Task", type: "interface", description: "id, status, workerId, description, riskLevel, progress, outputs, evidenceUrl" },
                { field: "Approval", type: "interface", description: "id, taskId, workerId, actionType, riskLevel, status, actionPayload, expiresAt" },
                { field: "EvidenceRecord", type: "interface", description: "id, taskId, eventType, actionType, riskLevel, outcome, payload, timestamp" },
                { field: "WorkerRole", type: "union type", description: "backend-developer | full-stack-developer | qa-engineer | technical-writer | ..." },
                { field: "RiskLevel", type: "union type", description: "'low' | 'medium' | 'high'" },
                { field: "ApprovalThreshold", type: "union type", description: "'low' | 'medium' | 'high'" },
                { field: "WebhookEvent", type: "discriminated union", description: "TaskQueuedEvent | TaskCompletedEvent | ApprovalCreatedEvent | ..." },
            ]} />

            <Divider />

            <H2 id="error-handling-sdk">Error handling</H2>
            <Code lang="typescript">{`import { AgentFarmsError } from "@agentfarm/sdk";

try {
  const { task } = await client.tasks.create({
    workerId: "wkr_invalid",
    description: "Fix the bug",
  });
} catch (err) {
  if (err instanceof AgentFarmsError) {
    console.error(err.code);     // "not_found"
    console.error(err.message);  // "Worker wkr_invalid not found"
    console.error(err.status);   // 404
  }
}`}</Code>

            <Callout type="tip">
                The SDK automatically retries on <InlineCode>429 Rate Limited</InlineCode> and <InlineCode>5xx</InlineCode> errors with exponential backoff. Configure <InlineCode>retries: 0</InlineCode> to disable this.
            </Callout>

            <PageNav
                prev={{ href: "/docs/webhooks", label: "Webhooks" }}
                next={{ href: "/docs/environment", label: "Environment Variables" }}
            />
        </article>
    );
}
