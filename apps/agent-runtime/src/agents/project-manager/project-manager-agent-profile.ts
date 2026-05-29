// ============================================================================
// PROJECT MANAGER / SCRUM MASTER AGENT PROFILE
// Declares the connector integrations and workspace actions the PM/SM
// dual-persona agent is permitted to use.
//
// Enforcement-specific data (blocked actions, approval thresholds, keyword
// signals, suggested-role map) lives in project-manager-role-profile.ts.
//
// Imported by:
//   - role-profiles/index.ts → ROLE_PROFILES['project_manager_product_owner_scrum_master'].allowedActions
// ============================================================================

export {
    PROJECT_MANAGER_ROLE_ALLOWED_CONNECTORS,
    PROJECT_MANAGER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from './project-manager-role-profile.js';
