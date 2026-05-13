-- AgentFarm D1 initial schema
-- Run with: npx wrangler d1 execute agent-farm-db --file=./migrations/0001_initial.sql --remote

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
    tenant_id TEXT,
    gateway_tenant_id TEXT,
    gateway_workspace_id TEXT,
    gateway_bot_id TEXT,
    gateway_token TEXT,
    deleted_at INTEGER,
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
    assignee_email TEXT NOT NULL DEFAULT '',
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
