import type { Metadata } from "next";
import { H1, H2, H3, Lead, P, Code, Callout, InlineCode, TypeTable, PageNav, Tag, Divider } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Environment Variables",
    description: "All AgentFarms environment variables for the API Gateway, Agent Runtime, Trigger Service, and website. Self-hosted configuration reference.",
    alternates: { canonical: "https://agentfarms.in/docs/environment" },
};

export default function EnvironmentPage() {
    return (
        <article>
            <Tag>Configuration</Tag>
            <H1>Environment Variables</H1>
            <Lead>
                Complete reference for all AgentFarms environment variables. Required for
                self-hosted deployments or local development.
            </Lead>

            <Callout type="note" title="Managed cloud">
                If you&apos;re using AgentFarms Cloud (agentfarms.in), you don&apos;t need to configure any of these — they are managed for you. This reference is for teams running self-hosted deployments.
            </Callout>

            <H2 id="minimum">Minimum required variables</H2>
            <P>These variables must be set for a minimal local deployment to work:</P>
            <Code lang="bash">{`# Core infrastructure
DATABASE_URL=postgresql://user:password@localhost:5432/agentfarms
REDIS_URL=redis://localhost:6379
OPA_BASE_URL=http://localhost:8181

# API Gateway security
API_SESSION_SECRET=your-32-char-secret-here   # must be 32+ chars
API_REQUIRE_AUTH=true

# Inter-service HMAC tokens (generate with openssl rand -hex 32)
APPROVAL_INTAKE_SHARED_TOKEN=...
CONNECTOR_EXEC_SHARED_TOKEN=...
RUNTIME_DECISION_SHARED_TOKEN=...
RUNTIME_DISPATCH_SHARED_TOKEN=...
RUNTIME_TASK_SHARED_TOKEN=...

# At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...`}</Code>

            <Divider />

            <H2 id="infrastructure">Infrastructure</H2>
            <TypeTable rows={[
                { field: "DATABASE_URL", type: "string (required)", description: "PostgreSQL connection string. Must include the database name." },
                { field: "POSTGRES_PASSWORD", type: "string", description: "Used by Docker Compose to set the DB password during init." },
                { field: "REDIS_URL", type: "string (required)", description: "Redis connection string. Used for rate limiting, session store, and task queues." },
                { field: "OPA_BASE_URL", type: "string (required)", description: "Open Policy Agent base URL (default port: 8181)." },
            ]} />

            <Divider />

            <H2 id="api-gateway">API Gateway (port 3000)</H2>
            <TypeTable rows={[
                { field: "API_GATEWAY_PORT", type: "number", description: "HTTP port for the API Gateway (default: 3000)." },
                { field: "API_REQUIRE_AUTH", type: "boolean", description: "Enforce authentication on all /v1/* routes. Set false only for local dev." },
                { field: "API_SESSION_SECRET", type: "string (required)", description: "Secret for signing session cookies. Must be 32+ characters." },
                { field: "ALLOWED_ORIGINS", type: "string (CSV)", description: "CORS allowed origins (e.g. https://agentfarms.in,http://localhost:3001)." },
                { field: "AGENT_RUNTIME_URL", type: "string", description: "Internal URL of the agent runtime service (default: http://localhost:4000)." },
                { field: "ORCHESTRATOR_API_BASE_URL", type: "string", description: "Internal URL of the orchestrator service (default: http://localhost:3011)." },
            ]} />

            <H3 id="inter-service-tokens">Inter-service HMAC tokens</H3>
            <P>These tokens authenticate internal service-to-service calls. Generate each with:</P>
            <Code lang="bash">{`openssl rand -hex 32`}</Code>
            <TypeTable rows={[
                { field: "APPROVAL_INTAKE_SHARED_TOKEN", type: "string (required)", description: "Authenticates approval intake calls from Agent Runtime → API Gateway." },
                { field: "CONNECTOR_EXEC_SHARED_TOKEN", type: "string (required)", description: "Authenticates connector execution calls." },
                { field: "RUNTIME_DECISION_SHARED_TOKEN", type: "string (required)", description: "Authenticates approval decision callbacks from API Gateway → Agent Runtime." },
                { field: "RUNTIME_DISPATCH_SHARED_TOKEN", type: "string (required)", description: "Authenticates agent dispatch calls between services." },
                { field: "RUNTIME_TASK_SHARED_TOKEN", type: "string (required)", description: "Authenticates task creation calls from Trigger Service → Agent Runtime." },
            ]} />

            <H3 id="webhook-secrets">Webhook secrets</H3>
            <TypeTable rows={[
                { field: "WEBHOOK_INGEST_SECRET", type: "string", description: "HMAC secret for validating inbound generic webhooks." },
                { field: "SLACK_WEBHOOK_SECRET", type: "string", description: "Slack app signing secret for verifying Slack event payloads." },
                { field: "TEAMS_WEBHOOK_SECRET", type: "string", description: "Microsoft Teams outgoing webhook secret." },
            ]} />

            <H3 id="observability">Observability</H3>
            <TypeTable rows={[
                { field: "APPLICATIONINSIGHTS_CONNECTION_STRING", type: "string", description: "Azure Application Insights connection string for traces, metrics, and logs." },
                { field: "OTEL_EXPORTER_OTLP_ENDPOINT", type: "string", description: "OpenTelemetry OTLP endpoint for non-Azure deployments." },
            ]} />

            <Divider />

            <H2 id="agent-runtime">Agent Runtime (port 4000)</H2>
            <TypeTable rows={[
                { field: "RUNTIME_PORT", type: "number", description: "HTTP port for the agent runtime (default: 4000)." },
                { field: "AF_TENANT_ID", type: "string", description: "Tenant context for the running agent instance." },
                { field: "AF_WORKSPACE_ID", type: "string", description: "Workspace context for the running agent instance." },
                { field: "AF_BOT_ID", type: "string", description: "Deployed worker ID for this runtime instance." },
                { field: "AF_ROLE_PROFILE", type: "string", description: "Role profile identifier (maps to a connector + policy pack)." },
                { field: "AF_APPROVAL_API_URL", type: "string", description: "URL for posting approval requests to the API Gateway." },
                { field: "AF_EVIDENCE_API_URL", type: "string", description: "URL for posting evidence records." },
                { field: "AF_CONNECTOR_API_URL", type: "string", description: "URL for the connector gateway." },
                { field: "AF_LOG_LEVEL", type: "string", description: "Log verbosity: error | warn | info | debug (default: info)." },
                { field: "AF_ENFORCE_TASK_LEASE", type: "boolean", description: "Enable distributed task lease to prevent duplicate execution (default: true)." },
                { field: "AF_TASK_LEASE_TTL_SECONDS", type: "number", description: "Task lease expiry in seconds (default: 300)." },
            ]} />

            <H3 id="llm-providers">LLM providers</H3>
            <TypeTable rows={[
                { field: "AF_MODEL_PROVIDER", type: "string", description: "Active provider: openai | anthropic | azure_openai | google | xai | mistral | together | auto" },
                { field: "AF_DEFAULT_MODEL_PROFILE", type: "string", description: "Model profile: quality_first | speed_first | cost_balanced | custom" },
                { field: "AF_LLM_TIMEOUT_MS", type: "number", description: "LLM request timeout in milliseconds (default: 120000)." },
                { field: "ANTHROPIC_API_KEY", type: "string", description: "Anthropic API key for Claude models." },
                { field: "OPENAI_API_KEY", type: "string", description: "OpenAI API key for GPT-4o and other models." },
                { field: "AZURE_OPENAI_API_KEY", type: "string", description: "Azure OpenAI API key." },
                { field: "AZURE_OPENAI_ENDPOINT", type: "string", description: "Azure OpenAI endpoint URL." },
                { field: "GOOGLE_API_KEY", type: "string", description: "Google AI API key for Gemini models." },
                { field: "XAI_API_KEY", type: "string", description: "xAI API key for Grok models." },
                { field: "MISTRAL_API_KEY", type: "string", description: "Mistral AI API key." },
                { field: "TOGETHER_API_KEY", type: "string", description: "Together AI API key for open-source models." },
            ]} />

            <H3 id="token-budget">Token budget</H3>
            <TypeTable rows={[
                { field: "AF_TOKEN_BUDGET_DAILY_LIMIT", type: "number", description: "Maximum tokens per workspace per day across all workers." },
                { field: "AF_TOKEN_BUDGET_WARNING_THRESHOLD", type: "number (0–1)", description: "Warning alert threshold (default: 0.8 = 80% of daily limit)." },
                { field: "AF_TOKEN_BUDGET_CRITICAL_THRESHOLD", type: "number (0–1)", description: "Critical alert threshold (default: 0.9 = 90% of daily limit)." },
            ]} />

            <H3 id="storage">Azure storage</H3>
            <TypeTable rows={[
                { field: "AZURE_BLOB_CONNECTION_STRING", type: "string", description: "Azure Blob Storage connection string for evidence and file attachments." },
                { field: "AZURE_BLOB_CONTAINER_NAME", type: "string", description: "Container name for general blob storage." },
                { field: "AZURE_BLOB_EVIDENCE_CONTAINER_NAME", type: "string", description: "Container name for evidence exports." },
                { field: "BLOB_WRITE_SAS_TOKEN", type: "string", description: "SAS token with write permission for evidence uploads." },
                { field: "BLOB_READ_SAS_TOKEN", type: "string", description: "SAS token with read permission for evidence downloads." },
            ]} />

            <Divider />

            <H2 id="trigger-service">Trigger Service (port 3002)</H2>
            <TypeTable rows={[
                { field: "TRIGGER_SERVICE_PORT", type: "number", description: "HTTP port (default: 3002)." },
                { field: "TRIGGER_TENANT_ID", type: "string", description: "Default tenant for triggered tasks." },
                { field: "TRIGGER_DEFAULT_AGENT_ID", type: "string", description: "Default worker to route tasks to if not specified." },
                { field: "AGENT_RUNTIME_URL", type: "string", description: "Internal Agent Runtime URL for task submission." },
                { field: "WEBHOOK_HMAC_SECRET", type: "string", description: "Secret for verifying inbound webhook signatures." },
            ]} />

            <H3 id="email-trigger">Email trigger (IMAP)</H3>
            <TypeTable rows={[
                { field: "EMAIL_IMAP_HOST", type: "string", description: "IMAP server hostname." },
                { field: "EMAIL_IMAP_PORT", type: "number", description: "IMAP port (typically 993 for TLS)." },
                { field: "EMAIL_IMAP_TLS", type: "boolean", description: "Use TLS (default: true)." },
                { field: "EMAIL_IMAP_USER", type: "string", description: "IMAP account email address." },
                { field: "EMAIL_IMAP_PASSWORD", type: "string", description: "IMAP account password or app-specific password." },
            ]} />

            <H3 id="slack-trigger">Slack trigger</H3>
            <TypeTable rows={[
                { field: "SLACK_BOT_TOKEN", type: "string", description: "Slack bot OAuth token (xoxb-...)." },
                { field: "SLACK_SIGNING_SECRET", type: "string", description: "Slack app signing secret for verifying event payloads." },
            ]} />

            <Divider />

            <H2 id="payments">Payments</H2>
            <TypeTable rows={[
                { field: "STRIPE_SECRET_KEY", type: "string", description: "Stripe API secret key for subscription management." },
                { field: "STRIPE_WEBHOOK_SECRET", type: "string", description: "Stripe webhook signing secret." },
                { field: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", type: "string", description: "Stripe publishable key for client-side checkout." },
                { field: "RAZORPAY_KEY_ID", type: "string", description: "Razorpay API key ID (India payments)." },
                { field: "RAZORPAY_KEY_SECRET", type: "string", description: "Razorpay API key secret." },
                { field: "NEXT_PUBLIC_RAZORPAY_KEY_ID", type: "string", description: "Razorpay public key for client-side integration." },
            ]} />

            <Divider />

            <H2 id="website">Website &amp; Dashboard</H2>
            <TypeTable rows={[
                { field: "NEXT_PUBLIC_SITE_URL", type: "string", description: "Public site URL (e.g. https://agentfarms.in)." },
                { field: "NEXT_PUBLIC_API_URL", type: "string", description: "API base URL accessible from the browser." },
                { field: "DASHBOARD_API_BASE_URL", type: "string", description: "Internal API Gateway URL for server-side dashboard requests." },
                { field: "AGENTFARM_SUPERADMIN_EMAILS", type: "string (CSV)", description: "Email addresses with super-admin access." },
                { field: "AGENTFARM_ALLOWED_SIGNUP_EMAILS", type: "string (CSV)", description: "Allowlist of emails permitted to sign up." },
                { field: "AGENTFARM_ALLOWED_SIGNUP_DOMAINS", type: "string (CSV)", description: "Allowlist of email domains permitted to sign up." },
            ]} />

            <PageNav
                prev={{ href: "/docs/sdk", label: "TypeScript SDK" }}
            />
        </article>
    );
}
