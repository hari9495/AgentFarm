import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

export type UserRole = "superadmin" | "admin" | "member";

type UserRecord = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    tenantId: string | null;
    gatewayTenantId: string | null;
    gatewayWorkspaceId: string | null;
    gatewayBotId: string | null;
    gatewayToken: string | null;
};

type SessionRecord = {
    sessionId: string;
    userId: string;
    expiresAt: number;
};

export type ApprovalRisk = "low" | "medium" | "high";
export type ApprovalDecision = "pending" | "approved" | "rejected";

export type ApprovalRecord = {
    id: string;
    title: string;
    agentSlug: string;
    agent: string;
    requestedBy: string;
    channel: string;
    reason: string;
    risk: ApprovalRisk;
    status: ApprovalDecision;
    createdAt: number;
    decidedAt: number | null;
    decidedBy: string | null;
    decisionReason: string | null;
    decisionLatencySeconds: number | null;
    escalationTimeoutSeconds: number;
    escalatedAt: number | null;
};

export type ActivityFeedEvent = {
    id: string;
    time: string;
    agent: string;
    action: string;
    detail: string;
    type: "approval";
    approvalOutcome: "requested" | "approved" | "rejected";
};

export type ComplianceEvidenceSummary = {
    generatedAt: number;
    windowHours: number;
    approvalsRequested: number;
    approvalsPending: number;
    approvalsApproved: number;
    approvalsRejected: number;
    escalatedApprovals: number;
    auditEventsCaptured: number;
    approvalDecisionLatencyP95Seconds: number | null;
    evidenceFreshnessSeconds: number | null;
};

export type ComplianceEvidencePack = {
    generatedAt: number;
    tenantId: string | null;
    retentionPolicy: {
        activeDays: number;
        archiveDays: number;
    };
    summary: ComplianceEvidenceSummary;
    approvals: ApprovalRecord[];
    auditEvents: AuditEventRecord[];
};

export type DeploymentStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type DeploymentActionType = "requested" | "retried" | "canceled";

export type DeploymentJobRecord = {
    id: string;
    userId: string;
    botSlug: string;
    botName: string;
    status: DeploymentStatus;
    statusMessage: string;
    createdAt: number;
    updatedAt: number;
    lastActionType: DeploymentActionType | null;
    lastActionBy: string | null;
    lastActionAt: number | null;
};

export type UserOnboardingState = {
    userId: string;
    starterAgent: string | null;
    onboardingCompletedAt: number | null;
};

export type CustomerTenantStatus = "pending" | "provisioning" | "ready" | "degraded" | "suspended" | "terminated";
export type CustomerWorkspaceStatus = "pending" | "provisioning" | "ready" | "degraded" | "suspended" | "failed";
export type CustomerBotStatus = "created" | "bootstrapping" | "connector_setup_required" | "active" | "paused" | "failed";

export type CustomerTenantRecord = {
    id: string;
    tenantName: string;
    planId: string;
    billingStatus: string;
    tenantStatus: CustomerTenantStatus;
    createdAt: number;
};

export type CustomerWorkspaceRecord = {
    id: string;
    tenantId: string;
    workspaceName: string;
    roleType: string;
    runtimeTier: string;
    workspaceStatus: CustomerWorkspaceStatus;
    createdAt: number;
};

export type CustomerBotRecord = {
    id: string;
    workspaceId: string;
    botName: string;
    botStatus: CustomerBotStatus;
    policyPackVersion: string;
    connectorProfileId: string | null;
    createdAt: number;
};

export type WorkspaceBotContextRecord = {
    tenantId: string;
    workspaceId: string;
    workspaceName: string;
    roleType: string;
    botId: string;
    botName: string;
    botStatus: CustomerBotStatus;
    policyPackVersion: string;
};

export type ProvisioningJobStatus =
    | "queued"
    | "validating"
    | "creating_resources"
    | "bootstrapping_vm"
    | "starting_container"
    | "registering_runtime"
    | "healthchecking"
    | "completed"
    | "failed"
    | "cleanup_pending"
    | "cleaned_up";

export type ProvisioningQueueEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    planId: string;
    runtimeTier: string;
    roleType: string;
    correlationId: string;
    requestedAt: number;
    requestedBy: string;
    triggerSource: string;
    status: ProvisioningJobStatus;
    failureReason: string | null;
    remediationHint: string | null;
    retryOfJobId: string | null;
    retryAttemptCount: number;
    createdAt: number;
    updatedAt: number;
};

export type ProvisioningTimelineEntry = {
    status: ProvisioningJobStatus;
    at: number;
    reason: string | null;
};

export type ProvisioningSlaMetrics = {
    elapsedSeconds: number;
    targetSeconds: number;
    timeoutSeconds: number;
    stuckThresholdSeconds: number;
    withinTarget: boolean;
    breachedTarget: boolean;
    isStuck: boolean;
    isTimedOut: boolean;
};

type MarketplaceSelectionRecord = {
    userId: string;
    starterAgent: string;
    configJson: string;
    updatedAt: number;
};

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SALT_LEN = 32;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const parseCsvEnv = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
};

const superAdminEmailSet = new Set(parseCsvEnv(process.env.AGENTFARM_SUPERADMIN_EMAILS));
const superAdminDomainSet = new Set(parseCsvEnv(process.env.AGENTFARM_SUPERADMIN_DOMAINS));
const hasExplicitSuperAdminRules = superAdminEmailSet.size > 0 || superAdminDomainSet.size > 0;

const adminEmailSet = new Set(parseCsvEnv(process.env.AGENTFARM_ADMIN_EMAILS));
const adminDomainSet = new Set(parseCsvEnv(process.env.AGENTFARM_ADMIN_DOMAINS));
const hasExplicitAdminRules = adminEmailSet.size > 0 || adminDomainSet.size > 0;
const hasExplicitPrivilegedRules = hasExplicitSuperAdminRules || hasExplicitAdminRules;
let hasWarnedMissingCompanyOperatorConfig = false;

type CompanyOperatorPolicyInput = {
    nodeEnv?: string;
    companyEmails?: string;
    companyDomains?: string;
    fallbackDomains?: string;
    disableFallback?: string;
};

const hasExplicitCompanyOperatorRules = (input?: CompanyOperatorPolicyInput): boolean => {
    const companyEmails = new Set(parseCsvEnv(input?.companyEmails ?? process.env.AGENTFARM_COMPANY_EMAILS));
    const companyDomains = new Set(parseCsvEnv(input?.companyDomains ?? process.env.AGENTFARM_COMPANY_DOMAINS));
    return companyEmails.size > 0 || companyDomains.size > 0;
};

const isSuperAdminEligibleEmail = (email: string): boolean => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    if (superAdminEmailSet.has(normalized)) return true;

    const domain = normalized.split("@")[1] ?? "";
    return domain ? superAdminDomainSet.has(domain) : false;
};

export const isCompanyOperatorEmailForPolicy = (email: string, input?: CompanyOperatorPolicyInput): boolean => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;

    const companyEmails = new Set(parseCsvEnv(input?.companyEmails ?? process.env.AGENTFARM_COMPANY_EMAILS));
    if (companyEmails.has(normalized)) return true;

    const domain = normalized.split("@")[1] ?? "";
    const companyDomains = new Set(parseCsvEnv(input?.companyDomains ?? process.env.AGENTFARM_COMPANY_DOMAINS));
    if (domain && companyDomains.has(domain)) return true;

    const hasExplicitRules = companyEmails.size > 0 || companyDomains.size > 0;
    if (!hasExplicitRules) {
        const nodeEnv = (input?.nodeEnv ?? process.env.NODE_ENV ?? "development").toLowerCase();
        const disableFallback =
            (input?.disableFallback ?? process.env.AGENTFARM_DISABLE_COMPANY_FALLBACK ?? "").toLowerCase() === "true";

        if (nodeEnv === "production" || disableFallback) {
            return false;
        }

        const fallbackDomains = parseCsvEnv(input?.fallbackDomains ?? process.env.AGENTFARM_COMPANY_FALLBACK_DOMAINS);
        const effectiveFallbackDomains = fallbackDomains.length > 0 ? fallbackDomains : ["agentfarm.local"];
        return domain ? effectiveFallbackDomains.includes(domain) : false;
    }

    return false;
};

export const isCompanyOperatorEmail = (email: string): boolean => {
    if (
        !hasWarnedMissingCompanyOperatorConfig
        && (process.env.NODE_ENV ?? "").toLowerCase() === "production"
        && !hasExplicitCompanyOperatorRules()
    ) {
        hasWarnedMissingCompanyOperatorConfig = true;
        console.warn(
            "[auth-store] Company operator policy has no explicit AGENTFARM_COMPANY_EMAILS or AGENTFARM_COMPANY_DOMAINS in production; access defaults to deny.",
        );
    }

    return isCompanyOperatorEmailForPolicy(email);
};

const isAdminEligibleEmail = (email: string): boolean => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    if (adminEmailSet.has(normalized)) return true;

    const domain = normalized.split("@")[1] ?? "";
    return domain ? adminDomainSet.has(domain) : false;
};

const getEffectiveRole = (email: string, storedRole: UserRole): UserRole => {
    if (hasExplicitSuperAdminRules) {
        if (isSuperAdminEligibleEmail(email)) return "superadmin";
    } else if (storedRole === "superadmin") {
        return "superadmin";
    }

    if (hasExplicitAdminRules) {
        return isAdminEligibleEmail(email) ? "admin" : "member";
    }

    return storedRole;
};

const AUTH_DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";
const db = new DatabaseSync(AUTH_DB_PATH);
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
    password_hash TEXT NOT NULL,
    github_org TEXT,
    invite_email TEXT,
    starter_agent TEXT,
    onboarding_completed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    agent_slug TEXT NOT NULL,
    agent TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    channel TEXT NOT NULL,
    reason TEXT NOT NULL,
    risk TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
        decided_by TEXT,
        decision_reason TEXT,
        decision_latency_seconds INTEGER,
        escalation_timeout_seconds INTEGER NOT NULL DEFAULT 3600,
        escalated_at INTEGER,
        tenant_id TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_approvals_agent_slug ON approvals(agent_slug);
  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_approvals_created_at ON approvals(created_at);

  CREATE TABLE IF NOT EXISTS company_audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT '',
    before_state TEXT NOT NULL DEFAULT '{}',
    after_state TEXT NOT NULL DEFAULT '{}',
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_actor ON company_audit_events(actor_email);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON company_audit_events(action);
  CREATE INDEX IF NOT EXISTS idx_audit_tenant ON company_audit_events(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON company_audit_events(created_at);

    CREATE TABLE IF NOT EXISTS deployment_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        bot_slug TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        status TEXT NOT NULL,
        status_message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_action_type TEXT,
        last_action_by TEXT,
        last_action_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_user_created ON deployment_jobs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS marketplace_selections (
        user_id TEXT PRIMARY KEY,
        starter_agent TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_tenants (
        id TEXT PRIMARY KEY,
        tenant_name TEXT NOT NULL,
        plan_id TEXT NOT NULL DEFAULT 'starter',
        billing_status TEXT NOT NULL DEFAULT 'trial',
        tenant_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_workspaces (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        workspace_name TEXT NOT NULL,
        role_type TEXT NOT NULL DEFAULT 'developer',
        runtime_tier TEXT NOT NULL DEFAULT 'standard',
        workspace_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES customer_tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_bots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        bot_status TEXT NOT NULL DEFAULT 'created',
        policy_pack_version TEXT NOT NULL DEFAULT 'v1',
        connector_profile_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES customer_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provisioning_queue (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        runtime_tier TEXT NOT NULL,
        role_type TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        requested_by TEXT NOT NULL,
        trigger_source TEXT NOT NULL DEFAULT 'signup_complete',
        status TEXT NOT NULL DEFAULT 'queued',
        failure_reason TEXT,
        remediation_hint TEXT,
        retry_of_job_id TEXT,
        retry_attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_provisioning_tenant ON provisioning_queue(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_provisioning_status ON provisioning_queue(status);
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
const hasRoleColumn = userColumns.some((column) => column.name === "role");
if (!hasRoleColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';`);
}

const hasTenantIdColumn = userColumns.some((column) => column.name === "tenant_id");
if (!hasTenantIdColumn) {
    db.exec(`ALTER TABLE users ADD COLUMN tenant_id TEXT;`);
}

// Use try/catch in addition to PRAGMA guards — Next.js build spawns parallel
// workers that can all read PRAGMA before any ALTER commits, causing a race.
const hasGatewayTenantIdColumn = userColumns.some((column) => column.name === "gateway_tenant_id");
if (!hasGatewayTenantIdColumn) {
    try { db.exec(`ALTER TABLE users ADD COLUMN gateway_tenant_id TEXT;`); } catch { /* already added by parallel worker */ }
}

const hasGatewayWorkspaceIdColumn = userColumns.some((column) => column.name === "gateway_workspace_id");
if (!hasGatewayWorkspaceIdColumn) {
    try { db.exec(`ALTER TABLE users ADD COLUMN gateway_workspace_id TEXT;`); } catch { /* already added by parallel worker */ }
}

const hasGatewayBotIdColumn = userColumns.some((column) => column.name === "gateway_bot_id");
if (!hasGatewayBotIdColumn) {
    try { db.exec(`ALTER TABLE users ADD COLUMN gateway_bot_id TEXT;`); } catch { /* already added by parallel worker */ }
}

const hasGatewayTokenColumn = userColumns.some((column) => column.name === "gateway_token");
if (!hasGatewayTokenColumn) {
    try { db.exec(`ALTER TABLE users ADD COLUMN gateway_token TEXT;`); } catch { /* already added by parallel worker */ }
}

const deploymentColumns = db.prepare(`PRAGMA table_info(deployment_jobs)`).all() as Array<{ name: string }>;
const hasLastActionTypeColumn = deploymentColumns.some((column) => column.name === "last_action_type");
const hasLastActionByColumn = deploymentColumns.some((column) => column.name === "last_action_by");
const hasLastActionAtColumn = deploymentColumns.some((column) => column.name === "last_action_at");

if (!hasLastActionTypeColumn) {
    db.exec(`ALTER TABLE deployment_jobs ADD COLUMN last_action_type TEXT;`);
}

if (!hasLastActionByColumn) {
    db.exec(`ALTER TABLE deployment_jobs ADD COLUMN last_action_by TEXT;`);
}

if (!hasLastActionAtColumn) {
    db.exec(`ALTER TABLE deployment_jobs ADD COLUMN last_action_at INTEGER;`);
}

const provisioningColumns = db.prepare(`PRAGMA table_info(provisioning_queue)`).all() as Array<{ name: string }>;
const hasFailureReasonColumn = provisioningColumns.some((column) => column.name === "failure_reason");
const hasRemediationHintColumn = provisioningColumns.some((column) => column.name === "remediation_hint");
const hasRetryOfJobIdColumn = provisioningColumns.some((column) => column.name === "retry_of_job_id");
const hasUpdatedAtColumn = provisioningColumns.some((column) => column.name === "updated_at");

if (!hasFailureReasonColumn) {
    db.exec(`ALTER TABLE provisioning_queue ADD COLUMN failure_reason TEXT;`);
}

if (!hasRemediationHintColumn) {
    db.exec(`ALTER TABLE provisioning_queue ADD COLUMN remediation_hint TEXT;`);
}

if (!hasRetryOfJobIdColumn) {
    db.exec(`ALTER TABLE provisioning_queue ADD COLUMN retry_of_job_id TEXT;`);
}

if (!hasUpdatedAtColumn) {
    db.exec(`ALTER TABLE provisioning_queue ADD COLUMN updated_at INTEGER;`);
    db.exec(`UPDATE provisioning_queue SET updated_at = created_at WHERE updated_at IS NULL;`);
}

const hasRetryAttemptCountColumn = provisioningColumns.some((column) => column.name === "retry_attempt_count");
if (!hasRetryAttemptCountColumn) {
    db.exec(`ALTER TABLE provisioning_queue ADD COLUMN retry_attempt_count INTEGER NOT NULL DEFAULT 0;`);
}

const approvalsColumns = db.prepare(`PRAGMA table_info(approvals)`).all() as Array<{ name: string }>;
const hasApprovalTenantIdColumn = approvalsColumns.some((column) => column.name === "tenant_id");
const hasApprovalDecisionReasonColumn = approvalsColumns.some((column) => column.name === "decision_reason");
const hasApprovalDecisionLatencyColumn = approvalsColumns.some((column) => column.name === "decision_latency_seconds");
const hasApprovalEscalationTimeoutColumn = approvalsColumns.some((column) => column.name === "escalation_timeout_seconds");
const hasApprovalEscalatedAtColumn = approvalsColumns.some((column) => column.name === "escalated_at");
if (!hasApprovalTenantIdColumn) {
    db.exec(`ALTER TABLE approvals ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '';`);
}
if (!hasApprovalDecisionReasonColumn) {
    db.exec(`ALTER TABLE approvals ADD COLUMN decision_reason TEXT;`);
}
if (!hasApprovalDecisionLatencyColumn) {
    db.exec(`ALTER TABLE approvals ADD COLUMN decision_latency_seconds INTEGER;`);
}
if (!hasApprovalEscalationTimeoutColumn) {
    db.exec(`ALTER TABLE approvals ADD COLUMN escalation_timeout_seconds INTEGER NOT NULL DEFAULT 3600;`);
}
if (!hasApprovalEscalatedAtColumn) {
    db.exec(`ALTER TABLE approvals ADD COLUMN escalated_at INTEGER;`);
}

if (!hasExplicitPrivilegedRules) {
    const superAdminsCount = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'`).get() as {
        count: number;
    };
    if (Number(superAdminsCount.count) === 0) {
        db.exec(`
            UPDATE users
            SET role = 'superadmin'
            WHERE id = (
                SELECT id
                FROM users
                ORDER BY created_at ASC
                LIMIT 1
            );
        `);
    }
}

const now = (): number => Date.now();

const seedApprovals = [
    {
        id: "APR-1029",
        title: "Deploy payment webhook retry patch",
        agentSlug: "ai-backend-developer",
        agent: "AI Backend Developer",
        requestedBy: "billing-service",
        channel: "GitHub / production",
        reason: "Touches payment retry policy and queue behavior.",
        risk: "high" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-1028",
        title: "Rotate build worker cloud credentials",
        agentSlug: "ai-security-engineer",
        agent: "AI Security Engineer",
        requestedBy: "infra-secrets",
        channel: "Security policy",
        reason: "Credential age exceeded 90 days.",
        risk: "medium" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-1027",
        title: "Scale staging cluster to 14 nodes",
        agentSlug: "ai-devops-engineer",
        agent: "AI DevOps Engineer",
        requestedBy: "k8s-staging",
        channel: "Kubernetes",
        reason: "Cost impact projected above daily threshold.",
        risk: "medium" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-1026",
        title: "Merge test automation coverage patch",
        agentSlug: "ai-qa-engineer",
        agent: "AI QA Engineer",
        requestedBy: "qa-suite",
        channel: "GitHub / main",
        reason: "Changes broad test matrix for checkout flow.",
        risk: "low" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-381",
        title: "Merge PR #482 to main",
        agentSlug: "ai-backend-developer",
        agent: "AI Backend Developer",
        requestedBy: "github-actions",
        channel: "GitHub / main",
        reason: "Production code path changes require reviewer confirmation.",
        risk: "high" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-379",
        title: "Deploy billing retry patch",
        agentSlug: "ai-backend-developer",
        agent: "AI Backend Developer",
        requestedBy: "billing-service",
        channel: "Kubernetes",
        reason: "Retry policy update affects customer payment reliability.",
        risk: "high" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-366",
        title: "Enable nightly regression for checkout",
        agentSlug: "ai-qa-engineer",
        agent: "AI QA Engineer",
        requestedBy: "qa-suite",
        channel: "CI/CD",
        reason: "Increases test runtime and usage budget.",
        risk: "low" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-355",
        title: "Promote canary to 50% traffic",
        agentSlug: "ai-devops-engineer",
        agent: "AI DevOps Engineer",
        requestedBy: "deployment-controller",
        channel: "Kubernetes",
        reason: "Traffic shift exceeds automated policy threshold.",
        risk: "medium" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-351",
        title: "Scale staging cluster to 14 nodes",
        agentSlug: "ai-devops-engineer",
        agent: "AI DevOps Engineer",
        requestedBy: "k8s-staging",
        channel: "Kubernetes",
        reason: "Compute spend increase requires budget owner sign-off.",
        risk: "medium" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-340",
        title: "Rotate production IAM credentials",
        agentSlug: "ai-security-engineer",
        agent: "AI Security Engineer",
        requestedBy: "infra-secrets",
        channel: "Security policy",
        reason: "Critical credential rotation in production environment.",
        risk: "high" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
    {
        id: "APR-338",
        title: "Block vulnerable dependency from lockfile",
        agentSlug: "ai-security-engineer",
        agent: "AI Security Engineer",
        requestedBy: "security-scanner",
        channel: "GitHub",
        reason: "Dependency policy action requires human confirmation.",
        risk: "medium" as ApprovalRisk,
        status: "pending" as ApprovalDecision,
    },
];

const approvalsCount = db.prepare(`SELECT COUNT(*) AS count FROM approvals`).get() as { count: number };
if (Number(approvalsCount.count) === 0) {
    const insertApproval = db.prepare(
        `
      INSERT INTO approvals (
        id, title, agent_slug, agent, requested_by, channel, reason, risk, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    const base = now();
    seedApprovals.forEach((item, index) => {
        insertApproval.run(
            item.id,
            item.title,
            item.agentSlug,
            item.agent,
            item.requestedBy,
            item.channel,
            item.reason,
            item.risk,
            item.status,
            base - index * 5 * 60 * 1000,
        );
    });
}

const hashPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_LEN).toString("hex");
    const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    if (!stored.startsWith("scrypt:")) {
        return false;
    }

    const parts = stored.split(":");
    if (parts.length !== 3) {
        return false;
    }

    const [, salt, hashHex] = parts;
    if (!salt || !hashHex) {
        return false;
    }

    try {
        const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
        const storedKey = Buffer.from(hashHex, "hex");
        if (derivedKey.length !== storedKey.length) {
            return false;
        }
        return timingSafeEqual(derivedKey, storedKey);
    } catch {
        return false;
    }
};

const hashSessionToken = (token: string): string => {
    return createHash("sha256").update(token).digest("hex");
};

const mapUser = (row: Record<string, unknown> | undefined): UserRecord | null => {
    if (!row) return null;
    const rawRole = String(row.role ?? "member");
    let role: UserRole = "member";
    if (rawRole === "superadmin") role = "superadmin";
    else if (rawRole === "admin") role = "admin";
    return {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        company: String(row.company),
        role,
        tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
        gatewayTenantId: row.gateway_tenant_id != null ? String(row.gateway_tenant_id) : null,
        gatewayWorkspaceId: row.gateway_workspace_id != null ? String(row.gateway_workspace_id) : null,
        gatewayBotId: row.gateway_bot_id != null ? String(row.gateway_bot_id) : null,
        gatewayToken: row.gateway_token != null ? String(row.gateway_token) : null,
    };
};

const mapApproval = (row: Record<string, unknown>): ApprovalRecord => {
    return {
        id: String(row.id),
        title: String(row.title),
        agentSlug: String(row.agent_slug),
        agent: String(row.agent),
        requestedBy: String(row.requested_by),
        channel: String(row.channel),
        reason: String(row.reason),
        risk: String(row.risk) as ApprovalRisk,
        status: String(row.status) as ApprovalDecision,
        createdAt: Number(row.created_at),
        decidedAt: row.decided_at ? Number(row.decided_at) : null,
        decidedBy: row.decided_by ? String(row.decided_by) : null,
        decisionReason: row.decision_reason ? String(row.decision_reason) : null,
        decisionLatencySeconds:
            row.decision_latency_seconds === null || row.decision_latency_seconds === undefined
                ? null
                : Number(row.decision_latency_seconds),
        escalationTimeoutSeconds: Number(row.escalation_timeout_seconds ?? 3600),
        escalatedAt: row.escalated_at ? Number(row.escalated_at) : null,
    };
};

const mapCustomerTenant = (row: Record<string, unknown>): CustomerTenantRecord => ({
    id: String(row.id),
    tenantName: String(row.tenant_name),
    planId: String(row.plan_id),
    billingStatus: String(row.billing_status),
    tenantStatus: String(row.tenant_status) as CustomerTenantStatus,
    createdAt: Number(row.created_at),
});

const mapCustomerWorkspace = (row: Record<string, unknown>): CustomerWorkspaceRecord => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceName: String(row.workspace_name),
    roleType: String(row.role_type),
    runtimeTier: String(row.runtime_tier),
    workspaceStatus: String(row.workspace_status) as CustomerWorkspaceStatus,
    createdAt: Number(row.created_at),
});

const mapCustomerBot = (row: Record<string, unknown>): CustomerBotRecord => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    botName: String(row.bot_name),
    botStatus: String(row.bot_status) as CustomerBotStatus,
    policyPackVersion: String(row.policy_pack_version),
    connectorProfileId: row.connector_profile_id ? String(row.connector_profile_id) : null,
    createdAt: Number(row.created_at),
});

const mapProvisioningQueueEntry = (row: Record<string, unknown>): ProvisioningQueueEntry => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    workspaceId: String(row.workspace_id),
    botId: String(row.bot_id),
    planId: String(row.plan_id),
    runtimeTier: String(row.runtime_tier),
    roleType: String(row.role_type),
    correlationId: String(row.correlation_id),
    requestedAt: Number(row.requested_at),
    requestedBy: String(row.requested_by),
    triggerSource: String(row.trigger_source),
    status: String(row.status) as ProvisioningJobStatus,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    remediationHint: row.remediation_hint ? String(row.remediation_hint) : null,
    retryOfJobId: row.retry_of_job_id ? String(row.retry_of_job_id) : null,
    retryAttemptCount: Number(row.retry_attempt_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at ?? row.created_at),
});

const PROVISIONING_SUCCESS_STAGES: ProvisioningJobStatus[] = [
    "validating",
    "creating_resources",
    "bootstrapping_vm",
    "starting_container",
    "registering_runtime",
    "healthchecking",
    "completed",
];

const PROVISIONING_FAILURE_STAGE: ProvisioningJobStatus = "failed";

const PROVISIONING_STATUS_ORDER: ProvisioningJobStatus[] = [
    "queued",
    "validating",
    "creating_resources",
    "bootstrapping_vm",
    "starting_container",
    "registering_runtime",
    "healthchecking",
    "completed",
];

const PROVISIONING_STAGE_ESTIMATED_SECONDS: Record<ProvisioningJobStatus, number> = {
    queued: 30,
    validating: 20,
    creating_resources: 120,
    bootstrapping_vm: 180,
    starting_container: 90,
    registering_runtime: 45,
    healthchecking: 30,
    completed: 0,
    failed: 0,
    cleanup_pending: 60,
    cleaned_up: 0,
};

const PROVISIONING_SLA_TARGET_SECONDS = 10 * 60;
const PROVISIONING_TIMEOUT_SECONDS = 24 * 60 * 60;
const PROVISIONING_STUCK_THRESHOLD_SECONDS = 60 * 60;

const setProvisioningJobStatus = (
    entry: ProvisioningQueueEntry,
    nextStatus: ProvisioningJobStatus,
    actorId: string,
    actorEmail: string,
    reason?: string,
    diagnostics?: { failureReason?: string | null; remediationHint?: string | null },
): ProvisioningQueueEntry => {
    const previousStatus = entry.status;
    const changed = previousStatus !== nextStatus
        || diagnostics?.failureReason !== undefined
        || diagnostics?.remediationHint !== undefined;

    if (changed) {
        const ts = now();
        const nextFailureReason = diagnostics?.failureReason ?? (nextStatus === "failed" ? entry.failureReason : null);
        const nextRemediationHint = diagnostics?.remediationHint ?? (nextStatus === "failed" ? entry.remediationHint : null);

        db.prepare(
            `UPDATE provisioning_queue
             SET status = ?, failure_reason = ?, remediation_hint = ?, updated_at = ?
             WHERE id = ?`,
        ).run(nextStatus, nextFailureReason, nextRemediationHint, ts, entry.id);

        writeAuditEvent({
            actorId,
            actorEmail,
            action: "provisioning.job.status_updated",
            targetType: "provisioning_job",
            targetId: entry.id,
            tenantId: entry.tenantId,
            beforeState: {
                status: previousStatus,
                failureReason: entry.failureReason,
                remediationHint: entry.remediationHint,
            },
            afterState: {
                status: nextStatus,
                correlationId: entry.correlationId,
                failureReason: nextFailureReason,
                remediationHint: nextRemediationHint,
            },
            reason: reason ?? `Provisioning state transition: ${previousStatus} -> ${nextStatus}`,
        });

        return {
            ...entry,
            status: nextStatus,
            failureReason: nextFailureReason,
            remediationHint: nextRemediationHint,
            updatedAt: ts,
        };
    }

    return {
        ...entry,
        status: nextStatus,
    };
};

const finalizeProvisioningJob = (
    entry: ProvisioningQueueEntry,
    actorId: string,
    actorEmail: string,
): void => {
    if (entry.status === "completed") {
        db.prepare(`UPDATE customer_tenants SET tenant_status = 'ready' WHERE id = ?`).run(entry.tenantId);
        db.prepare(`UPDATE customer_workspaces SET workspace_status = 'ready' WHERE id = ?`).run(entry.workspaceId);
        db.prepare(`UPDATE customer_bots SET bot_status = 'active' WHERE id = ?`).run(entry.botId);

        writeAuditEvent({
            actorId,
            actorEmail,
            action: "provisioning.job.completed",
            targetType: "provisioning_job",
            targetId: entry.id,
            tenantId: entry.tenantId,
            afterState: {
                tenantStatus: "ready",
                workspaceStatus: "ready",
                botStatus: "active",
            },
            reason: "Provisioning completed; tenant workspace runtime is ready.",
        });
        return;
    }

    if (entry.status === "failed") {
        db.prepare(`UPDATE customer_tenants SET tenant_status = 'degraded' WHERE id = ?`).run(entry.tenantId);
        db.prepare(`UPDATE customer_workspaces SET workspace_status = 'failed' WHERE id = ?`).run(entry.workspaceId);
        db.prepare(`UPDATE customer_bots SET bot_status = 'failed' WHERE id = ?`).run(entry.botId);

        writeAuditEvent({
            actorId,
            actorEmail,
            action: "provisioning.job.failed",
            targetType: "provisioning_job",
            targetId: entry.id,
            tenantId: entry.tenantId,
            afterState: {
                tenantStatus: "degraded",
                workspaceStatus: "failed",
                botStatus: "failed",
            },
            reason: "Provisioning failed; tenant runtime requires operator intervention.",
        });
    }
};

const formatRelativeActivityTime = (timestamp: number): string => {
    const deltaMs = Math.max(0, now() - timestamp);
    const minutes = Math.max(1, Math.floor(deltaMs / 60000));
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export const createUser = async (input: {
    name: string;
    email: string;
    company: string;
    password: string;
}): Promise<UserRecord> => {
    const userId = `usr_${randomBytes(10).toString("hex")}`;
    const createdAt = now();
    const passwordHash = await hashPassword(input.password);
    const usersCount = db.prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number };

    let role: UserRole = "member";
    if (isSuperAdminEligibleEmail(input.email)) {
        role = "superadmin";
    } else if (isAdminEligibleEmail(input.email)) {
        role = "admin";
    } else if (!hasExplicitSuperAdminRules && Number(usersCount.count) === 0) {
        role = "superadmin";
    }

    db.prepare(
        `
            INSERT INTO users (id, email, name, company, role, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(userId, input.email, input.name, input.company, role, passwordHash, createdAt);

    const user = mapUser(
        db.prepare(`SELECT id, email, name, company, role, tenant_id FROM users WHERE id = ?`).get(userId) as
        | Record<string, unknown>
        | undefined,
    );

    if (!user) {
        throw new Error("Failed to create user");
    }

    return user;
};

export const findUserByEmail = (email: string): UserRecord | null => {
    const row = db
        .prepare(`SELECT id, email, name, company, role FROM users WHERE email = ?`)
        .get(email) as Record<string, unknown> | undefined;
    return mapUser(row);
};

export const authenticateUser = async (email: string, password: string): Promise<UserRecord | null> => {
    const row = db
        .prepare(`SELECT id, email, name, company, role, password_hash FROM users WHERE email = ?`)
        .get(email) as (Record<string, unknown> & { password_hash: string }) | undefined;

    const DUMMY_HASH =
        "scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    const valid = row
        ? await verifyPassword(password, String(row.password_hash))
        : await verifyPassword(password, DUMMY_HASH);

    if (!row || !valid) {
        return null;
    }

    const normalizedEmail = String(row.email).trim().toLowerCase();
    const rawRole = String(row.role);
    const storedRole: UserRole = rawRole === "superadmin" ? "superadmin" : rawRole === "admin" ? "admin" : "member";
    const effectiveRole: UserRole = getEffectiveRole(normalizedEmail, storedRole);

    if (effectiveRole !== storedRole) {
        db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(effectiveRole, String(row.id));
    }

    return {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        company: String(row.company),
        role: effectiveRole,
        tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
        gatewayTenantId: null,
        gatewayWorkspaceId: null,
        gatewayBotId: null,
        gatewayToken: null,
    };
};

export const createSession = (userId: string): { sessionToken: string; session: SessionRecord } => {
    const sessionId = `ses_${randomBytes(10).toString("hex")}`;
    const sessionToken = randomBytes(48).toString("base64url");
    const tokenHash = hashSessionToken(sessionToken);
    const createdAt = now();
    const expiresAt = createdAt + SESSION_TTL_MS;

    db.prepare(
        `
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(sessionId, userId, tokenHash, expiresAt, createdAt, createdAt);

    return {
        sessionToken,
        session: { sessionId, userId, expiresAt },
    };
};

export const updateUserGatewayIds = (input: {
    userId: string;
    gatewayTenantId: string;
    gatewayWorkspaceId: string;
    gatewayBotId: string;
    gatewayToken: string;
}): void => {
    db.prepare(
        `UPDATE users
         SET gateway_tenant_id = ?, gateway_workspace_id = ?, gateway_bot_id = ?, gateway_token = ?
         WHERE id = ?`,
    ).run(input.gatewayTenantId, input.gatewayWorkspaceId, input.gatewayBotId, input.gatewayToken, input.userId);
};

export const updateUserGatewayToken = (input: {
    userId: string;
    gatewayToken: string;
}): void => {
    db.prepare(`UPDATE users SET gateway_token = ? WHERE id = ?`).run(input.gatewayToken, input.userId);
};

export const getSessionUser = (sessionToken: string): UserRecord | null => {
    const tokenHash = hashSessionToken(sessionToken);

    const row = db
        .prepare(
            `
        SELECT
          sessions.id AS session_id,
          sessions.expires_at AS expires_at,
          users.id AS user_id,
          users.email AS email,
          users.name AS name,
                    users.company AS company,
                    users.role AS role,
                    users.tenant_id AS tenant_id,
          users.gateway_tenant_id AS gateway_tenant_id,
          users.gateway_workspace_id AS gateway_workspace_id,
          users.gateway_bot_id AS gateway_bot_id,
          users.gateway_token AS gateway_token
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
      `,
        )
        .get(tokenHash) as
        | {
            session_id: string;
            expires_at: number;
            user_id: string;
            email: string;
            name: string;
            company: string;
            role: UserRole;
            tenant_id: string | null;
            gateway_tenant_id: string | null;
            gateway_workspace_id: string | null;
            gateway_bot_id: string | null;
            gateway_token: string | null;
        }
        | undefined;

    if (!row) {
        return null;
    }

    if (Number(row.expires_at) <= now()) {
        db.prepare(`DELETE FROM sessions WHERE id = ?`).run(String(row.session_id));
        return null;
    }

    db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`).run(now(), String(row.session_id));

    return {
        id: String(row.user_id),
        email: String(row.email),
        name: String(row.name),
        company: String(row.company),
        role: String(row.role) === "superadmin" ? "superadmin" : String(row.role) === "admin" ? "admin" : "member",
        tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
        gatewayTenantId: row.gateway_tenant_id != null ? String(row.gateway_tenant_id) : null,
        gatewayWorkspaceId: row.gateway_workspace_id != null ? String(row.gateway_workspace_id) : null,
        gatewayBotId: row.gateway_bot_id != null ? String(row.gateway_bot_id) : null,
        gatewayToken: row.gateway_token != null ? String(row.gateway_token) : null,
    };
};

export const deleteSession = (sessionToken: string): void => {
    const tokenHash = hashSessionToken(sessionToken);
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
};

export const completeOnboarding = (input: {
    userId: string;
    githubOrg: string;
    inviteEmail: string;
    starterAgent: string;
}): void => {
    db.prepare(
        `
      UPDATE users
      SET github_org = ?, invite_email = ?, starter_agent = ?, onboarding_completed_at = ?
      WHERE id = ?
    `,
    ).run(input.githubOrg, input.inviteEmail, input.starterAgent, now(), input.userId);
};

export const saveMarketplaceSelection = (input: {
    userId: string;
    starterAgent: string;
    config?: Record<string, unknown>;
}): void => {
    db.prepare(`UPDATE users SET starter_agent = ? WHERE id = ?`).run(input.starterAgent, input.userId);

    db.prepare(
        `
      INSERT INTO marketplace_selections (user_id, starter_agent, config_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        starter_agent = excluded.starter_agent,
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `,
    ).run(input.userId, input.starterAgent, JSON.stringify(input.config ?? {}), now());
};

const getMarketplaceSelection = (userId: string): MarketplaceSelectionRecord | null => {
    const row = db
        .prepare(`SELECT user_id, starter_agent, config_json, updated_at FROM marketplace_selections WHERE user_id = ?`)
        .get(userId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        userId: String(row.user_id),
        starterAgent: String(row.starter_agent),
        configJson: String(row.config_json ?? "{}"),
        updatedAt: Number(row.updated_at),
    };
};

export const getUserOnboardingState = (userId: string): UserOnboardingState | null => {
    const row = db
        .prepare(`SELECT id, starter_agent, onboarding_completed_at FROM users WHERE id = ?`)
        .get(userId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        userId: String(row.id),
        starterAgent: row.starter_agent ? String(row.starter_agent) : null,
        onboardingCompletedAt:
            row.onboarding_completed_at === null || row.onboarding_completed_at === undefined
                ? null
                : Number(row.onboarding_completed_at),
    };
};

const mapDeploymentJob = (row: Record<string, unknown>): DeploymentJobRecord => ({
    id: String(row.id),
    userId: String(row.user_id),
    botSlug: String(row.bot_slug),
    botName: String(row.bot_name),
    status: String(row.status) as DeploymentStatus,
    statusMessage: String(row.status_message),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastActionType: row.last_action_type ? String(row.last_action_type) as DeploymentActionType : null,
    lastActionBy: row.last_action_by ? String(row.last_action_by) : null,
    lastActionAt: row.last_action_at === null || row.last_action_at === undefined ? null : Number(row.last_action_at),
});

const refreshDeploymentLifecycle = (job: DeploymentJobRecord): DeploymentJobRecord => {
    const nowTs = now();
    const elapsed = nowTs - job.createdAt;

    if (job.status === "queued" && elapsed > 4000) {
        db.prepare(`UPDATE deployment_jobs SET status = ?, status_message = ?, updated_at = ? WHERE id = ?`)
            .run("running", "Deployment is currently rolling out.", nowTs, job.id);
    }

    if (job.status === "running" && elapsed > 11000) {
        db.prepare(`UPDATE deployment_jobs SET status = ?, status_message = ?, updated_at = ? WHERE id = ?`)
            .run("succeeded", "Deployment completed successfully.", nowTs, job.id);
    }

    const refreshed = db.prepare(`SELECT * FROM deployment_jobs WHERE id = ?`).get(job.id) as Record<string, unknown> | undefined;
    return refreshed ? mapDeploymentJob(refreshed) : job;
};

const getDeploymentForUser = (userId: string, deploymentId: string): DeploymentJobRecord | null => {
    const row = db
        .prepare(`SELECT * FROM deployment_jobs WHERE id = ? AND user_id = ?`)
        .get(deploymentId, userId) as Record<string, unknown> | undefined;
    return row ? mapDeploymentJob(row) : null;
};

export const requestDeployment = (input: {
    userId: string;
    botSlug: string;
    botName: string;
    actorEmail?: string;
}): { ok: true; job: DeploymentJobRecord } | { ok: false; error: "onboarding_required" | "missing_selection" } => {
    const onboarding = getUserOnboardingState(input.userId);
    const selection = getMarketplaceSelection(input.userId);
    if (!onboarding) {
        return { ok: false, error: "missing_selection" };
    }

    if (!selection || selection.starterAgent !== input.botSlug) {
        return { ok: false, error: "missing_selection" };
    }

    if (!onboarding.onboardingCompletedAt) {
        return { ok: false, error: "onboarding_required" };
    }

    const id = `dep_${randomBytes(8).toString("hex")}`;
    const ts = now();
    db.prepare(
        `
            INSERT INTO deployment_jobs (
                id, user_id, bot_slug, bot_name, status, status_message, created_at, updated_at, last_action_type, last_action_by, last_action_at
            )
            VALUES (?, ?, ?, ?, 'queued', 'Deployment request queued for execution.', ?, ?, 'requested', ?, ?)
    `,
    ).run(id, input.userId, input.botSlug, input.botName, ts, ts, input.actorEmail ?? `user:${input.userId}`, ts);

    const row = db.prepare(`SELECT * FROM deployment_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
        return { ok: false, error: "missing_selection" };
    }

    return { ok: true, job: mapDeploymentJob(row) };
};

export const getLatestDeploymentForUser = (userId: string): DeploymentJobRecord | null => {
    const row = db
        .prepare(`SELECT * FROM deployment_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(userId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return refreshDeploymentLifecycle(mapDeploymentJob(row));
};

export const listDeploymentsForUser = (userId: string, limit = 25): DeploymentJobRecord[] => {
    const effectiveLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = db
        .prepare(`SELECT * FROM deployment_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
        .all(userId, effectiveLimit) as Record<string, unknown>[];

    return rows.map((row) => refreshDeploymentLifecycle(mapDeploymentJob(row)));
};

export const cancelDeployment = (input: {
    userId: string;
    deploymentId: string;
    actorEmail?: string;
}):
    | { ok: true; job: DeploymentJobRecord }
    | { ok: false; error: "not_found" | "not_cancelable" } => {
    const existing = getDeploymentForUser(input.userId, input.deploymentId);
    if (!existing) {
        return { ok: false, error: "not_found" };
    }

    const current = refreshDeploymentLifecycle(existing);
    if (current.status !== "queued" && current.status !== "running") {
        return { ok: false, error: "not_cancelable" };
    }

    const ts = now();
    db.prepare(
        `UPDATE deployment_jobs
         SET status = ?, status_message = ?, updated_at = ?, last_action_type = ?, last_action_by = ?, last_action_at = ?
         WHERE id = ?`,
    ).run("canceled", "Deployment canceled by user.", ts, "canceled", input.actorEmail ?? `user:${input.userId}`, ts, input.deploymentId);

    const updated = getDeploymentForUser(input.userId, input.deploymentId);
    if (!updated) {
        return { ok: false, error: "not_found" };
    }

    return { ok: true, job: updated };
};

export const retryDeployment = (input: {
    userId: string;
    deploymentId: string;
    actorEmail?: string;
}):
    | { ok: true; job: DeploymentJobRecord }
    | { ok: false; error: "not_found" | "not_retryable" } => {
    const existing = getDeploymentForUser(input.userId, input.deploymentId);
    if (!existing) {
        return { ok: false, error: "not_found" };
    }

    const current = refreshDeploymentLifecycle(existing);
    if (current.status !== "failed") {
        return { ok: false, error: "not_retryable" };
    }

    const id = `dep_${randomBytes(8).toString("hex")}`;
    const ts = now();
    db.prepare(
        `
            INSERT INTO deployment_jobs (
                id, user_id, bot_slug, bot_name, status, status_message, created_at, updated_at, last_action_type, last_action_by, last_action_at
            )
            VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 'retried', ?, ?)
    `,
    ).run(
        id,
        input.userId,
        current.botSlug,
        current.botName,
        `Retry requested after ${current.id}.`,
        ts,
        ts,
        input.actorEmail ?? `user:${input.userId}`,
        ts,
    );

    const created = getDeploymentForUser(input.userId, id);
    if (!created) {
        return { ok: false, error: "not_found" };
    }

    return { ok: true, job: created };
};

export const listApprovals = (filters?: {
    status?: ApprovalDecision;
    agentSlug?: string;
    tenantId?: string;
    limit?: number;
}): ApprovalRecord[] => {
    const status = filters?.status ?? "pending";
    const agentSlug = filters?.agentSlug;
    const tenantId = filters?.tenantId;
    const limit = Math.max(1, Math.min(200, Math.floor(filters?.limit ?? 100)));

    if (agentSlug) {
        const rows = tenantId
            ? (db.prepare(`SELECT * FROM approvals WHERE status = ? AND agent_slug = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?`).all(status, agentSlug, tenantId, limit) as Record<string, unknown>[])
            : (db.prepare(`SELECT * FROM approvals WHERE status = ? AND agent_slug = ? ORDER BY created_at DESC LIMIT ?`).all(status, agentSlug, limit) as Record<string, unknown>[]);
        return rows.map(mapApproval);
    }

    const rows = tenantId
        ? (db.prepare(`SELECT * FROM approvals WHERE status = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?`).all(status, tenantId, limit) as Record<string, unknown>[])
        : (db.prepare(`SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit) as Record<string, unknown>[]);
    return rows.map(mapApproval);
};

export const createApprovalRequest = (input: {
    title: string;
    agentSlug: string;
    agent: string;
    requestedBy: string;
    channel: string;
    reason: string;
    risk: ApprovalRisk;
    tenantId?: string;
    escalationTimeoutSeconds?: number;
    actorId: string;
    actorEmail: string;
}): ApprovalRecord => {
    const id = `APR-${randomBytes(3).toString("hex").toUpperCase()}`;
    const createdAt = now();

    db.prepare(
        `
      INSERT INTO approvals (
                id, title, agent_slug, agent, requested_by, channel, reason, risk, status, tenant_id, created_at, escalation_timeout_seconds
      )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `,
    ).run(
        id,
        input.title,
        input.agentSlug,
        input.agent,
        input.requestedBy,
        input.channel,
        input.reason,
        input.risk,
        input.tenantId ?? "",
        createdAt,
        Math.max(60, Math.floor(input.escalationTimeoutSeconds ?? 3600)),
    );

    writeAuditEvent({
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: "approval.request.created",
        targetType: "approval",
        targetId: id,
        afterState: {
            status: "pending",
            risk: input.risk,
            agentSlug: input.agentSlug,
        },
        reason: input.reason,
    });

    const created = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!created) {
        throw new Error("Failed to create approval request.");
    }

    return mapApproval(created);
};

export const listRecentActivity = (limit = 20, tenantId?: string): ActivityFeedEvent[] => {
    const effectiveLimit = Math.max(5, Math.min(100, Math.floor(limit)));
    const rows = tenantId
        ? (db.prepare(`SELECT * FROM approvals WHERE tenant_id = ? ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?`).all(tenantId, effectiveLimit * 2) as Record<string, unknown>[])
        : (db.prepare(`SELECT * FROM approvals ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?`).all(effectiveLimit * 2) as Record<string, unknown>[]);

    const events: Array<ActivityFeedEvent & { ts: number }> = [];

    rows.forEach((row) => {
        const approval = mapApproval(row);

        events.push({
            id: `ACT-REQ-${approval.id}`,
            time: formatRelativeActivityTime(approval.createdAt),
            agent: approval.agent,
            action: "Approval requested",
            detail: `${approval.id} · ${approval.title} (${approval.risk})`,
            type: "approval",
            approvalOutcome: "requested",
            ts: approval.createdAt,
        });

        if (approval.decidedAt && approval.decidedBy) {
            events.push({
                id: `ACT-DEC-${approval.id}`,
                time: formatRelativeActivityTime(approval.decidedAt),
                agent: approval.agent,
                action: approval.status === "approved" ? "Approval approved" : "Approval rejected",
                detail: `${approval.id} · ${approval.decidedBy}`,
                type: "approval",
                approvalOutcome: approval.status === "approved" ? "approved" : "rejected",
                ts: approval.decidedAt,
            });
        }
    });

    return events
        .sort((a, b) => b.ts - a.ts)
        .slice(0, effectiveLimit)
        .map(({ ts: _ts, ...event }) => event);
};

// ── User management ────────────────────────────────────────────────────────

export type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    createdAt: number;
};

export const listUsers = (): UserPublic[] => {
    const rows = db
        .prepare(`SELECT id, email, name, company, role, created_at FROM users ORDER BY created_at ASC`)
        .all() as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        company: String(row.company),
        role:
            String(row.role) === "superadmin"
                ? "superadmin"
                : String(row.role) === "admin"
                    ? "admin"
                    : ("member" as UserRole),
        createdAt: Number(row.created_at),
    }));
};

// ── Session management (company operator) ─────────────────────────────────

export type OperatorSessionRecord = {
    sessionId: string;
    userId: string;
    userEmail: string;
    userName: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number;
};

export const listActiveOperatorSessions = (): OperatorSessionRecord[] => {
    const rows = db
        .prepare(
            `SELECT sessions.id AS session_id, sessions.user_id, sessions.created_at,
                    sessions.expires_at, sessions.last_seen_at,
                    users.email AS user_email, users.name AS user_name
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             WHERE sessions.expires_at > ?
             ORDER BY sessions.last_seen_at DESC`,
        )
        .all(now()) as Record<string, unknown>[];
    return rows.map((row) => ({
        sessionId: String(row.session_id),
        userId: String(row.user_id),
        userEmail: String(row.user_email),
        userName: String(row.user_name),
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
        lastSeenAt: Number(row.last_seen_at),
    }));
};

export const revokeSessionById = (sessionId: string): { ok: boolean } => {
    const result = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
    return { ok: Number(result.changes) > 0 };
};

// ── Tenant provisioning ────────────────────────────────────────────────────

export const createCompanyTenant = (input: {
    name: string;
    plan: string;
    region: string;
    mrrCents?: number;
}): TenantRecord => {
    const id = `tnt_${randomBytes(8).toString("hex")}`;
    const ts = now();
    db.prepare(
        `INSERT INTO tenants (id, name, plan, status, region, mrr_cents, open_invoices, last_heartbeat_at, created_at)
         VALUES (?, ?, ?, 'healthy', ?, ?, 0, ?, ?)`,
    ).run(id, input.name.trim(), input.plan, input.region, input.mrrCents ?? 0, ts, ts);
    return {
        id,
        name: input.name.trim(),
        plan: input.plan,
        status: "healthy",
        region: input.region,
        mrrCents: input.mrrCents ?? 0,
        openInvoices: 0,
        lastHeartbeatAt: ts,
        createdAt: ts,
    };
};

export const createCompanyTenantBot = (input: {
    tenantId: string;
    botSlug: string;
    displayName: string;
}): FleetBotRecord => {
    const id = `fb_${randomBytes(8).toString("hex")}`;
    const ts = now();
    db.prepare(
        `INSERT INTO tenant_bots (id, tenant_id, bot_slug, display_name, status, reliability_pct, tasks_completed, last_activity_at)
         VALUES (?, ?, ?, ?, 'active', 100.0, 0, ?)`,
    ).run(id, input.tenantId, input.botSlug, input.displayName, ts);
    const tenant = db.prepare(`SELECT name FROM tenants WHERE id = ?`).get(input.tenantId) as { name: string } | undefined;
    return {
        id,
        tenantId: input.tenantId,
        tenantName: tenant?.name ?? "",
        botSlug: input.botSlug,
        displayName: input.displayName,
        status: "active",
        reliabilityPct: 100.0,
        tasksCompleted: 0,
        lastActivityAt: ts,
    };
};

export const getCompanyTenantById = (id: string): TenantRecord | null => {
    const row = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        id: String(row.id),
        name: String(row.name),
        plan: String(row.plan),
        status: String(row.status) as TenantStatus,
        region: String(row.region),
        mrrCents: Number(row.mrr_cents),
        openInvoices: Number(row.open_invoices),
        lastHeartbeatAt: Number(row.last_heartbeat_at),
        createdAt: Number(row.created_at),
    };
};

export const getCompanyTenantFleetBots = (tenantId: string): FleetBotRecord[] => {
    const rows = db
        .prepare(
            `SELECT tenant_bots.id, tenant_bots.tenant_id, tenants.name AS tenant_name,
                    tenant_bots.bot_slug, tenant_bots.display_name, tenant_bots.status,
                    tenant_bots.reliability_pct, tenant_bots.tasks_completed, tenant_bots.last_activity_at
             FROM tenant_bots
             INNER JOIN tenants ON tenants.id = tenant_bots.tenant_id
             WHERE tenant_bots.tenant_id = ?
             ORDER BY tenant_bots.last_activity_at DESC`,
        )
        .all(tenantId) as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        botSlug: String(row.bot_slug),
        displayName: String(row.display_name),
        status: String(row.status) as FleetBotStatus,
        reliabilityPct: Number(row.reliability_pct),
        tasksCompleted: Number(row.tasks_completed),
        lastActivityAt: Number(row.last_activity_at),
    }));
};

export const getCompanyTenantIncidents = (tenantId: string): IncidentRecord[] => {
    const rows = db
        .prepare(
            `SELECT tenant_incidents.id, tenant_incidents.tenant_id, tenants.name AS tenant_name,
                    tenant_incidents.title, tenant_incidents.severity, tenant_incidents.status,
                    tenant_incidents.source, tenant_incidents.created_at, tenant_incidents.resolved_at,
                    tenant_incidents.resolution_note, tenant_incidents.assignee_email
             FROM tenant_incidents
             INNER JOIN tenants ON tenants.id = tenant_incidents.tenant_id
             WHERE tenant_incidents.tenant_id = ?
             ORDER BY tenant_incidents.created_at DESC`,
        )
        .all(tenantId) as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        title: String(row.title),
        severity: String(row.severity) as IncidentSeverity,
        status: String(row.status) as IncidentStatus,
        source: String(row.source),
        createdAt: Number(row.created_at),
        resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : Number(row.resolved_at),
        resolutionNote: String(row.resolution_note ?? ""),
        assigneeEmail: String(row.assignee_email ?? ""),
    }));
};

// ── Incident escalation ────────────────────────────────────────────────────

export const assignCompanyIncident = (
    incidentId: string,
    assigneeEmail: string,
): { ok: boolean; error?: string } => {
    const row = db.prepare(`SELECT id FROM tenant_incidents WHERE id = ?`).get(incidentId) as { id?: string } | undefined;
    if (!row) return { ok: false, error: "Incident not found." };
    db.prepare(`UPDATE tenant_incidents SET assignee_email = ? WHERE id = ?`).run(assigneeEmail.trim().toLowerCase(), incidentId);
    return { ok: true };
};

export const updateCompanyIncidentSeverity = (
    incidentId: string,
    severity: IncidentSeverity,
): { ok: boolean; error?: string } => {
    const row = db.prepare(`SELECT id FROM tenant_incidents WHERE id = ?`).get(incidentId) as { id?: string } | undefined;
    if (!row) return { ok: false, error: "Incident not found." };
    db.prepare(`UPDATE tenant_incidents SET severity = ? WHERE id = ?`).run(severity, incidentId);
    return { ok: true };
};

export const updateUserRole = (
    targetUserId: string,
    newRole: UserRole,
    actingUserId: string,
    actingUserRole: UserRole,
): { ok: boolean; error?: string } => {
    const targetRow = db
        .prepare(`SELECT role FROM users WHERE id = ?`)
        .get(targetUserId) as { role: string } | undefined;
    if (!targetRow) {
        return { ok: false, error: "User not found." };
    }

    const targetRole: UserRole =
        targetRow.role === "superadmin" ? "superadmin" : targetRow.role === "admin" ? "admin" : "member";

    if (actingUserRole !== "superadmin") {
        if (newRole === "superadmin") {
            return { ok: false, error: "Only a super admin can assign super admin role." };
        }
        if (targetRole === "superadmin") {
            return { ok: false, error: "Only a super admin can change this user." };
        }
    }

    if (actingUserRole === "superadmin" && targetUserId === actingUserId && newRole !== "superadmin") {
        return { ok: false, error: "You cannot demote yourself from super admin." };
    }

    if (targetRole === "superadmin" && newRole !== "superadmin") {
        const superAdminCount = db
            .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'`)
            .get() as { count: number };
        if (Number(superAdminCount.count) <= 1) {
            return { ok: false, error: "Cannot demote the last super admin." };
        }
    }

    if (targetRole === "admin" && newRole === "member" && targetUserId === actingUserId) {
        return { ok: false, error: "You cannot demote yourself." };
    }

    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(newRole, targetUserId);
    return { ok: true };
};

// ── Bot / Agent management ─────────────────────────────────────────────────

export type BotStatus = "active" | "paused" | "error" | "maintenance";
export type AutonomyLevel = "low" | "medium" | "high";
export type ApprovalPolicy = "all" | "medium-high" | "high-only";

export type BotRecord = {
    slug: string;
    name: string;
    role: string;
    tone: string;
    status: BotStatus;
    autonomyLevel: AutonomyLevel;
    approvalPolicy: ApprovalPolicy;
    tasksCompleted: number;
    reliabilityPct: number;
    shiftStart: string;
    shiftEnd: string;
    activeDays: string;
    notes: string;
    lastActivityAt: number;
    createdAt: number;
};

const mapBot = (row: Record<string, unknown>): BotRecord => ({
    slug: String(row.slug),
    name: String(row.name),
    role: String(row.role),
    tone: String(row.tone),
    status: String(row.status) as BotStatus,
    autonomyLevel: String(row.autonomy_level) as AutonomyLevel,
    approvalPolicy: String(row.approval_policy) as ApprovalPolicy,
    tasksCompleted: Number(row.tasks_completed),
    reliabilityPct: Number(row.reliability_pct),
    shiftStart: String(row.shift_start),
    shiftEnd: String(row.shift_end),
    activeDays: String(row.active_days),
    notes: String(row.notes ?? ""),
    lastActivityAt: Number(row.last_activity_at),
    createdAt: Number(row.created_at),
});

db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        tone TEXT NOT NULL DEFAULT 'sky',
        status TEXT NOT NULL DEFAULT 'active',
        autonomy_level TEXT NOT NULL DEFAULT 'medium',
        approval_policy TEXT NOT NULL DEFAULT 'high-only',
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        reliability_pct REAL NOT NULL DEFAULT 99.0,
        shift_start TEXT NOT NULL DEFAULT '09:00',
        shift_end TEXT NOT NULL DEFAULT '18:00',
        active_days TEXT NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
        notes TEXT NOT NULL DEFAULT '',
        last_activity_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
`);

const botsCount = db.prepare(`SELECT COUNT(*) AS count FROM bots`).get() as { count: number };
if (Number(botsCount.count) === 0) {
    const insertBot = db.prepare(`
        INSERT INTO bots (slug, name, role, tone, status, autonomy_level, approval_policy, tasks_completed, reliability_pct, shift_start, shift_end, active_days, notes, last_activity_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seedBots = [
        { slug: "ai-backend-developer", name: "AI Backend Developer", role: "Backend Engineering", tone: "sky", status: "active", autonomy: "high", policy: "high-only", tasks: 34, reliability: 99.2 },
        { slug: "ai-qa-engineer", name: "AI QA Engineer", role: "Quality Assurance", tone: "violet", status: "active", autonomy: "medium", policy: "medium-high", tasks: 52, reliability: 99.6 },
        { slug: "ai-devops-engineer", name: "AI DevOps Engineer", role: "DevOps & Infrastructure", tone: "amber", status: "active", autonomy: "medium", policy: "high-only", tasks: 18, reliability: 98.9 },
        { slug: "ai-security-engineer", name: "AI Security Engineer", role: "Security & Compliance", tone: "rose", status: "error", autonomy: "low", policy: "all", tasks: 7, reliability: 99.7 },
    ];
    const base = now();
    seedBots.forEach((bot, i) => {
        insertBot.run(bot.slug, bot.name, bot.role, bot.tone, bot.status, bot.autonomy, bot.policy, bot.tasks, bot.reliability, "09:00", "18:00", "mon,tue,wed,thu,fri", "", base - i * 3600000, base - i * 86400000);
    });
}

export const listBots = (): BotRecord[] => {
    const rows = db.prepare(`SELECT * FROM bots ORDER BY created_at ASC`).all() as Record<string, unknown>[];
    return rows.map(mapBot);
};

export const getBotBySlug = (slug: string): BotRecord | null => {
    const row = db.prepare(`SELECT * FROM bots WHERE slug = ?`).get(slug) as Record<string, unknown> | undefined;
    return row ? mapBot(row) : null;
};

export const updateBotStatus = (slug: string, status: BotStatus): { ok: boolean } => {
    const result = db.prepare(`UPDATE bots SET status = ?, last_activity_at = ? WHERE slug = ?`).run(status, now(), slug);
    return { ok: Number(result.changes) > 0 };
};

export const updateBotConfig = (
    slug: string,
    config: Partial<{
        autonomyLevel: AutonomyLevel;
        approvalPolicy: ApprovalPolicy;
        shiftStart: string;
        shiftEnd: string;
        activeDays: string;
        notes: string;
    }>,
): { ok: boolean } => {
    const fields: string[] = [];
    const values: (string | number)[] = [];
    if (config.autonomyLevel !== undefined) { fields.push("autonomy_level = ?"); values.push(config.autonomyLevel); }
    if (config.approvalPolicy !== undefined) { fields.push("approval_policy = ?"); values.push(config.approvalPolicy); }
    if (config.shiftStart !== undefined) { fields.push("shift_start = ?"); values.push(config.shiftStart); }
    if (config.shiftEnd !== undefined) { fields.push("shift_end = ?"); values.push(config.shiftEnd); }
    if (config.activeDays !== undefined) { fields.push("active_days = ?"); values.push(config.activeDays); }
    if (config.notes !== undefined) { fields.push("notes = ?"); values.push(config.notes); }
    if (fields.length === 0) return { ok: false };
    fields.push("last_activity_at = ?");
    values.push(now());
    values.push(slug);
    const result = db.prepare(`UPDATE bots SET ${fields.join(", ")} WHERE slug = ?`).run(...values);
    return { ok: Number(result.changes) > 0 };
};

// ── Approval decisions ─────────────────────────────────────────────────────

export const updateApprovalDecision = (input: {
    id: string;
    decision: "approved" | "rejected";
    decidedBy: string;
    reason?: string;
}): ApprovalRecord | null => {
    const rowBefore = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(input.id) as Record<string, unknown> | undefined;
    if (!rowBefore || String(rowBefore.status) !== "pending") {
        return null;
    }

    const createdAt = Number(rowBefore.created_at);
    const decidedAt = now();
    const decisionLatencySeconds = Math.max(0, Math.floor((decidedAt - createdAt) / 1000));

    const result = db
        .prepare(
            `
        UPDATE approvals
        SET status = ?, decided_at = ?, decided_by = ?, decision_reason = ?, decision_latency_seconds = ?
        WHERE id = ? AND status = 'pending'
      `,
        )
        .run(input.decision, decidedAt, input.decidedBy, input.reason?.trim() || null, decisionLatencySeconds, input.id);

    if (Number(result.changes) === 0) {
        return null;
    }

    const row = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(input.id) as Record<string, unknown> | undefined;
    if (!row) {
        return null;
    }

    const updated = mapApproval(row);
    writeAuditEvent({
        actorId: input.decidedBy,
        actorEmail: input.decidedBy,
        action: "approval.decision.updated",
        targetType: "approval",
        targetId: input.id,
        beforeState: { status: "pending" },
        afterState: {
            status: updated.status,
            decidedBy: input.decidedBy,
            decisionLatencySeconds,
        },
        reason: input.reason?.trim() || "Approval decision captured via dashboard inbox.",
    });

    return updated;
};

export const escalatePendingApprovals = (input: {
    tenantId?: string;
    actorId: string;
    actorEmail: string;
    nowTs?: number;
}): { escalatedCount: number; escalatedIds: string[] } => {
    const nowTs = input.nowTs ?? now();
    const rows = input.tenantId
        ? (db.prepare(
            `SELECT * FROM approvals
             WHERE status = 'pending'
               AND tenant_id = ?
               AND escalated_at IS NULL
               AND created_at + (escalation_timeout_seconds * 1000) <= ?
             ORDER BY created_at ASC`,
        ).all(input.tenantId, nowTs) as Record<string, unknown>[])
        : (db.prepare(
            `SELECT * FROM approvals
             WHERE status = 'pending'
               AND escalated_at IS NULL
               AND created_at + (escalation_timeout_seconds * 1000) <= ?
             ORDER BY created_at ASC`,
        ).all(nowTs) as Record<string, unknown>[]);

    const escalatedIds: string[] = [];
    const update = db.prepare(`UPDATE approvals SET escalated_at = ? WHERE id = ? AND escalated_at IS NULL`);

    for (const row of rows) {
        const approvalId = String(row.id);
        const changed = update.run(nowTs, approvalId);
        if (Number(changed.changes) > 0) {
            escalatedIds.push(approvalId);
            writeAuditEvent({
                actorId: input.actorId,
                actorEmail: input.actorEmail,
                action: "approval.request.escalated",
                targetType: "approval",
                targetId: approvalId,
                tenantId: String(row.tenant_id ?? ""),
                beforeState: { status: "pending", escalatedAt: null },
                afterState: { status: "pending", escalatedAt: nowTs },
                reason: `Approval exceeded ${Number(row.escalation_timeout_seconds ?? 3600)} second timeout.`,
            });
        }
    }

    return {
        escalatedCount: escalatedIds.length,
        escalatedIds,
    };
};

// ── Company control plane (superadmin) ────────────────────────────────────

export type TenantStatus = "healthy" | "degraded" | "incident";
export type FleetBotStatus = "active" | "paused" | "error" | "maintenance";
export type IntegrationStatus = "healthy" | "warning" | "down";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "resolved";
export type LogLevel = "info" | "warn" | "error";

export type TenantRecord = {
    id: string;
    name: string;
    plan: string;
    status: TenantStatus;
    region: string;
    mrrCents: number;
    openInvoices: number;
    lastHeartbeatAt: number;
    createdAt: number;
};

export type FleetBotRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    botSlug: string;
    displayName: string;
    status: FleetBotStatus;
    reliabilityPct: number;
    tasksCompleted: number;
    lastActivityAt: number;
};

export type IntegrationRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    integration: string;
    status: IntegrationStatus;
    lastCheckAt: number;
    errorMessage: string;
};

export type IncidentRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    title: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    source: string;
    createdAt: number;
    resolvedAt: number | null;
    resolutionNote: string;
    assigneeEmail: string;
};

export type TenantLogRecord = {
    id: string;
    tenantId: string;
    tenantName: string;
    level: LogLevel;
    service: string;
    message: string;
    traceId: string;
    createdAt: number;
};

db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'healthy',
        region TEXT NOT NULL,
        mrr_cents INTEGER NOT NULL DEFAULT 0,
        open_invoices INTEGER NOT NULL DEFAULT 0,
        last_heartbeat_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_bots (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        bot_slug TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        reliability_pct REAL NOT NULL DEFAULT 99.0,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        last_activity_at INTEGER NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tenant_integrations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        integration TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'healthy',
        last_check_at INTEGER NOT NULL,
        error_message TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tenant_incidents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        resolution_note TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tenant_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        level TEXT NOT NULL,
        service TEXT NOT NULL,
        message TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
`);

try {
    db.exec(`ALTER TABLE tenant_incidents ADD COLUMN assignee_email TEXT NOT NULL DEFAULT ''`);
} catch { /* column already exists */ }

const tenantsCount = db.prepare(`SELECT COUNT(*) AS count FROM tenants`).get() as { count: number };
if (Number(tenantsCount.count) === 0) {
    const ts = now();
    const insertTenant = db.prepare(`
        INSERT INTO tenants (id, name, plan, status, region, mrr_cents, open_invoices, last_heartbeat_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seedTenants: Array<[string, string, string, TenantStatus, string, number, number, number]> = [
        ["tnt_acme", "Acme Robotics", "enterprise", "healthy", "eastus", 329900, 0, ts - 4 * 60 * 1000],
        ["tnt_zenith", "Zenith Health", "growth", "incident", "westeurope", 189900, 1, ts - 18 * 60 * 1000],
        ["tnt_lumina", "Lumina Retail", "starter", "degraded", "southeastasia", 79900, 0, ts - 9 * 60 * 1000],
    ];
    seedTenants.forEach(([id, name, plan, status, region, mrr, openInvoices, heartbeat], idx) => {
        insertTenant.run(id, name, plan, status, region, mrr, openInvoices, heartbeat, ts - idx * 7 * 86400000);
    });

    const insertFleetBot = db.prepare(`
        INSERT INTO tenant_bots (id, tenant_id, bot_slug, display_name, status, reliability_pct, tasks_completed, last_activity_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seedFleet: Array<[string, string, string, string, FleetBotStatus, number, number, number]> = [
        ["fb_1", "tnt_acme", "ai-backend-developer", "Backend Worker A", "active", 99.4, 242, ts - 2 * 60 * 1000],
        ["fb_2", "tnt_acme", "ai-devops-engineer", "DevOps Worker A", "active", 98.9, 121, ts - 6 * 60 * 1000],
        ["fb_3", "tnt_zenith", "ai-security-engineer", "Security Sentinel", "error", 96.2, 88, ts - 15 * 60 * 1000],
        ["fb_4", "tnt_zenith", "ai-qa-engineer", "QA Worker Z", "maintenance", 97.9, 173, ts - 12 * 60 * 1000],
        ["fb_5", "tnt_lumina", "ai-backend-developer", "Backend Worker L", "paused", 98.0, 64, ts - 30 * 60 * 1000],
        ["fb_6", "tnt_lumina", "ai-qa-engineer", "QA Worker L", "active", 99.1, 110, ts - 5 * 60 * 1000],
    ];
    seedFleet.forEach((row) => insertFleetBot.run(...row));

    const insertIntegration = db.prepare(`
        INSERT INTO tenant_integrations (id, tenant_id, integration, status, last_check_at, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const seedIntegrations: Array<[string, string, string, IntegrationStatus, number, string]> = [
        ["int_1", "tnt_acme", "github", "healthy", ts - 3 * 60 * 1000, ""],
        ["int_2", "tnt_acme", "slack", "healthy", ts - 4 * 60 * 1000, ""],
        ["int_3", "tnt_zenith", "github", "warning", ts - 11 * 60 * 1000, "Webhook retries above threshold"],
        ["int_4", "tnt_zenith", "billing-gateway", "down", ts - 15 * 60 * 1000, "Token expired"],
        ["int_5", "tnt_lumina", "zendesk", "healthy", ts - 7 * 60 * 1000, ""],
    ];
    seedIntegrations.forEach((row) => insertIntegration.run(...row));

    const insertIncident = db.prepare(`
        INSERT INTO tenant_incidents (id, tenant_id, title, severity, status, source, created_at, resolved_at, resolution_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seedIncidents: Array<[string, string, string, IncidentSeverity, IncidentStatus, string, number, number | null, string]> = [
        ["inc_1001", "tnt_zenith", "Security bot failing policy sync", "critical", "open", "policy-engine", ts - 50 * 60 * 1000, null, ""],
        ["inc_1002", "tnt_lumina", "Delayed queue drain on QA worker", "medium", "investigating", "queue-processor", ts - 70 * 60 * 1000, null, ""],
        ["inc_1000", "tnt_acme", "Webhook retries spiked", "low", "resolved", "github-ingress", ts - 2 * 86400000, ts - 2 * 86400000 + 25 * 60 * 1000, "Adjusted retry backoff and rate limit."],
    ];
    seedIncidents.forEach((row) => insertIncident.run(...row));

    const insertLog = db.prepare(`
        INSERT INTO tenant_logs (id, tenant_id, level, service, message, trace_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const seedLogs: Array<[string, string, LogLevel, string, string, string, number]> = [
        ["log_1", "tnt_zenith", "error", "policy-engine", "Failed to fetch latest policy bundle from remote store", "trc_9af102", ts - 11 * 60 * 1000],
        ["log_2", "tnt_zenith", "warn", "billing-gateway", "Invoice webhook timeout; retry scheduled", "trc_9af103", ts - 9 * 60 * 1000],
        ["log_3", "tnt_acme", "info", "backend-worker", "Deployment approval completed automatically", "trc_9af104", ts - 6 * 60 * 1000],
        ["log_4", "tnt_lumina", "warn", "queue-processor", "Queue lag exceeded soft threshold", "trc_9af105", ts - 14 * 60 * 1000],
        ["log_5", "tnt_lumina", "info", "integration-zendesk", "Ticket sync heartbeat successful", "trc_9af106", ts - 5 * 60 * 1000],
    ];
    seedLogs.forEach((row) => insertLog.run(...row));
}

export const listCompanyTenants = (): TenantRecord[] => {
    const rows = db.prepare(`SELECT * FROM tenants ORDER BY created_at ASC`).all() as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        plan: String(row.plan),
        status: String(row.status) as TenantStatus,
        region: String(row.region),
        mrrCents: Number(row.mrr_cents),
        openInvoices: Number(row.open_invoices),
        lastHeartbeatAt: Number(row.last_heartbeat_at),
        createdAt: Number(row.created_at),
    }));
};

export const listCompanyFleetBots = (): FleetBotRecord[] => {
    const rows = db
        .prepare(
            `
            SELECT
                tenant_bots.id,
                tenant_bots.tenant_id,
                tenants.name AS tenant_name,
                tenant_bots.bot_slug,
                tenant_bots.display_name,
                tenant_bots.status,
                tenant_bots.reliability_pct,
                tenant_bots.tasks_completed,
                tenant_bots.last_activity_at
            FROM tenant_bots
            INNER JOIN tenants ON tenants.id = tenant_bots.tenant_id
            ORDER BY tenant_bots.last_activity_at DESC
            `,
        )
        .all() as Record<string, unknown>[];

    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        botSlug: String(row.bot_slug),
        displayName: String(row.display_name),
        status: String(row.status) as FleetBotStatus,
        reliabilityPct: Number(row.reliability_pct),
        tasksCompleted: Number(row.tasks_completed),
        lastActivityAt: Number(row.last_activity_at),
    }));
};

export const updateCompanyFleetBotStatus = (botId: string, status: FleetBotStatus): { ok: boolean } => {
    const result = db
        .prepare(`UPDATE tenant_bots SET status = ?, last_activity_at = ? WHERE id = ?`)
        .run(status, now(), botId);
    return { ok: Number(result.changes) > 0 };
};

export const listCompanyIntegrations = (): IntegrationRecord[] => {
    const rows = db
        .prepare(
            `
            SELECT
                tenant_integrations.id,
                tenant_integrations.tenant_id,
                tenants.name AS tenant_name,
                tenant_integrations.integration,
                tenant_integrations.status,
                tenant_integrations.last_check_at,
                tenant_integrations.error_message
            FROM tenant_integrations
            INNER JOIN tenants ON tenants.id = tenant_integrations.tenant_id
            ORDER BY tenant_integrations.last_check_at DESC
            `,
        )
        .all() as Record<string, unknown>[];

    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        integration: String(row.integration),
        status: String(row.status) as IntegrationStatus,
        lastCheckAt: Number(row.last_check_at),
        errorMessage: String(row.error_message ?? ""),
    }));
};

export const listCompanyIncidents = (): IncidentRecord[] => {
    const rows = db
        .prepare(
            `
            SELECT
                tenant_incidents.id,
                tenant_incidents.tenant_id,
                tenants.name AS tenant_name,
                tenant_incidents.title,
                tenant_incidents.severity,
                tenant_incidents.status,
                tenant_incidents.source,
                tenant_incidents.created_at,
                tenant_incidents.resolved_at,
                tenant_incidents.resolution_note,
                tenant_incidents.assignee_email
            FROM tenant_incidents
            INNER JOIN tenants ON tenants.id = tenant_incidents.tenant_id
            ORDER BY tenant_incidents.created_at DESC
            `,
        )
        .all() as Record<string, unknown>[];

    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        title: String(row.title),
        severity: String(row.severity) as IncidentSeverity,
        status: String(row.status) as IncidentStatus,
        source: String(row.source),
        createdAt: Number(row.created_at),
        resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : Number(row.resolved_at),
        resolutionNote: String(row.resolution_note ?? ""),
        assigneeEmail: String(row.assignee_email ?? ""),
    }));
};

export const resolveCompanyIncident = (
    incidentId: string,
    note: string,
): { ok: boolean; error?: string } => {
    const row = db
        .prepare(`SELECT status FROM tenant_incidents WHERE id = ?`)
        .get(incidentId) as { status?: string } | undefined;
    if (!row) return { ok: false, error: "Incident not found." };
    if (String(row.status) === "resolved") return { ok: false, error: "Incident already resolved." };

    const result = db
        .prepare(`
            UPDATE tenant_incidents
            SET status = 'resolved', resolved_at = ?, resolution_note = ?
            WHERE id = ?
        `)
        .run(now(), note.trim(), incidentId);

    return { ok: Number(result.changes) > 0 };
};

export const listCompanyLogs = (input?: {
    tenantId?: string;
    level?: LogLevel;
    limit?: number;
}): TenantLogRecord[] => {
    const limit = Math.max(10, Math.min(500, Number(input?.limit ?? 120)));
    const tenantId = input?.tenantId?.trim();
    const level = input?.level;

    let query = `
        SELECT
            tenant_logs.id,
            tenant_logs.tenant_id,
            tenants.name AS tenant_name,
            tenant_logs.level,
            tenant_logs.service,
            tenant_logs.message,
            tenant_logs.trace_id,
            tenant_logs.created_at
        FROM tenant_logs
        INNER JOIN tenants ON tenants.id = tenant_logs.tenant_id
    `;
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (tenantId) {
        where.push("tenant_logs.tenant_id = ?");
        values.push(tenantId);
    }
    if (level) {
        where.push("tenant_logs.level = ?");
        values.push(level);
    }
    if (where.length > 0) {
        query += ` WHERE ${where.join(" AND ")}`;
    }
    query += ` ORDER BY tenant_logs.created_at DESC LIMIT ?`;
    values.push(limit);

    const rows = db.prepare(query).all(...values) as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        level: String(row.level) as LogLevel,
        service: String(row.service),
        message: String(row.message),
        traceId: String(row.trace_id),
        createdAt: Number(row.created_at),
    }));
};

export const getCompanyBillingSummary = (): {
    totalMrrCents: number;
    openInvoices: number;
    tenantsOnEnterprise: number;
    byTenant: Array<{
        tenantId: string;
        tenantName: string;
        plan: string;
        mrrCents: number;
        openInvoices: number;
    }>;
} => {
    const rows = db
        .prepare(`SELECT id, name, plan, mrr_cents, open_invoices FROM tenants ORDER BY mrr_cents DESC`)
        .all() as Record<string, unknown>[];

    const byTenant = rows.map((row) => ({
        tenantId: String(row.id),
        tenantName: String(row.name),
        plan: String(row.plan),
        mrrCents: Number(row.mrr_cents),
        openInvoices: Number(row.open_invoices),
    }));

    return {
        totalMrrCents: byTenant.reduce((sum, row) => sum + row.mrrCents, 0),
        openInvoices: byTenant.reduce((sum, row) => sum + row.openInvoices, 0),
        tenantsOnEnterprise: byTenant.filter((row) => row.plan === "enterprise").length,
        byTenant,
    };
};

// ── Lookup helpers ─────────────────────────────────────────────────────────

export const getUserById = (id: string): UserPublic | null => {
    const row = db
        .prepare(`SELECT id, email, name, company, role, created_at FROM users WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        id: String(row.id),
        email: String(row.email),
        name: String(row.name),
        company: String(row.company),
        role: String(row.role) === "superadmin" ? "superadmin" : String(row.role) === "admin" ? "admin" : "member",
        createdAt: Number(row.created_at),
    };
};

export const getCompanyFleetBotById = (id: string): FleetBotRecord | null => {
    const row = db
        .prepare(
            `SELECT tenant_bots.id, tenant_bots.tenant_id, tenants.name AS tenant_name,
                    tenant_bots.bot_slug, tenant_bots.display_name, tenant_bots.status,
                    tenant_bots.reliability_pct, tenant_bots.tasks_completed, tenant_bots.last_activity_at
             FROM tenant_bots
             INNER JOIN tenants ON tenants.id = tenant_bots.tenant_id
             WHERE tenant_bots.id = ?`,
        )
        .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        botSlug: String(row.bot_slug),
        displayName: String(row.display_name),
        status: String(row.status) as FleetBotStatus,
        reliabilityPct: Number(row.reliability_pct),
        tasksCompleted: Number(row.tasks_completed),
        lastActivityAt: Number(row.last_activity_at),
    };
};

export const getCompanyIncidentById = (id: string): IncidentRecord | null => {
    const row = db
        .prepare(
            `SELECT tenant_incidents.id, tenant_incidents.tenant_id, tenants.name AS tenant_name,
                    tenant_incidents.title, tenant_incidents.severity, tenant_incidents.status,
                    tenant_incidents.source, tenant_incidents.created_at, tenant_incidents.resolved_at,
                    tenant_incidents.resolution_note, tenant_incidents.assignee_email
             FROM tenant_incidents
             INNER JOIN tenants ON tenants.id = tenant_incidents.tenant_id
             WHERE tenant_incidents.id = ?`,
        )
        .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        title: String(row.title),
        severity: String(row.severity) as IncidentSeverity,
        status: String(row.status) as IncidentStatus,
        source: String(row.source),
        createdAt: Number(row.created_at),
        resolvedAt: row.resolved_at === null || row.resolved_at === undefined ? null : Number(row.resolved_at),
        resolutionNote: String(row.resolution_note ?? ""),
        assigneeEmail: String(row.assignee_email ?? ""),
    };
};

// ── Audit trail ────────────────────────────────────────────────────────────

export type AuditEventRecord = {
    id: string;
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId: string;
    beforeState: string;
    afterState: string;
    reason: string;
    createdAt: number;
};

export const writeAuditEvent = (event: {
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reason?: string;
}): void => {
    const id = `aud_${randomBytes(8).toString("hex")}`;
    db.prepare(
        `INSERT INTO company_audit_events
            (id, actor_id, actor_email, action, target_type, target_id, tenant_id, before_state, after_state, reason, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        event.actorId,
        event.actorEmail,
        event.action,
        event.targetType,
        event.targetId,
        event.tenantId ?? "",
        JSON.stringify(event.beforeState ?? {}),
        JSON.stringify(event.afterState ?? {}),
        event.reason ?? "",
        now(),
    );
};

export const listAuditEvents = (input?: {
    actorEmail?: string;
    tenantId?: string;
    action?: string;
    sinceTs?: number;
    untilTs?: number;
    limit?: number;
}): AuditEventRecord[] => {
    const limit = Math.max(10, Math.min(500, Number(input?.limit ?? 100)));
    const where: string[] = [];
    const values: Array<string | number> = [];

    if (input?.actorEmail) {
        where.push("actor_email = ?");
        values.push(input.actorEmail.trim().toLowerCase());
    }
    if (input?.tenantId) {
        where.push("tenant_id = ?");
        values.push(input.tenantId);
    }
    if (input?.action) {
        where.push("action = ?");
        values.push(input.action);
    }
    if (input?.sinceTs && Number.isFinite(input.sinceTs)) {
        where.push("created_at >= ?");
        values.push(Math.floor(input.sinceTs));
    }
    if (input?.untilTs && Number.isFinite(input.untilTs)) {
        where.push("created_at <= ?");
        values.push(Math.floor(input.untilTs));
    }

    let query = `SELECT * FROM company_audit_events`;
    if (where.length > 0) {
        query += ` WHERE ${where.join(" AND ")}`;
    }
    query += ` ORDER BY created_at DESC LIMIT ? `;
    values.push(limit);

    const rows = db.prepare(query).all(...values) as Record<string, unknown>[];
    return rows.map((row) => ({
        id: String(row.id),
        actorId: String(row.actor_id),
        actorEmail: String(row.actor_email),
        action: String(row.action),
        targetType: String(row.target_type),
        targetId: String(row.target_id),
        tenantId: String(row.tenant_id),
        beforeState: String(row.before_state),
        afterState: String(row.after_state),
        reason: String(row.reason),
        createdAt: Number(row.created_at),
    }));
};

export const getComplianceEvidenceSummary = (input?: {
    tenantId?: string;
    windowHours?: number;
}): ComplianceEvidenceSummary => {
    const generatedAt = now();
    const windowHours = Math.max(1, Math.min(24 * 30, Math.floor(input?.windowHours ?? 24)));
    const sinceTs = generatedAt - windowHours * 60 * 60 * 1000;

    const allApprovals = [
        ...listApprovals({ status: "pending", tenantId: input?.tenantId, limit: 500 }),
        ...listApprovals({ status: "approved", tenantId: input?.tenantId, limit: 500 }),
        ...listApprovals({ status: "rejected", tenantId: input?.tenantId, limit: 500 }),
    ];

    const inWindow = allApprovals.filter((item) => item.createdAt >= sinceTs || (item.decidedAt ?? 0) >= sinceTs);
    const approvalsRequested = inWindow.length;
    const approvalsPending = inWindow.filter((item) => item.status === "pending").length;
    const approvalsApproved = inWindow.filter((item) => item.status === "approved").length;
    const approvalsRejected = inWindow.filter((item) => item.status === "rejected").length;
    const escalatedApprovals = inWindow.filter((item) => (item.escalatedAt ?? 0) >= sinceTs).length;

    const decisionLatencies = inWindow
        .map((item) => item.decisionLatencySeconds)
        .filter((value): value is number => typeof value === "number")
        .sort((a, b) => a - b);

    const p95Index = decisionLatencies.length === 0
        ? -1
        : Math.min(decisionLatencies.length - 1, Math.ceil(decisionLatencies.length * 0.95) - 1);
    const approvalDecisionLatencyP95Seconds = p95Index < 0 ? null : decisionLatencies[p95Index] ?? null;

    const auditEvents = listAuditEvents({ tenantId: input?.tenantId, sinceTs, limit: 500 });
    const latestAuditAt = auditEvents.reduce((max, item) => Math.max(max, item.createdAt), 0);
    const latestApprovalAt = allApprovals.reduce((max, item) => Math.max(max, item.decidedAt ?? item.createdAt), 0);
    const latestEvidenceAt = Math.max(latestAuditAt, latestApprovalAt);

    return {
        generatedAt,
        windowHours,
        approvalsRequested,
        approvalsPending,
        approvalsApproved,
        approvalsRejected,
        escalatedApprovals,
        auditEventsCaptured: auditEvents.length,
        approvalDecisionLatencyP95Seconds,
        evidenceFreshnessSeconds: latestEvidenceAt > 0 ? Math.max(0, Math.floor((generatedAt - latestEvidenceAt) / 1000)) : null,
    };
};

export const exportComplianceEvidencePack = (input?: {
    tenantId?: string;
    windowHours?: number;
}): ComplianceEvidencePack => {
    const summary = getComplianceEvidenceSummary(input);

    return {
        generatedAt: summary.generatedAt,
        tenantId: input?.tenantId ?? null,
        retentionPolicy: {
            activeDays: 365,
            archiveDays: 730,
        },
        summary,
        approvals: [
            ...listApprovals({ status: "pending", tenantId: input?.tenantId, limit: 500 }),
            ...listApprovals({ status: "approved", tenantId: input?.tenantId, limit: 500 }),
            ...listApprovals({ status: "rejected", tenantId: input?.tenantId, limit: 500 }),
        ],
        auditEvents: listAuditEvents({ tenantId: input?.tenantId, limit: 500 }),
    };
};

export const getProvisioningTimelineForJob = (input: {
    tenantId: string;
    jobId: string;
    createdAt: number;
    currentStatus: ProvisioningJobStatus;
    updatedAt: number;
}): ProvisioningTimelineEntry[] => {
    const rows = db.prepare(
        `SELECT action, after_state, reason, created_at
         FROM company_audit_events
         WHERE tenant_id = ?
           AND target_type = 'provisioning_job'
           AND target_id = ?
           AND action = 'provisioning.job.status_updated'
         ORDER BY created_at ASC`,
    ).all(input.tenantId, input.jobId) as Array<{ after_state: string; reason: string; created_at: number }>;

    const timeline: ProvisioningTimelineEntry[] = [
        {
            status: "queued",
            at: input.createdAt,
            reason: null,
        },
    ];

    for (const row of rows) {
        let parsedAfterState: { status?: string } = {};
        try {
            parsedAfterState = JSON.parse(String(row.after_state ?? "{}")) as { status?: string };
        } catch {
            parsedAfterState = {};
        }

        const status = parsedAfterState.status as ProvisioningJobStatus | undefined;
        if (!status) {
            continue;
        }

        const last = timeline[timeline.length - 1];
        if (last && last.status === status) {
            timeline[timeline.length - 1] = {
                status,
                at: Number(row.created_at),
                reason: row.reason ? String(row.reason) : null,
            };
            continue;
        }

        timeline.push({
            status,
            at: Number(row.created_at),
            reason: row.reason ? String(row.reason) : null,
        });
    }

    const last = timeline[timeline.length - 1];
    if (!last || last.status !== input.currentStatus) {
        timeline.push({
            status: input.currentStatus,
            at: input.updatedAt,
            reason: null,
        });
    }

    return timeline;
};

export const getProvisioningEstimatedSecondsRemaining = (status: ProvisioningJobStatus): number | null => {
    if (status === "completed" || status === "cleaned_up") {
        return 0;
    }
    if (status === "failed") {
        return null;
    }

    const currentIndex = PROVISIONING_STATUS_ORDER.indexOf(status);
    if (currentIndex < 0) {
        return null;
    }

    let remaining = 0;
    for (let index = currentIndex; index < PROVISIONING_STATUS_ORDER.length; index += 1) {
        const stage = PROVISIONING_STATUS_ORDER[index];
        remaining += PROVISIONING_STAGE_ESTIMATED_SECONDS[stage] ?? 0;
    }

    return remaining;
};

export const getProvisioningSlaMetrics = (job: ProvisioningQueueEntry): ProvisioningSlaMetrics => {
    const elapsedSeconds = Math.max(0, Math.floor((now() - job.requestedAt) / 1000));
    const withinTarget = elapsedSeconds <= PROVISIONING_SLA_TARGET_SECONDS;
    const breachedTarget = elapsedSeconds > PROVISIONING_SLA_TARGET_SECONDS;
    const isStuck = elapsedSeconds > PROVISIONING_STUCK_THRESHOLD_SECONDS;
    const isTimedOut = elapsedSeconds > PROVISIONING_TIMEOUT_SECONDS;

    return {
        elapsedSeconds,
        targetSeconds: PROVISIONING_SLA_TARGET_SECONDS,
        timeoutSeconds: PROVISIONING_TIMEOUT_SECONDS,
        stuckThresholdSeconds: PROVISIONING_STUCK_THRESHOLD_SECONDS,
        withinTarget,
        breachedTarget,
        isStuck,
        isTimedOut,
    };
};

// ── Customer signup: tenant / workspace / bot lifecycle ───────────────────

export const initializeTenantWorkspaceAndBot = (input: {
    userId: string;
    tenantName: string;
    planId?: string;
}): {
    tenant: CustomerTenantRecord;
    workspace: CustomerWorkspaceRecord;
    bot: CustomerBotRecord;
    provisioningJobId: string;
    correlationId: string;
} => {
    // Idempotent: return existing records if already initialized for this user
    const userRow = db
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .get(input.userId) as Record<string, unknown> | undefined;

    if (userRow?.tenant_id) {
        const existingTenantId = String(userRow.tenant_id);
        const tenant = mapCustomerTenant(
            db.prepare(`SELECT * FROM customer_tenants WHERE id = ?`).get(existingTenantId) as Record<string, unknown>,
        );
        const workspace = mapCustomerWorkspace(
            db
                .prepare(`SELECT * FROM customer_workspaces WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1`)
                .get(existingTenantId) as Record<string, unknown>,
        );
        const bot = mapCustomerBot(
            db
                .prepare(`SELECT * FROM customer_bots WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1`)
                .get(workspace.id) as Record<string, unknown>,
        );
        const jobRow = db
            .prepare(`SELECT * FROM provisioning_queue WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
            .get(existingTenantId) as Record<string, unknown>;
        const job = mapProvisioningQueueEntry(jobRow);
        return { tenant, workspace, bot, provisioningJobId: job.id, correlationId: job.correlationId };
    }

    const planId = input.planId ?? "starter";
    const ts = now();

    // 1. Create tenant (status: pending)
    const tenantId = `tnt_${randomBytes(10).toString("hex")}`;
    db.prepare(
        `INSERT INTO customer_tenants (id, tenant_name, plan_id, billing_status, tenant_status, created_at)
         VALUES (?, ?, ?, 'trial', 'pending', ?)`,
    ).run(tenantId, input.tenantName, planId, ts);

    // 2. Create default workspace (status: pending)
    const workspaceId = `wsp_${randomBytes(10).toString("hex")}`;
    db.prepare(
        `INSERT INTO customer_workspaces (id, tenant_id, workspace_name, role_type, runtime_tier, workspace_status, created_at)
         VALUES (?, ?, 'Primary Workspace', 'developer', 'standard', 'pending', ?)`,
    ).run(workspaceId, tenantId, ts);

    // 3. Create default bot (status: created — never provisioning)
    const botId = `bot_${randomBytes(10).toString("hex")}`;
    db.prepare(
        `INSERT INTO customer_bots (id, workspace_id, bot_name, bot_status, policy_pack_version, created_at)
         VALUES (?, ?, 'Developer Agent', 'created', 'v1', ?)`,
    ).run(botId, workspaceId, ts);

    // 4. Link user to tenant
    db.prepare(`UPDATE users SET tenant_id = ? WHERE id = ?`).run(tenantId, input.userId);

    // 5. Persist provisioning.requested event to local queue
    const correlationId = `cor_${randomBytes(10).toString("hex")}`;
    const jobId = `prv_${randomBytes(8).toString("hex")}`;
    db.prepare(
        `INSERT INTO provisioning_queue
             (id, tenant_id, workspace_id, bot_id, plan_id, runtime_tier, role_type,
              correlation_id, requested_at, requested_by, trigger_source, status,
              failure_reason, remediation_hint, retry_of_job_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'standard', 'developer', ?, ?, ?, 'signup_complete', 'queued',
                 NULL, NULL, NULL, ?, ?)`,
    ).run(jobId, tenantId, workspaceId, botId, planId, correlationId, ts, input.userId, ts, ts);

    // 6. Transition workspace_status → provisioning (queue accepted)
    db.prepare(`UPDATE customer_workspaces SET workspace_status = 'provisioning' WHERE id = ?`).run(workspaceId);

    // 7. Transition tenant_status → provisioning
    db.prepare(`UPDATE customer_tenants SET tenant_status = 'provisioning' WHERE id = ?`).run(tenantId);

    const tenant = mapCustomerTenant(
        db.prepare(`SELECT * FROM customer_tenants WHERE id = ?`).get(tenantId) as Record<string, unknown>,
    );
    const workspace = mapCustomerWorkspace(
        db.prepare(`SELECT * FROM customer_workspaces WHERE id = ?`).get(workspaceId) as Record<string, unknown>,
    );
    const bot = mapCustomerBot(
        db.prepare(`SELECT * FROM customer_bots WHERE id = ?`).get(botId) as Record<string, unknown>,
    );

    return { tenant, workspace, bot, provisioningJobId: jobId, correlationId };
};

export const getProvisioningStatusForUser = (userId: string): {
    tenant: CustomerTenantRecord | null;
    workspace: CustomerWorkspaceRecord | null;
    bot: CustomerBotRecord | null;
    provisioningJob: ProvisioningQueueEntry | null;
} => {
    const userRow = db
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .get(userId) as Record<string, unknown> | undefined;
    const tenantId = userRow?.tenant_id ? String(userRow.tenant_id) : null;

    if (!tenantId) {
        return { tenant: null, workspace: null, bot: null, provisioningJob: null };
    }

    const tenantRow = db
        .prepare(`SELECT * FROM customer_tenants WHERE id = ?`)
        .get(tenantId) as Record<string, unknown> | undefined;
    const tenant = tenantRow ? mapCustomerTenant(tenantRow) : null;

    const workspaceRow = db
        .prepare(`SELECT * FROM customer_workspaces WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1`)
        .get(tenantId) as Record<string, unknown> | undefined;
    const workspace = workspaceRow ? mapCustomerWorkspace(workspaceRow) : null;

    const botRow = workspace
        ? (db
            .prepare(`SELECT * FROM customer_bots WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1`)
            .get(workspace.id) as Record<string, unknown> | undefined)
        : undefined;
    const bot = botRow ? mapCustomerBot(botRow) : null;

    const jobRow = db
        .prepare(`SELECT * FROM provisioning_queue WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(tenantId) as Record<string, unknown> | undefined;
    const provisioningJob = jobRow ? mapProvisioningQueueEntry(jobRow) : null;

    return { tenant, workspace, bot, provisioningJob };
};

export const listWorkspaceBotsForUser = (userId: string): WorkspaceBotContextRecord[] => {
    const userRow = db
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .get(userId) as Record<string, unknown> | undefined;
    const tenantId = userRow?.tenant_id ? String(userRow.tenant_id) : null;

    if (!tenantId) {
        return [];
    }

    const rows = db
        .prepare(
            `SELECT
                w.tenant_id,
                w.id AS workspace_id,
                w.workspace_name,
                w.role_type,
                b.id AS bot_id,
                b.bot_name,
                b.bot_status,
                b.policy_pack_version
             FROM customer_workspaces w
             JOIN customer_bots b ON b.workspace_id = w.id
             WHERE w.tenant_id = ?
             ORDER BY w.created_at ASC, b.created_at ASC`,
        )
        .all(tenantId) as Record<string, unknown>[];

    return rows.map((row) => ({
        tenantId: String(row.tenant_id),
        workspaceId: String(row.workspace_id),
        workspaceName: String(row.workspace_name),
        roleType: String(row.role_type),
        botId: String(row.bot_id),
        botName: String(row.bot_name),
        botStatus: String(row.bot_status) as CustomerBotStatus,
        policyPackVersion: String(row.policy_pack_version),
    }));
};

export const processProvisioningQueue = (input?: {
    limit?: number;
    jobIds?: string[];
    tenantIds?: string[];
    failJobIds?: string[];
    actorId?: string;
    actorEmail?: string;
}): {
    processed: number;
    completed: number;
    failed: number;
    jobs: ProvisioningQueueEntry[];
} => {
    const limit = Math.max(1, Math.min(50, Number(input?.limit ?? 10)));
    const failJobIdSet = new Set(input?.failJobIds ?? []);
    const jobIds = (input?.jobIds ?? []).filter((id) => id.trim().length > 0);
    const tenantIds = (input?.tenantIds ?? []).filter((id) => id.trim().length > 0);
    const actorId = input?.actorId ?? "provisioning-worker";
    const actorEmail = input?.actorEmail ?? "provisioning-worker@agentfarm.local";

    let rows: Record<string, unknown>[] = [];
    if (jobIds.length > 0) {
        const placeholders = jobIds.map(() => "?").join(", ");
        rows = db
            .prepare(
                `SELECT * FROM provisioning_queue
                 WHERE status = 'queued' AND id IN (${placeholders})
                 ORDER BY created_at ASC
                 LIMIT ?`,
            )
            .all(...jobIds, limit) as Record<string, unknown>[];
    } else if (tenantIds.length > 0) {
        const placeholders = tenantIds.map(() => "?").join(", ");
        rows = db
            .prepare(
                `SELECT * FROM provisioning_queue
                 WHERE status = 'queued' AND tenant_id IN (${placeholders})
                 ORDER BY created_at ASC
                 LIMIT ?`,
            )
            .all(...tenantIds, limit) as Record<string, unknown>[];
    } else {
        rows = db
            .prepare(`SELECT * FROM provisioning_queue WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?`)
            .all(limit) as Record<string, unknown>[];
    }

    const results: ProvisioningQueueEntry[] = [];
    let completed = 0;
    let failed = 0;

    rows.forEach((row) => {
        let entry = mapProvisioningQueueEntry(row);

        if (failJobIdSet.has(entry.id)) {
            entry = setProvisioningJobStatus(
                entry,
                PROVISIONING_FAILURE_STAGE,
                actorId,
                actorEmail,
                "Provisioning failed due to simulated Azure capacity check error.",
                {
                    failureReason: "azure_capacity_unavailable",
                    remediationHint: "Retry after 5 minutes or reduce runtime tier.",
                },
            );
        } else {
            PROVISIONING_SUCCESS_STAGES.forEach((stage) => {
                entry = setProvisioningJobStatus(entry, stage, actorId, actorEmail, undefined, {
                    failureReason: null,
                    remediationHint: null,
                });
            });
        }

        finalizeProvisioningJob(entry, actorId, actorEmail);

        if (entry.status === "completed") completed += 1;
        if (entry.status === "failed") failed += 1;
        results.push(entry);
    });

    return {
        processed: results.length,
        completed,
        failed,
        jobs: results,
    };
};

export const autoProcessProvisioningForUser = (input: {
    userId: string;
    actorId?: string;
    actorEmail?: string;
}): {
    processed: number;
    completed: number;
    failed: number;
} => {
    const userRow = db
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .get(input.userId) as Record<string, unknown> | undefined;

    const tenantId = userRow?.tenant_id ? String(userRow.tenant_id) : null;
    if (!tenantId) {
        return { processed: 0, completed: 0, failed: 0 };
    }

    const result = processProvisioningQueue({
        limit: 1,
        tenantIds: [tenantId],
        actorId: input.actorId ?? "provisioning-auto-tick",
        actorEmail: input.actorEmail ?? "provisioning-auto-tick@agentfarm.local",
    });

    return {
        processed: result.processed,
        completed: result.completed,
        failed: result.failed,
    };
};

export const retryProvisioningJob = (input: {
    jobId: string;
    requestedBy: string;
    actorId: string;
    actorEmail: string;
    expectedTenantId?: string;
}): { ok: true; job: ProvisioningQueueEntry; reused: boolean } | { ok: false; error: "not_found" | "not_retryable" | "retry_limit_exceeded"; retryAttemptCount?: number } => {
    const sourceRow = db
        .prepare(`SELECT * FROM provisioning_queue WHERE id = ?`)
        .get(input.jobId) as Record<string, unknown> | undefined;

    if (!sourceRow) {
        return { ok: false, error: "not_found" };
    }

    const source = mapProvisioningQueueEntry(sourceRow);
    if (input.expectedTenantId && source.tenantId !== input.expectedTenantId) {
        return { ok: false, error: "not_found" };
    }
    if (source.status !== "failed") {
        return { ok: false, error: "not_retryable" };
    }

    const existingQueuedRow = db
        .prepare(`SELECT * FROM provisioning_queue WHERE retry_of_job_id = ? AND status = 'queued' ORDER BY created_at DESC LIMIT 1`)
        .get(source.id) as Record<string, unknown> | undefined;

    if (existingQueuedRow) {
        return {
            ok: true,
            job: mapProvisioningQueueEntry(existingQueuedRow),
            reused: true,
        };
    }

    const MAX_RETRY_ATTEMPTS = 3;
    const newAttemptCount = source.retryAttemptCount + 1;
    if (newAttemptCount > MAX_RETRY_ATTEMPTS) {
        return { ok: false, error: "retry_limit_exceeded", retryAttemptCount: source.retryAttemptCount };
    }

    const ts = now();
    const retryJobId = `prv_${randomBytes(8).toString("hex")}`;
    const correlationId = `cor_${randomBytes(10).toString("hex")}`;

    db.prepare(
        `INSERT INTO provisioning_queue
             (id, tenant_id, workspace_id, bot_id, plan_id, runtime_tier, role_type,
              correlation_id, requested_at, requested_by, trigger_source, status,
              failure_reason, remediation_hint, retry_of_job_id, retry_attempt_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'operator_retry', 'queued',
                 NULL, NULL, ?, ?, ?, ?)`,
    ).run(
        retryJobId,
        source.tenantId,
        source.workspaceId,
        source.botId,
        source.planId,
        source.runtimeTier,
        source.roleType,
        correlationId,
        ts,
        input.requestedBy,
        source.id,
        newAttemptCount,
        ts,
        ts,
    );

    db.prepare(`UPDATE customer_tenants SET tenant_status = 'provisioning' WHERE id = ?`).run(source.tenantId);
    db.prepare(`UPDATE customer_workspaces SET workspace_status = 'provisioning' WHERE id = ?`).run(source.workspaceId);
    db.prepare(`UPDATE customer_bots SET bot_status = 'created' WHERE id = ?`).run(source.botId);

    writeAuditEvent({
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        action: "provisioning.job.retry_requested",
        targetType: "provisioning_job",
        targetId: source.id,
        tenantId: source.tenantId,
        afterState: {
            retryJobId,
            correlationId,
            retryOfJobId: source.id,
            status: "queued",
        },
        reason: "Operator requested provisioning retry for failed job.",
    });

    const queuedRetryRow = db
        .prepare(`SELECT * FROM provisioning_queue WHERE id = ?`)
        .get(retryJobId) as Record<string, unknown>;

    return {
        ok: true,
        job: mapProvisioningQueueEntry(queuedRetryRow),
        reused: false,
    };
};
