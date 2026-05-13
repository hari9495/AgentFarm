import { getRequestContext } from "@cloudflare/next-on-pages";

// --- Edge-compatible password helpers (Web Crypto PBKDF2, no node:crypto) ---

async function hashPassword(password: string): Promise<string> {
    const enc = new TextEncoder();
    const salt = randomHex(32);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
        keyMaterial, 256
    );
    const hash = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
    return `pbkdf2:${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (!stored.startsWith("pbkdf2:")) return false;
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, storedHash] = parts;
    if (!salt || !storedHash) return false;
    try {
        const enc = new TextEncoder();
        const keyMaterial = await globalThis.crypto.subtle.importKey(
            "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
        );
        const bits = await globalThis.crypto.subtle.deriveBits(
            { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
            keyMaterial, 256
        );
        const hash = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
        // Constant-time comparison to prevent timing attacks
        if (hash.length !== storedHash.length) return false;
        let diff = 0;
        for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
        return diff === 0;
    } catch { return false; }
}

// --- End edge-compatible password helpers ---

function randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase64url(bytes: number): string {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

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

// ── D1 database accessor ──────────────────────────────────────────────────────
const getDb = (): D1Database =>
    (getRequestContext() as { env: CloudflareEnv }).env.DB;

const now = (): number => Date.now();

// ── Seed data (use via: npx wrangler d1 execute agent-farm-db --file=./migrations/0002_seed.sql --remote) ──
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

const hashSessionToken = async (token: string): Promise<string> => {
    const data = new TextEncoder().encode(token);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
};

const mapUser = (row: Record<string, unknown> | undefined | null): UserRecord | null => {
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

// ── Internal async helpers ────────────────────────────────────────────────────

const setProvisioningJobStatus = async (
    entry: ProvisioningQueueEntry,
    nextStatus: ProvisioningJobStatus,
    actorId: string,
    actorEmail: string,
    reason?: string,
    diagnostics?: { failureReason?: string | null; remediationHint?: string | null },
): Promise<ProvisioningQueueEntry> => {
    const previousStatus = entry.status;
    const changed = previousStatus !== nextStatus
        || diagnostics?.failureReason !== undefined
        || diagnostics?.remediationHint !== undefined;

    if (changed) {
        const ts = now();
        const nextFailureReason = diagnostics?.failureReason ?? (nextStatus === "failed" ? entry.failureReason : null);
        const nextRemediationHint = diagnostics?.remediationHint ?? (nextStatus === "failed" ? entry.remediationHint : null);

        await getDb().prepare(
            `UPDATE provisioning_queue
             SET status = ?, failure_reason = ?, remediation_hint = ?, updated_at = ?
             WHERE id = ?`,
        ).bind(nextStatus, nextFailureReason, nextRemediationHint, ts, entry.id).run();

        await writeAuditEvent({
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

const finalizeProvisioningJob = async (
    entry: ProvisioningQueueEntry,
    actorId: string,
    actorEmail: string,
): Promise<void> => {
    if (entry.status === "completed") {
        await getDb().prepare(`UPDATE customer_tenants SET tenant_status = 'ready' WHERE id = ?`).bind(entry.tenantId).run();
        await getDb().prepare(`UPDATE customer_workspaces SET workspace_status = 'ready' WHERE id = ?`).bind(entry.workspaceId).run();
        await getDb().prepare(`UPDATE customer_bots SET bot_status = 'active' WHERE id = ?`).bind(entry.botId).run();

        await writeAuditEvent({
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
        await getDb().prepare(`UPDATE customer_tenants SET tenant_status = 'degraded' WHERE id = ?`).bind(entry.tenantId).run();
        await getDb().prepare(`UPDATE customer_workspaces SET workspace_status = 'failed' WHERE id = ?`).bind(entry.workspaceId).run();
        await getDb().prepare(`UPDATE customer_bots SET bot_status = 'failed' WHERE id = ?`).bind(entry.botId).run();

        await writeAuditEvent({
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

const refreshDeploymentLifecycle = async (job: DeploymentJobRecord): Promise<DeploymentJobRecord> => {
    const nowTs = now();
    const elapsed = nowTs - job.createdAt;

    if (job.status === "queued" && elapsed > 4000) {
        await getDb().prepare(`UPDATE deployment_jobs SET status = ?, status_message = ?, updated_at = ? WHERE id = ?`)
            .bind("running", "Deployment is currently rolling out.", nowTs, job.id).run();
    }

    if (job.status === "running" && elapsed > 11000) {
        await getDb().prepare(`UPDATE deployment_jobs SET status = ?, status_message = ?, updated_at = ? WHERE id = ?`)
            .bind("succeeded", "Deployment completed successfully.", nowTs, job.id).run();
    }

    const refreshed = await getDb().prepare(`SELECT * FROM deployment_jobs WHERE id = ?`).bind(job.id).first<Record<string, unknown>>();
    return refreshed ? mapDeploymentJob(refreshed) : job;
};

const getDeploymentForUser = async (userId: string, deploymentId: string): Promise<DeploymentJobRecord | null> => {
    const row = await getDb()
        .prepare(`SELECT * FROM deployment_jobs WHERE id = ? AND user_id = ?`)
        .bind(deploymentId, userId).first<Record<string, unknown>>();
    return row ? mapDeploymentJob(row) : null;
};

const getMarketplaceSelection = async (userId: string): Promise<MarketplaceSelectionRecord | null> => {
    const row = await getDb()
        .prepare(`SELECT user_id, starter_agent, config_json, updated_at FROM marketplace_selections WHERE user_id = ?`)
        .bind(userId).first<Record<string, unknown>>();

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

// ── User management ───────────────────────────────────────────────────────────

export const createUser = async (input: {
    name: string;
    email: string;
    company: string;
    password: string;
}): Promise<UserRecord> => {
    const userId = `usr_${randomHex(10)}`;
    const createdAt = now();
    const passwordHash = await hashPassword(input.password);
    const countRow = await getDb().prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>();
    const usersCount = countRow?.count ?? 0;

    let role: UserRole = "member";
    if (isSuperAdminEligibleEmail(input.email)) {
        role = "superadmin";
    } else if (isAdminEligibleEmail(input.email)) {
        role = "admin";
    } else if (!hasExplicitSuperAdminRules && Number(usersCount) === 0) {
        role = "superadmin";
    }

    await getDb().prepare(
        `INSERT INTO users (id, email, name, company, role, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(userId, input.email, input.name, input.company, role, passwordHash, createdAt).run();

    const user = mapUser(
        await getDb().prepare(`SELECT id, email, name, company, role, tenant_id FROM users WHERE id = ?`).bind(userId).first<Record<string, unknown>>(),
    );

    if (!user) {
        throw new Error("Failed to create user");
    }

    return user;
};

export const findUserByEmail = async (email: string): Promise<UserRecord | null> => {
    const row = await getDb()
        .prepare(`SELECT id, email, name, company, role FROM users WHERE email = ?`)
        .bind(email).first<Record<string, unknown>>();
    return mapUser(row);
};

export const authenticateUser = async (email: string, password: string): Promise<UserRecord | null> => {
    const row = await getDb()
        .prepare(`SELECT id, email, name, company, role, password_hash FROM users WHERE email = ?`)
        .bind(email).first<Record<string, unknown> & { password_hash: string }>();

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
        await getDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(effectiveRole, String(row.id)).run();
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

export const createSession = async (userId: string): Promise<{ sessionToken: string; session: SessionRecord }> => {
    const sessionId = `ses_${randomHex(10)}`;
    const sessionToken = randomBase64url(48);
    const tokenHash = await hashSessionToken(sessionToken);
    const createdAt = now();
    const expiresAt = createdAt + SESSION_TTL_MS;

    await getDb().prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(sessionId, userId, tokenHash, expiresAt, createdAt, createdAt).run();

    return {
        sessionToken,
        session: { sessionId, userId, expiresAt },
    };
};

export const updateUserGatewayIds = async (input: {
    userId: string;
    gatewayTenantId: string;
    gatewayWorkspaceId: string;
    gatewayBotId: string;
    gatewayToken: string;
}): Promise<void> => {
    await getDb().prepare(
        `UPDATE users
         SET gateway_tenant_id = ?, gateway_workspace_id = ?, gateway_bot_id = ?, gateway_token = ?
         WHERE id = ?`,
    ).bind(input.gatewayTenantId, input.gatewayWorkspaceId, input.gatewayBotId, input.gatewayToken, input.userId).run();
};

export const updateUserGatewayToken = async (input: {
    userId: string;
    gatewayToken: string;
}): Promise<void> => {
    await getDb().prepare(`UPDATE users SET gateway_token = ? WHERE id = ?`).bind(input.gatewayToken, input.userId).run();
};

export const getSessionUser = async (sessionToken: string): Promise<UserRecord | null> => {
    const tokenHash = await hashSessionToken(sessionToken);

    const row = await getDb()
        .prepare(
            `SELECT
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
            WHERE sessions.token_hash = ?`,
        )
        .bind(tokenHash).first<{
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
        }>();

    if (!row) {
        return null;
    }

    if (Number(row.expires_at) <= now()) {
        await getDb().prepare(`DELETE FROM sessions WHERE id = ?`).bind(String(row.session_id)).run();
        return null;
    }

    await getDb().prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`).bind(now(), String(row.session_id)).run();

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

export const deleteSession = async (sessionToken: string): Promise<void> => {
    const tokenHash = await hashSessionToken(sessionToken);
    await getDb().prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
};

export const completeOnboarding = async (input: {
    userId: string;
    githubOrg: string;
    inviteEmail: string;
    starterAgent: string;
}): Promise<void> => {
    await getDb().prepare(
        `UPDATE users
         SET github_org = ?, invite_email = ?, starter_agent = ?, onboarding_completed_at = ?
         WHERE id = ?`,
    ).bind(input.githubOrg, input.inviteEmail, input.starterAgent, now(), input.userId).run();
};

export const saveMarketplaceSelection = async (input: {
    userId: string;
    starterAgent: string;
    config?: Record<string, unknown>;
}): Promise<void> => {
    await getDb().prepare(`UPDATE users SET starter_agent = ? WHERE id = ?`).bind(input.starterAgent, input.userId).run();

    await getDb().prepare(
        `INSERT INTO marketplace_selections (user_id, starter_agent, config_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           starter_agent = excluded.starter_agent,
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`,
    ).bind(input.userId, input.starterAgent, JSON.stringify(input.config ?? {}), now()).run();
};

export const getUserOnboardingState = async (userId: string): Promise<UserOnboardingState | null> => {
    const row = await getDb()
        .prepare(`SELECT id, starter_agent, onboarding_completed_at FROM users WHERE id = ?`)
        .bind(userId).first<Record<string, unknown>>();

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

export const requestDeployment = async (input: {
    userId: string;
    botSlug: string;
    botName: string;
    actorEmail?: string;
}): Promise<{ ok: true; job: DeploymentJobRecord } | { ok: false; error: "onboarding_required" | "missing_selection" }> => {
    const onboarding = await getUserOnboardingState(input.userId);
    const selection = await getMarketplaceSelection(input.userId);
    if (!onboarding) {
        return { ok: false, error: "missing_selection" };
    }

    if (!selection || selection.starterAgent !== input.botSlug) {
        return { ok: false, error: "missing_selection" };
    }

    if (!onboarding.onboardingCompletedAt) {
        return { ok: false, error: "onboarding_required" };
    }

    const id = `dep_${randomHex(8)}`;
    const ts = now();
    await getDb().prepare(
        `INSERT INTO deployment_jobs (
            id, user_id, bot_slug, bot_name, status, status_message, created_at, updated_at, last_action_type, last_action_by, last_action_at
         )
         VALUES (?, ?, ?, ?, 'queued', 'Deployment request queued for execution.', ?, ?, 'requested', ?, ?)`,
    ).bind(id, input.userId, input.botSlug, input.botName, ts, ts, input.actorEmail ?? `user:${input.userId}`, ts).run();

    const row = await getDb().prepare(`SELECT * FROM deployment_jobs WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!row) {
        return { ok: false, error: "missing_selection" };
    }

    return { ok: true, job: mapDeploymentJob(row) };
};

export const getLatestDeploymentForUser = async (userId: string): Promise<DeploymentJobRecord | null> => {
    const row = await getDb()
        .prepare(`SELECT * FROM deployment_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(userId).first<Record<string, unknown>>();

    if (!row) {
        return null;
    }

    return refreshDeploymentLifecycle(mapDeploymentJob(row));
};

export const listDeploymentsForUser = async (userId: string, limit = 25): Promise<DeploymentJobRecord[]> => {
    const effectiveLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const result = await getDb()
        .prepare(`SELECT * FROM deployment_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
        .bind(userId, effectiveLimit).all<Record<string, unknown>>();

    return Promise.all(result.results.map((row) => refreshDeploymentLifecycle(mapDeploymentJob(row))));
};

export const cancelDeployment = async (input: {
    userId: string;
    deploymentId: string;
    actorEmail?: string;
}): Promise<{ ok: true; job: DeploymentJobRecord } | { ok: false; error: "not_found" | "not_cancelable" }> => {
    const existing = await getDeploymentForUser(input.userId, input.deploymentId);
    if (!existing) {
        return { ok: false, error: "not_found" };
    }

    const current = await refreshDeploymentLifecycle(existing);
    if (current.status !== "queued" && current.status !== "running") {
        return { ok: false, error: "not_cancelable" };
    }

    const ts = now();
    await getDb().prepare(
        `UPDATE deployment_jobs
         SET status = ?, status_message = ?, updated_at = ?, last_action_type = ?, last_action_by = ?, last_action_at = ?
         WHERE id = ?`,
    ).bind("canceled", "Deployment canceled by user.", ts, "canceled", input.actorEmail ?? `user:${input.userId}`, ts, input.deploymentId).run();

    const updated = await getDeploymentForUser(input.userId, input.deploymentId);
    if (!updated) {
        return { ok: false, error: "not_found" };
    }

    return { ok: true, job: updated };
};

export const retryDeployment = async (input: {
    userId: string;
    deploymentId: string;
    actorEmail?: string;
}): Promise<{ ok: true; job: DeploymentJobRecord } | { ok: false; error: "not_found" | "not_retryable" }> => {
    const existing = await getDeploymentForUser(input.userId, input.deploymentId);
    if (!existing) {
        return { ok: false, error: "not_found" };
    }

    const current = await refreshDeploymentLifecycle(existing);
    if (current.status !== "failed") {
        return { ok: false, error: "not_retryable" };
    }

    const id = `dep_${randomHex(8)}`;
    const ts = now();
    await getDb().prepare(
        `INSERT INTO deployment_jobs (
            id, user_id, bot_slug, bot_name, status, status_message, created_at, updated_at, last_action_type, last_action_by, last_action_at
         )
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 'retried', ?, ?)`,
    ).bind(
        id,
        input.userId,
        current.botSlug,
        current.botName,
        `Retry requested after ${current.id}.`,
        ts,
        ts,
        input.actorEmail ?? `user:${input.userId}`,
        ts,
    ).run();

    const created = await getDeploymentForUser(input.userId, id);
    if (!created) {
        return { ok: false, error: "not_found" };
    }

    return { ok: true, job: created };
};

// ── Approvals ─────────────────────────────────────────────────────────────────

export const listApprovals = async (filters?: {
    status?: ApprovalDecision;
    agentSlug?: string;
    tenantId?: string;
    limit?: number;
}): Promise<ApprovalRecord[]> => {
    const status = filters?.status ?? "pending";
    const agentSlug = filters?.agentSlug;
    const tenantId = filters?.tenantId;
    const limit = Math.max(1, Math.min(200, Math.floor(filters?.limit ?? 100)));

    if (agentSlug) {
        const result = tenantId
            ? await getDb().prepare(`SELECT * FROM approvals WHERE status = ? AND agent_slug = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?`).bind(status, agentSlug, tenantId, limit).all<Record<string, unknown>>()
            : await getDb().prepare(`SELECT * FROM approvals WHERE status = ? AND agent_slug = ? ORDER BY created_at DESC LIMIT ?`).bind(status, agentSlug, limit).all<Record<string, unknown>>();
        return result.results.map(mapApproval);
    }

    const result = tenantId
        ? await getDb().prepare(`SELECT * FROM approvals WHERE status = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?`).bind(status, tenantId, limit).all<Record<string, unknown>>()
        : await getDb().prepare(`SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT ?`).bind(status, limit).all<Record<string, unknown>>();
    return result.results.map(mapApproval);
};

export const createApprovalRequest = async (input: {
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
}): Promise<ApprovalRecord> => {
    const id = `APR-${randomHex(3).toUpperCase()}`;
    const createdAt = now();

    await getDb().prepare(
        `INSERT INTO approvals (
            id, title, agent_slug, agent, requested_by, channel, reason, risk, status, tenant_id, created_at, escalation_timeout_seconds
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(
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
    ).run();

    await writeAuditEvent({
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

    const created = await getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!created) {
        throw new Error("Failed to create approval request.");
    }

    return mapApproval(created);
};

export const listRecentActivity = async (limit = 20, tenantId?: string): Promise<ActivityFeedEvent[]> => {
    const effectiveLimit = Math.max(5, Math.min(100, Math.floor(limit)));
    const result = tenantId
        ? await getDb().prepare(`SELECT * FROM approvals WHERE tenant_id = ? ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?`).bind(tenantId, effectiveLimit * 2).all<Record<string, unknown>>()
        : await getDb().prepare(`SELECT * FROM approvals ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?`).bind(effectiveLimit * 2).all<Record<string, unknown>>();

    const events: Array<ActivityFeedEvent & { ts: number }> = [];

    result.results.forEach((row) => {
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

export const decideApproval = async (input: {
    id: string;
    decision: "approved" | "rejected";
    decidedBy: string;
    reason?: string;
}): Promise<ApprovalRecord | null> => {
    const rowBefore = await getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).bind(input.id).first<Record<string, unknown>>();
    if (!rowBefore || String(rowBefore.status) !== "pending") {
        return null;
    }

    const createdAt = Number(rowBefore.created_at);
    const decidedAt = now();
    const decisionLatencySeconds = Math.max(0, Math.floor((decidedAt - createdAt) / 1000));

    const result = await getDb()
        .prepare(
            `UPDATE approvals
             SET status = ?, decided_at = ?, decided_by = ?, decision_reason = ?, decision_latency_seconds = ?
             WHERE id = ? AND status = 'pending'`,
        )
        .bind(input.decision, decidedAt, input.decidedBy, input.reason?.trim() || null, decisionLatencySeconds, input.id).run();

    if (Number(result.meta.changes) === 0) {
        return null;
    }

    const row = await getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).bind(input.id).first<Record<string, unknown>>();
    if (!row) {
        return null;
    }

    const updated = mapApproval(row);
    await writeAuditEvent({
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

export const escalatePendingApprovals = async (input: {
    tenantId?: string;
    actorId: string;
    actorEmail: string;
    nowTs?: number;
}): Promise<{ escalatedCount: number; escalatedIds: string[] }> => {
    const nowTs = input.nowTs ?? now();
    const result = input.tenantId
        ? await getDb().prepare(
            `SELECT * FROM approvals
             WHERE status = 'pending'
               AND tenant_id = ?
               AND escalated_at IS NULL
               AND created_at + (escalation_timeout_seconds * 1000) <= ?
             ORDER BY created_at ASC`,
        ).bind(input.tenantId, nowTs).all<Record<string, unknown>>()
        : await getDb().prepare(
            `SELECT * FROM approvals
             WHERE status = 'pending'
               AND escalated_at IS NULL
               AND created_at + (escalation_timeout_seconds * 1000) <= ?
             ORDER BY created_at ASC`,
        ).bind(nowTs).all<Record<string, unknown>>();

    const escalatedIds: string[] = [];

    for (const row of result.results) {
        const approvalId = String(row.id);
        const changed = await getDb().prepare(`UPDATE approvals SET escalated_at = ? WHERE id = ? AND escalated_at IS NULL`).bind(nowTs, approvalId).run();
        if (Number(changed.meta.changes) > 0) {
            escalatedIds.push(approvalId);
            await writeAuditEvent({
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

// ── User management ────────────────────────────────────────────────────────────

export type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: UserRole;
    createdAt: number;
};

export const listUsers = async (): Promise<UserPublic[]> => {
    const result = await getDb()
        .prepare(`SELECT id, email, name, company, role, created_at FROM users ORDER BY created_at ASC`)
        .all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

export const getUserById = async (id: string): Promise<UserPublic | null> => {
    const row = await getDb()
        .prepare(`SELECT id, email, name, company, role, created_at FROM users WHERE id = ?`)
        .bind(id).first<Record<string, unknown>>();
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

export const updateUserRole = async (
    targetUserId: string,
    newRole: UserRole,
    actingUserId: string,
    actingUserRole: UserRole,
): Promise<{ ok: boolean; error?: string }> => {
    const targetRow = await getDb()
        .prepare(`SELECT role FROM users WHERE id = ?`)
        .bind(targetUserId).first<{ role: string }>();
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
        const superAdminCount = await getDb()
            .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'`)
            .first<{ count: number }>();
        if (Number(superAdminCount?.count ?? 0) <= 1) {
            return { ok: false, error: "Cannot demote the last super admin." };
        }
    }

    if (targetRole === "admin" && newRole === "member" && targetUserId === actingUserId) {
        return { ok: false, error: "You cannot demote yourself." };
    }

    await getDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(newRole, targetUserId).run();
    return { ok: true };
};

// ── Session management ────────────────────────────────────────────────────────

export type OperatorSessionRecord = {
    sessionId: string;
    userId: string;
    userEmail: string;
    userName: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number;
};

export const listActiveOperatorSessions = async (): Promise<OperatorSessionRecord[]> => {
    const result = await getDb()
        .prepare(
            `SELECT sessions.id AS session_id, sessions.user_id, sessions.created_at,
                    sessions.expires_at, sessions.last_seen_at,
                    users.email AS user_email, users.name AS user_name
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             WHERE sessions.expires_at > ?
             ORDER BY sessions.last_seen_at DESC`,
        )
        .bind(now()).all<Record<string, unknown>>();
    return result.results.map((row) => ({
        sessionId: String(row.session_id),
        userId: String(row.user_id),
        userEmail: String(row.user_email),
        userName: String(row.user_name),
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
        lastSeenAt: Number(row.last_seen_at),
    }));
};

export const revokeSessionById = async (sessionId: string): Promise<{ ok: boolean }> => {
    const result = await getDb().prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
    return { ok: Number(result.meta.changes) > 0 };
};

// ── Bot / Agent management ────────────────────────────────────────────────────

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

export const listBots = async (): Promise<BotRecord[]> => {
    const result = await getDb().prepare(`SELECT * FROM bots ORDER BY created_at ASC`).all<Record<string, unknown>>();
    return result.results.map(mapBot);
};

export const getBotBySlug = async (slug: string): Promise<BotRecord | null> => {
    const row = await getDb().prepare(`SELECT * FROM bots WHERE slug = ?`).bind(slug).first<Record<string, unknown>>();
    return row ? mapBot(row) : null;
};

export const updateBotStatus = async (slug: string, status: BotStatus): Promise<{ ok: boolean }> => {
    const result = await getDb().prepare(`UPDATE bots SET status = ?, last_activity_at = ? WHERE slug = ?`).bind(status, now(), slug).run();
    return { ok: Number(result.meta.changes) > 0 };
};

export const updateBotConfig = async (
    slug: string,
    config: Partial<{
        autonomyLevel: AutonomyLevel;
        approvalPolicy: ApprovalPolicy;
        shiftStart: string;
        shiftEnd: string;
        activeDays: string;
        notes: string;
    }>,
): Promise<{ ok: boolean }> => {
    const fields: string[] = [];
    const values: Array<string | number> = [];

    if (config.autonomyLevel !== undefined) { fields.push("autonomy_level = ?"); values.push(config.autonomyLevel); }
    if (config.approvalPolicy !== undefined) { fields.push("approval_policy = ?"); values.push(config.approvalPolicy); }
    if (config.shiftStart !== undefined) { fields.push("shift_start = ?"); values.push(config.shiftStart); }
    if (config.shiftEnd !== undefined) { fields.push("shift_end = ?"); values.push(config.shiftEnd); }
    if (config.activeDays !== undefined) { fields.push("active_days = ?"); values.push(config.activeDays); }
    if (config.notes !== undefined) { fields.push("notes = ?"); values.push(config.notes); }

    if (fields.length === 0) return { ok: false };

    values.push(slug);
    const result = await getDb().prepare(`UPDATE bots SET ${fields.join(", ")} WHERE slug = ?`).bind(...values).run();
    return { ok: Number(result.meta.changes) > 0 };
};

// ── Company control plane ─────────────────────────────────────────────────────

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

export const listCompanyTenants = async (): Promise<TenantRecord[]> => {
    const result = await getDb().prepare(`SELECT * FROM tenants ORDER BY created_at ASC`).all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

export const listCompanyFleetBots = async (): Promise<FleetBotRecord[]> => {
    const result = await getDb()
        .prepare(
            `SELECT
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
             ORDER BY tenant_bots.last_activity_at DESC`,
        )
        .all<Record<string, unknown>>();

    return result.results.map((row) => ({
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

export const updateCompanyFleetBotStatus = async (botId: string, status: FleetBotStatus): Promise<{ ok: boolean }> => {
    const result = await getDb()
        .prepare(`UPDATE tenant_bots SET status = ?, last_activity_at = ? WHERE id = ?`)
        .bind(status, now(), botId).run();
    return { ok: Number(result.meta.changes) > 0 };
};

export const listCompanyIntegrations = async (): Promise<IntegrationRecord[]> => {
    const result = await getDb()
        .prepare(
            `SELECT
                tenant_integrations.id,
                tenant_integrations.tenant_id,
                tenants.name AS tenant_name,
                tenant_integrations.integration,
                tenant_integrations.status,
                tenant_integrations.last_check_at,
                tenant_integrations.error_message
             FROM tenant_integrations
             INNER JOIN tenants ON tenants.id = tenant_integrations.tenant_id
             ORDER BY tenant_integrations.last_check_at DESC`,
        )
        .all<Record<string, unknown>>();

    return result.results.map((row) => ({
        id: String(row.id),
        tenantId: String(row.tenant_id),
        tenantName: String(row.tenant_name),
        integration: String(row.integration),
        status: String(row.status) as IntegrationStatus,
        lastCheckAt: Number(row.last_check_at),
        errorMessage: String(row.error_message ?? ""),
    }));
};

export const listCompanyIncidents = async (): Promise<IncidentRecord[]> => {
    const result = await getDb()
        .prepare(
            `SELECT
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
             ORDER BY tenant_incidents.created_at DESC`,
        )
        .all<Record<string, unknown>>();

    return result.results.map((row) => ({
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

export const resolveCompanyIncident = async (
    incidentId: string,
    note: string,
): Promise<{ ok: boolean; error?: string }> => {
    const row = await getDb()
        .prepare(`SELECT status FROM tenant_incidents WHERE id = ?`)
        .bind(incidentId).first<{ status?: string }>();
    if (!row) return { ok: false, error: "Incident not found." };
    if (String(row.status) === "resolved") return { ok: false, error: "Incident already resolved." };

    const result = await getDb()
        .prepare(
            `UPDATE tenant_incidents
             SET status = 'resolved', resolved_at = ?, resolution_note = ?
             WHERE id = ?`,
        )
        .bind(now(), note.trim(), incidentId).run();

    return { ok: Number(result.meta.changes) > 0 };
};

export const listCompanyLogs = async (input?: {
    tenantId?: string;
    level?: LogLevel;
    limit?: number;
}): Promise<TenantLogRecord[]> => {
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

    const result = await getDb().prepare(query).bind(...values).all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

export const getCompanyBillingSummary = async (): Promise<{
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
}> => {
    const result = await getDb()
        .prepare(`SELECT id, name, plan, mrr_cents, open_invoices FROM tenants ORDER BY mrr_cents DESC`)
        .all<Record<string, unknown>>();

    const byTenant = result.results.map((row) => ({
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

export const getCompanyTenantById = async (id: string): Promise<TenantRecord | null> => {
    const row = await getDb().prepare(`SELECT * FROM tenants WHERE id = ?`).bind(id).first<Record<string, unknown>>();
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

export const getCompanyTenantFleetBots = async (tenantId: string): Promise<FleetBotRecord[]> => {
    const result = await getDb()
        .prepare(
            `SELECT tenant_bots.id, tenant_bots.tenant_id, tenants.name AS tenant_name,
                    tenant_bots.bot_slug, tenant_bots.display_name, tenant_bots.status,
                    tenant_bots.reliability_pct, tenant_bots.tasks_completed, tenant_bots.last_activity_at
             FROM tenant_bots
             INNER JOIN tenants ON tenants.id = tenant_bots.tenant_id
             WHERE tenant_bots.tenant_id = ?
             ORDER BY tenant_bots.last_activity_at DESC`,
        )
        .bind(tenantId).all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

export const getCompanyTenantIncidents = async (tenantId: string): Promise<IncidentRecord[]> => {
    const result = await getDb()
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
        .bind(tenantId).all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

export const assignCompanyIncident = async (
    incidentId: string,
    assigneeEmail: string,
): Promise<{ ok: boolean; error?: string }> => {
    const row = await getDb().prepare(`SELECT id FROM tenant_incidents WHERE id = ?`).bind(incidentId).first<{ id?: string }>();
    if (!row) return { ok: false, error: "Incident not found." };
    await getDb().prepare(`UPDATE tenant_incidents SET assignee_email = ? WHERE id = ?`).bind(assigneeEmail.trim().toLowerCase(), incidentId).run();
    return { ok: true };
};

export const updateCompanyIncidentSeverity = async (
    incidentId: string,
    severity: IncidentSeverity,
): Promise<{ ok: boolean; error?: string }> => {
    const row = await getDb().prepare(`SELECT id FROM tenant_incidents WHERE id = ?`).bind(incidentId).first<{ id?: string }>();
    if (!row) return { ok: false, error: "Incident not found." };
    await getDb().prepare(`UPDATE tenant_incidents SET severity = ? WHERE id = ?`).bind(severity, incidentId).run();
    return { ok: true };
};

export const getCompanyFleetBotById = async (id: string): Promise<FleetBotRecord | null> => {
    const row = await getDb()
        .prepare(
            `SELECT tenant_bots.id, tenant_bots.tenant_id, tenants.name AS tenant_name,
                    tenant_bots.bot_slug, tenant_bots.display_name, tenant_bots.status,
                    tenant_bots.reliability_pct, tenant_bots.tasks_completed, tenant_bots.last_activity_at
             FROM tenant_bots
             INNER JOIN tenants ON tenants.id = tenant_bots.tenant_id
             WHERE tenant_bots.id = ?`,
        )
        .bind(id).first<Record<string, unknown>>();
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

export const getCompanyIncidentById = async (id: string): Promise<IncidentRecord | null> => {
    const row = await getDb()
        .prepare(
            `SELECT tenant_incidents.id, tenant_incidents.tenant_id, tenants.name AS tenant_name,
                    tenant_incidents.title, tenant_incidents.severity, tenant_incidents.status,
                    tenant_incidents.source, tenant_incidents.created_at, tenant_incidents.resolved_at,
                    tenant_incidents.resolution_note, tenant_incidents.assignee_email
             FROM tenant_incidents
             INNER JOIN tenants ON tenants.id = tenant_incidents.tenant_id
             WHERE tenant_incidents.id = ?`,
        )
        .bind(id).first<Record<string, unknown>>();
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

export const createCompanyTenant = async (input: {
    name: string;
    plan: string;
    region: string;
    mrrCents?: number;
}): Promise<TenantRecord> => {
    const id = `tnt_${randomHex(8)}`;
    const ts = now();
    await getDb().prepare(
        `INSERT INTO tenants (id, name, plan, status, region, mrr_cents, open_invoices, last_heartbeat_at, created_at)
         VALUES (?, ?, ?, 'healthy', ?, ?, 0, ?, ?)`,
    ).bind(id, input.name.trim(), input.plan, input.region, input.mrrCents ?? 0, ts, ts).run();
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

export const createCompanyTenantBot = async (input: {
    tenantId: string;
    botSlug: string;
    displayName: string;
}): Promise<FleetBotRecord> => {
    const id = `fb_${randomHex(8)}`;
    const ts = now();
    await getDb().prepare(
        `INSERT INTO tenant_bots (id, tenant_id, bot_slug, display_name, status, reliability_pct, tasks_completed, last_activity_at)
         VALUES (?, ?, ?, ?, 'active', 100.0, 0, ?)`,
    ).bind(id, input.tenantId, input.botSlug, input.displayName, ts).run();
    const tenant = await getDb().prepare(`SELECT name FROM tenants WHERE id = ?`).bind(input.tenantId).first<{ name: string }>();
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

// ── Audit trail ───────────────────────────────────────────────────────────────

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

export const writeAuditEvent = async (event: {
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reason?: string;
}): Promise<void> => {
    const id = `aud_${randomHex(8)}`;
    await getDb().prepare(
        `INSERT INTO company_audit_events
            (id, actor_id, actor_email, action, target_type, target_id, tenant_id, before_state, after_state, reason, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
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
    ).run();
};

export const listAuditEvents = async (input?: {
    actorEmail?: string;
    tenantId?: string;
    action?: string;
    sinceTs?: number;
    untilTs?: number;
    limit?: number;
}): Promise<AuditEventRecord[]> => {
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
    query += ` ORDER BY created_at DESC LIMIT ?`;
    values.push(limit);

    const result = await getDb().prepare(query).bind(...values).all<Record<string, unknown>>();
    return result.results.map((row) => ({
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

// ── Compliance evidence ───────────────────────────────────────────────────────

export const getComplianceEvidenceSummary = async (input?: {
    tenantId?: string;
    windowHours?: number;
}): Promise<ComplianceEvidenceSummary> => {
    const generatedAt = now();
    const windowHours = Math.max(1, Math.min(24 * 30, Math.floor(input?.windowHours ?? 24)));
    const sinceTs = generatedAt - windowHours * 60 * 60 * 1000;

    const allApprovals = [
        ...await listApprovals({ status: "pending", tenantId: input?.tenantId, limit: 500 }),
        ...await listApprovals({ status: "approved", tenantId: input?.tenantId, limit: 500 }),
        ...await listApprovals({ status: "rejected", tenantId: input?.tenantId, limit: 500 }),
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

    const auditEvents = await listAuditEvents({ tenantId: input?.tenantId, sinceTs, limit: 500 });
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

export const exportComplianceEvidencePack = async (input?: {
    tenantId?: string;
    windowHours?: number;
}): Promise<ComplianceEvidencePack> => {
    const summary = await getComplianceEvidenceSummary(input);

    return {
        generatedAt: summary.generatedAt,
        tenantId: input?.tenantId ?? null,
        retentionPolicy: {
            activeDays: 365,
            archiveDays: 730,
        },
        summary,
        approvals: [
            ...await listApprovals({ status: "pending", tenantId: input?.tenantId, limit: 500 }),
            ...await listApprovals({ status: "approved", tenantId: input?.tenantId, limit: 500 }),
            ...await listApprovals({ status: "rejected", tenantId: input?.tenantId, limit: 500 }),
        ],
        auditEvents: await listAuditEvents({ tenantId: input?.tenantId, limit: 500 }),
    };
};

// ── Provisioning ──────────────────────────────────────────────────────────────

export const getProvisioningTimelineForJob = async (input: {
    tenantId: string;
    jobId: string;
    createdAt: number;
    currentStatus: ProvisioningJobStatus;
    updatedAt: number;
}): Promise<ProvisioningTimelineEntry[]> => {
    const result = await getDb().prepare(
        `SELECT action, after_state, reason, created_at
         FROM company_audit_events
         WHERE tenant_id = ?
           AND target_type = 'provisioning_job'
           AND target_id = ?
           AND action = 'provisioning.job.status_updated'
         ORDER BY created_at ASC`,
    ).bind(input.tenantId, input.jobId).all<{ after_state: string; reason: string; created_at: number }>();

    const timeline: ProvisioningTimelineEntry[] = [
        {
            status: "queued",
            at: input.createdAt,
            reason: null,
        },
    ];

    for (const row of result.results) {
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

export const initializeTenantWorkspaceAndBot = async (input: {
    userId: string;
    tenantName: string;
    planId?: string;
}): Promise<{
    tenant: CustomerTenantRecord;
    workspace: CustomerWorkspaceRecord;
    bot: CustomerBotRecord;
    provisioningJobId: string;
    correlationId: string;
}> => {
    const userRow = await getDb()
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .bind(input.userId).first<Record<string, unknown>>();

    if (userRow?.tenant_id) {
        const existingTenantId = String(userRow.tenant_id);
        const tenantRow = await getDb().prepare(`SELECT * FROM customer_tenants WHERE id = ?`).bind(existingTenantId).first<Record<string, unknown>>();
        const workspaceRow = await getDb().prepare(`SELECT * FROM customer_workspaces WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1`).bind(existingTenantId).first<Record<string, unknown>>();
        const tenant = mapCustomerTenant(tenantRow!);
        const workspace = mapCustomerWorkspace(workspaceRow!);
        const botRow = await getDb().prepare(`SELECT * FROM customer_bots WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1`).bind(workspace.id).first<Record<string, unknown>>();
        const bot = mapCustomerBot(botRow!);
        const jobRow = await getDb().prepare(`SELECT * FROM provisioning_queue WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`).bind(existingTenantId).first<Record<string, unknown>>();
        const job = mapProvisioningQueueEntry(jobRow!);
        return { tenant, workspace, bot, provisioningJobId: job.id, correlationId: job.correlationId };
    }

    const planId = input.planId ?? "starter";
    const ts = now();

    const tenantId = `tnt_${randomHex(10)}`;
    await getDb().prepare(
        `INSERT INTO customer_tenants (id, tenant_name, plan_id, billing_status, tenant_status, created_at)
         VALUES (?, ?, ?, 'trial', 'pending', ?)`,
    ).bind(tenantId, input.tenantName, planId, ts).run();

    const workspaceId = `wsp_${randomHex(10)}`;
    await getDb().prepare(
        `INSERT INTO customer_workspaces (id, tenant_id, workspace_name, role_type, runtime_tier, workspace_status, created_at)
         VALUES (?, ?, 'Primary Workspace', 'developer', 'standard', 'pending', ?)`,
    ).bind(workspaceId, tenantId, ts).run();

    const botId = `bot_${randomHex(10)}`;
    await getDb().prepare(
        `INSERT INTO customer_bots (id, workspace_id, bot_name, bot_status, policy_pack_version, created_at)
         VALUES (?, ?, 'Developer Agent', 'created', 'v1', ?)`,
    ).bind(botId, workspaceId, ts).run();

    await getDb().prepare(`UPDATE users SET tenant_id = ? WHERE id = ?`).bind(tenantId, input.userId).run();

    const correlationId = `cor_${randomHex(10)}`;
    const jobId = `prv_${randomHex(8)}`;
    await getDb().prepare(
        `INSERT INTO provisioning_queue
             (id, tenant_id, workspace_id, bot_id, plan_id, runtime_tier, role_type,
              correlation_id, requested_at, requested_by, trigger_source, status,
              failure_reason, remediation_hint, retry_of_job_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'standard', 'developer', ?, ?, ?, 'signup_complete', 'queued',
                 NULL, NULL, NULL, ?, ?)`,
    ).bind(jobId, tenantId, workspaceId, botId, planId, correlationId, ts, input.userId, ts, ts).run();

    await getDb().prepare(`UPDATE customer_workspaces SET workspace_status = 'provisioning' WHERE id = ?`).bind(workspaceId).run();
    await getDb().prepare(`UPDATE customer_tenants SET tenant_status = 'provisioning' WHERE id = ?`).bind(tenantId).run();

    const tenantRow = await getDb().prepare(`SELECT * FROM customer_tenants WHERE id = ?`).bind(tenantId).first<Record<string, unknown>>();
    const workspaceRow = await getDb().prepare(`SELECT * FROM customer_workspaces WHERE id = ?`).bind(workspaceId).first<Record<string, unknown>>();
    const botRow = await getDb().prepare(`SELECT * FROM customer_bots WHERE id = ?`).bind(botId).first<Record<string, unknown>>();

    return {
        tenant: mapCustomerTenant(tenantRow!),
        workspace: mapCustomerWorkspace(workspaceRow!),
        bot: mapCustomerBot(botRow!),
        provisioningJobId: jobId,
        correlationId,
    };
};

export const getProvisioningStatusForUser = async (userId: string): Promise<{
    tenant: CustomerTenantRecord | null;
    workspace: CustomerWorkspaceRecord | null;
    bot: CustomerBotRecord | null;
    provisioningJob: ProvisioningQueueEntry | null;
}> => {
    const userRow = await getDb()
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .bind(userId).first<Record<string, unknown>>();
    const tenantId = userRow?.tenant_id ? String(userRow.tenant_id) : null;

    if (!tenantId) {
        return { tenant: null, workspace: null, bot: null, provisioningJob: null };
    }

    const tenantRow = await getDb()
        .prepare(`SELECT * FROM customer_tenants WHERE id = ?`)
        .bind(tenantId).first<Record<string, unknown>>();
    const tenant = tenantRow ? mapCustomerTenant(tenantRow) : null;

    const workspaceRow = await getDb()
        .prepare(`SELECT * FROM customer_workspaces WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1`)
        .bind(tenantId).first<Record<string, unknown>>();
    const workspace = workspaceRow ? mapCustomerWorkspace(workspaceRow) : null;

    const botRow = workspace
        ? await getDb()
            .prepare(`SELECT * FROM customer_bots WHERE workspace_id = ? ORDER BY created_at ASC LIMIT 1`)
            .bind(workspace.id).first<Record<string, unknown>>()
        : null;
    const bot = botRow ? mapCustomerBot(botRow) : null;

    const jobRow = await getDb()
        .prepare(`SELECT * FROM provisioning_queue WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
        .bind(tenantId).first<Record<string, unknown>>();
    const provisioningJob = jobRow ? mapProvisioningQueueEntry(jobRow) : null;

    return { tenant, workspace, bot, provisioningJob };
};

export const listWorkspaceBotsForUser = async (userId: string): Promise<WorkspaceBotContextRecord[]> => {
    const userRow = await getDb()
        .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
        .bind(userId).first<Record<string, unknown>>();
    const tenantId = userRow?.tenant_id ? String(userRow.tenant_id) : null;

    if (!tenantId) {
        return [];
    }

    const result = await getDb()
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
             INNER JOIN customer_bots b ON b.workspace_id = w.id
             WHERE w.tenant_id = ?
             ORDER BY w.created_at ASC`,
        )
        .bind(tenantId).all<Record<string, unknown>>();

    return result.results.map((row) => ({
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

// ── Admin export ──────────────────────────────────────────────────────────────

const TABLE_NAMES = [
    "users",
    "sessions",
    "approvals",
    "company_audit_events",
    "deployment_jobs",
    "marketplace_selections",
    "customer_tenants",
    "customer_workspaces",
    "customer_bots",
    "provisioning_queue",
    "bots",
    "tenants",
    "tenant_bots",
    "tenant_integrations",
    "tenant_incidents",
    "tenant_logs",
] as const;

export const exportDatabaseSnapshot = async (): Promise<Record<string, Record<string, unknown>[]>> => {
    const snapshot: Record<string, Record<string, unknown>[]> = {};
    for (const table of TABLE_NAMES) {
        const result = await getDb().prepare(`SELECT * FROM "${table}"`).all<Record<string, unknown>>();
        snapshot[table] = result.results;
    }
    return snapshot;
};

export const exportDatabaseAsCsv = async (tableName: string): Promise<string> => {
    if (!TABLE_NAMES.includes(tableName as typeof TABLE_NAMES[number])) {
        throw new Error(`Unknown table: ${tableName}`);
    }
    const result = await getDb().prepare(`SELECT * FROM "${tableName}"`).all<Record<string, unknown>>();
    const rows = result.results;
    if (rows.length === 0) return "";

    const cols = Object.keys(rows[0]!);
    const escape = (s: unknown): string => {
        if (s === null || s === undefined) return "";
        const str = String(s);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const csvLines = [cols.join(","), ...rows.map((row) => cols.map((c) => escape(row[c])).join(","))];
    return csvLines.join("\n");
};

// ── Account deletion (GDPR right-to-erasure) ─────────────────────────────────

export const deleteAccount = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    const user = await getDb()
        .prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL`)
        .bind(userId).first<{ id: string }>();

    if (!user) {
        return { ok: false, error: "user_not_found" };
    }

    const deletedAt = now();
    const anonEmail = `deleted_${userId}@anon.invalid`;
    const anonName = "Deleted User";
    const anonCompany = "deleted";

    await getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();

    await getDb().prepare(
        `UPDATE users
         SET email = ?, name = ?, company = ?, password_hash = ?, deleted_at = ?
         WHERE id = ?`,
    ).bind(anonEmail, anonName, anonCompany, "deleted", deletedAt, userId).run();

    return { ok: true };
};

// ── Provisioning queue simulation helpers ─────────────────────────────────────

export const processProvisioningQueue = async (opts: {
    limit?: number;
    jobIds?: string[];
    tenantIds?: string[];
    failJobIds?: string[];
    actorId?: string;
    actorEmail?: string;
}): Promise<{ processed: number; completed: number; failed: number }> => {
    const db = getDb();
    const { limit = 10, jobIds, tenantIds, failJobIds, actorId, actorEmail } = opts;

    let query = `SELECT id, status, tenant_id FROM provisioning_queue WHERE status IN ('pending','in_progress')`;
    const bindings: (string | number)[] = [];

    if (jobIds?.length) {
        query += ` AND id IN (${jobIds.map(() => "?").join(",")})`;
        bindings.push(...jobIds);
    } else if (tenantIds?.length) {
        query += ` AND tenant_id IN (${tenantIds.map(() => "?").join(",")})`;
        bindings.push(...tenantIds);
    }

    query += ` LIMIT ?`;
    bindings.push(limit);

    const rows = (await db.prepare(query).bind(...bindings).all<{ id: string; status: string; tenant_id: string }>()).results;

    let processed = 0;
    let completed = 0;
    let failed = 0;
    const ts = now();

    for (const row of rows) {
        const shouldFail = failJobIds?.includes(row.id) ?? false;
        const newStatus = shouldFail ? "failed" : "completed";
        await db.prepare(
            `UPDATE provisioning_queue SET status = ?, updated_at = ?, completed_at = ?, actor_id = ?, actor_email = ? WHERE id = ?`,
        ).bind(newStatus, ts, ts, actorId ?? null, actorEmail ?? null, row.id).run();
        processed++;
        if (shouldFail) failed++;
        else completed++;
    }

    return { processed, completed, failed };
};

export const retryProvisioningJob = async (opts: {
    jobId: string;
    requestedBy: string;
    actorId?: string;
    actorEmail?: string;
    expectedTenantId?: string;
}): Promise<
    | { ok: true; job: ProvisioningQueueEntry; reused: boolean; retryAttemptCount: number }
    | { ok: false; error: "not_found" | "retry_limit_exceeded" | "not_retryable"; retryAttemptCount?: number }
> => {
    const db = getDb();
    const row = await db.prepare(
        `SELECT * FROM provisioning_queue WHERE id = ?`,
    ).bind(opts.jobId).first<Record<string, unknown>>();

    if (!row) return { ok: false, error: "not_found" };
    if (opts.expectedTenantId && row.tenant_id !== opts.expectedTenantId) return { ok: false, error: "not_found" };

    const retryAttemptCount = Number(row.retry_attempt_count ?? 0);
    if (retryAttemptCount >= 3) return { ok: false, error: "retry_limit_exceeded", retryAttemptCount };
    if (row.status !== "failed") return { ok: false, error: "not_retryable" };

    const ts = now();
    const newCount = retryAttemptCount + 1;
    await db.prepare(
        `UPDATE provisioning_queue SET status = 'pending', retry_attempt_count = ?, updated_at = ?, actor_id = ?, actor_email = ? WHERE id = ?`,
    ).bind(newCount, ts, opts.actorId ?? null, opts.actorEmail ?? null, opts.jobId).run();

    const updated = await db.prepare(
        `SELECT * FROM provisioning_queue WHERE id = ?`,
    ).bind(opts.jobId).first<Record<string, unknown>>();

    return { ok: true, job: mapProvisioningQueueEntry(updated!), reused: false, retryAttemptCount: newCount };
};

export const autoProcessProvisioningForUser = async (opts: {
    userId: string;
    actorId?: string;
    actorEmail?: string;
}): Promise<{ processed: number; completed: number; failed: number }> => {
    const db = getDb();
    const user = await db.prepare(`SELECT tenant_id FROM users WHERE id = ?`).bind(opts.userId).first<{ tenant_id: string | null }>();
    if (!user?.tenant_id) return { processed: 0, completed: 0, failed: 0 };
    return processProvisioningQueue({
        tenantIds: [user.tenant_id],
        limit: 5,
        actorId: opts.actorId,
        actorEmail: opts.actorEmail,
    });
};

// Re-export unused provisioning helpers to avoid breaking imports
export { PROVISIONING_SUCCESS_STAGES, PROVISIONING_FAILURE_STAGE };
