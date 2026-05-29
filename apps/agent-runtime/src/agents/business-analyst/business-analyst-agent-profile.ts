// ============================================================================
// BUSINESS ANALYST AGENT PROFILE
// Declares the connector integrations and workspace actions the Business
// Analyst agent is permitted to use.
//
// Enforcement-specific data (blocked actions, approval thresholds, keyword
// signals, suggested-role map) lives in business-analyst-role-profile.ts.
//
// Imported by:
//   - role-profiles/index.ts → ROLE_PROFILES['business_analyst'].allowedActions
// ============================================================================

export {
    BUSINESS_ANALYST_ROLE_ALLOWED_CONNECTORS,
    BUSINESS_ANALYST_ROLE_ALLOWED_LOCAL_ACTIONS,
} from './business-analyst-role-profile.js';
