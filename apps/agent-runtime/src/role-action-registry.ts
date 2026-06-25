/**
 * Phase 2 — Data-driven RBAC: central role-action registry.
 *
 * Aggregates the per-role hard-block lists that already exist across the agent
 * profiles into a single `Record<RoleKey, ReadonlySet<string>>`. This is the
 * single source of truth consumed by `role-enforcer.ts` for ALL roles —
 * replacing the former `roleKey === 'developer'` special-case and the ad-hoc
 * `is<Role>BlockedAction` helpers in `runtime-server.ts`.
 *
 * Two historical conventions are unioned where both exist for a role:
 *   - `*_ROLE_BLOCKED_ACTIONS` (array form, in `*-agent-profile.ts`) — canonical,
 *     covers 11 roles and was the form already partially wired in runtime-server.
 *   - `*_BLOCKED_ACTIONS` (Set form, in `*-role-profile.ts`) — covers 8 roles.
 *
 * A customer `GovernancePolicy(scope=role)` overlay can only TIGHTEN (union extra
 * blocks on top); it can never remove a block defined here.
 */

import type { RoleKey } from '@agentfarm/shared-types';

// Array-form blocklists (`*-agent-profile.ts`)
import { CONTENT_WRITER_ROLE_BLOCKED_ACTIONS } from './agents/content-writer/content-writer-agent-profile.js';
import { CORPORATE_ASSISTANT_ROLE_BLOCKED_ACTIONS } from './agents/corporate-assistant/corporate-assistant-agent-profile.js';
import { DEVELOPER_ROLE_BLOCKED_ACTIONS } from './agents/developer/developer-agent-profile.js';
import { DEVOPS_ROLE_BLOCKED_ACTIONS } from './agents/devops/devops-agent-profile.js';
import { FSD_ROLE_BLOCKED_ACTIONS } from './agents/full-stack-developer/fsd-agent-profile.js';
import { MARKETING_SPECIALIST_ROLE_BLOCKED_ACTIONS } from './agents/marketing-specialist/marketing-specialist-agent-profile.js';
import { MOBILE_ROLE_BLOCKED_ACTIONS } from './agents/mobile/mobile-agent-profile.js';
import { RECRUITER_ROLE_BLOCKED_ACTIONS } from './agents/recruiter/recruiter-agent-profile.js';
import { SALES_REP_ROLE_BLOCKED_ACTIONS } from './agents/sales-agent/sales-rep-agent-profile.js';
import { TECHNICAL_WRITER_ROLE_BLOCKED_ACTIONS } from './agents/technical-writer/technical-writer-agent-profile.js';
import { TESTER_ROLE_BLOCKED_ACTIONS } from './agents/tester/tester-agent-profile.js';

// Set-form blocklists (`*-role-profile.ts`)
import { BUSINESS_ANALYST_BLOCKED_ACTIONS } from './agents/business-analyst/business-analyst-role-profile.js';
import { CONTENT_WRITER_BLOCKED_ACTIONS } from './agents/content-writer/content-writer-role-profile.js';
import { CORPORATE_ASSISTANT_BLOCKED_ACTIONS } from './agents/corporate-assistant/corporate-assistant-role-profile.js';
import { CUSTOMER_SUPPORT_EXECUTIVE_BLOCKED_ACTIONS } from './agents/customer-support-executive/customer-support-executive-role-profile.js';
import { DEVELOPER_BLOCKED_ACTIONS } from './agents/developer/developer-role-profile.js';
import { MARKETING_SPECIALIST_BLOCKED_ACTIONS } from './agents/marketing-specialist/marketing-specialist-role-profile.js';
import { PROJECT_MANAGER_BLOCKED_ACTIONS } from './agents/project-manager/project-manager-role-profile.js';
import { TECHNICAL_WRITER_BLOCKED_ACTIONS } from './agents/technical-writer/technical-writer-role-profile.js';

const EMPTY: ReadonlySet<string> = new Set<string>();

/** Builds a normalized Set from any mix of array / Set / undefined sources. */
function union(...sources: Array<Iterable<string> | undefined>): ReadonlySet<string> {
    const out = new Set<string>();
    for (const source of sources) {
        if (!source) continue;
        for (const action of source) out.add(action);
    }
    return out;
}

/**
 * Per-role hard-block action sets, aggregated from every curated source.
 * Keyed by the canonical `RoleKey` used throughout the runtime.
 */
export const BLOCKED_ACTIONS_BY_ROLE: Record<RoleKey, ReadonlySet<string>> = {
    recruiter: union(RECRUITER_ROLE_BLOCKED_ACTIONS),
    developer: union(DEVELOPER_ROLE_BLOCKED_ACTIONS, DEVELOPER_BLOCKED_ACTIONS),
    fullstack_developer: union(FSD_ROLE_BLOCKED_ACTIONS),
    tester: union(TESTER_ROLE_BLOCKED_ACTIONS),
    business_analyst: union(BUSINESS_ANALYST_BLOCKED_ACTIONS),
    technical_writer: union(TECHNICAL_WRITER_ROLE_BLOCKED_ACTIONS, TECHNICAL_WRITER_BLOCKED_ACTIONS),
    content_writer: union(CONTENT_WRITER_ROLE_BLOCKED_ACTIONS, CONTENT_WRITER_BLOCKED_ACTIONS),
    sales_rep: union(SALES_REP_ROLE_BLOCKED_ACTIONS),
    marketing_specialist: union(
        MARKETING_SPECIALIST_ROLE_BLOCKED_ACTIONS,
        MARKETING_SPECIALIST_BLOCKED_ACTIONS,
    ),
    corporate_assistant: union(
        CORPORATE_ASSISTANT_ROLE_BLOCKED_ACTIONS,
        CORPORATE_ASSISTANT_BLOCKED_ACTIONS,
    ),
    customer_support_executive: union(CUSTOMER_SUPPORT_EXECUTIVE_BLOCKED_ACTIONS),
    project_manager_product_owner_scrum_master: union(PROJECT_MANAGER_BLOCKED_ACTIONS),
    devops_engineer: union(DEVOPS_ROLE_BLOCKED_ACTIONS),
    mobile_engineer: union(MOBILE_ROLE_BLOCKED_ACTIONS),
};

/**
 * Returns the curated hard-block action set for a role.
 * Unknown / unmapped roles resolve to an empty set (never throws).
 */
export function getBlockedActionsForRole(roleKey: RoleKey): ReadonlySet<string> {
    return BLOCKED_ACTIONS_BY_ROLE[roleKey] ?? EMPTY;
}
