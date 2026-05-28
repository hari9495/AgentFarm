// ============================================================================
// MOBILE AGENT PROFILE
// Declares the full set of workspace actions the Mobile agent is allowed to
// execute and the connector integrations it may use.
//
// The Mobile profile is a superset of the developer profile — it inherits all
// developer actions and adds 15 mobile-domain workspace_mob_* actions covering
// iOS (Swift/SwiftUI/Xcode) and Android (Kotlin/Jetpack Compose/Gradle).
//
// Imported by:
//   - role-profiles/index.ts   → ROLE_PROFILES['mobile_engineer'].allowedActions
//   - local-workspace-executor.ts → action dispatch guard
// ============================================================================

import type { LocalWorkspaceActionType } from '../../local-workspace-executor.js';
import { DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS } from '../developer/developer-agent-profile.js';

// ---------------------------------------------------------------------------
// Allowed connectors
// ---------------------------------------------------------------------------

export const MOBILE_ROLE_ALLOWED_CONNECTORS = [
    // Source control
    'github',
    'gitlab',
    'bitbucket',
    'azure_devops',
    // Issue trackers
    'jira',
    'linear',
    'github_issues',
    // Communication
    'slack',
    'microsoft_teams',
    // CI/CD
    'github_actions',
    'gitlab_ci',
    'bitrise',
    'codemagic',
    'fastlane',
    // App stores
    'app_store_connect',  // Apple App Store
    'google_play',        // Google Play Console
    // Mobile-specific services
    'firebase',           // Firebase (Crashlytics, Remote Config, FCM, Analytics)
    'appcenter',          // Microsoft App Center (OTA distribution, crash reporting)
    'testflight',         // Apple TestFlight (beta distribution)
    'browserstack',       // Real device cloud testing
    'saucelabs',          // Cross-platform mobile testing
    // Monitoring & crash reporting
    'sentry',
    'datadog',
    'pagerduty',
    // Push notifications
    'onesignal',
    'braze',
    // Documentation
    'confluence',
    'notion',
] as const;

// ---------------------------------------------------------------------------
// Allowed local workspace actions
// ---------------------------------------------------------------------------

export const MOBILE_ROLE_ALLOWED_LOCAL_ACTIONS: LocalWorkspaceActionType[] = [
    // ── All developer actions (superset) ─────────────────────────────────────
    ...DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS,
    // ── Mobile domain actions (workspace_mob_*) ───────────────────────────────
    // iOS
    'workspace_mob_ios_component',
    'workspace_mob_ios_build',
    'workspace_mob_ios_test',
    // Android
    'workspace_mob_android_component',
    'workspace_mob_android_build',
    'workspace_mob_android_test',
    // Cross-platform
    'workspace_mob_api_client',
    'workspace_mob_push_notify',
    'workspace_mob_deep_link',
    'workspace_mob_auth_implement',
    'workspace_mob_perf_profile',
    'workspace_mob_a11y_audit',
    'workspace_mob_store_upload',
    'workspace_mob_scaffold_project',
    'workspace_mob_standup_report',
    // ── Standup / live meetings (shared) ─────────────────────────────────────
    'workspace_meeting_join',
    'workspace_meeting_speak',
];

// ---------------------------------------------------------------------------
// Blocked actions (hard block — must not run even if requested)
// ---------------------------------------------------------------------------

export const MOBILE_ROLE_BLOCKED_ACTIONS: ReadonlyArray<string> = [
    'deploy_production',       // requires human approval + store review
    'delete_resource',         // irreversible
    'change_permissions',      // security-critical
    'run_shell_command',       // unrestricted shell bypass
    'revoke_signing_cert',     // may break all iOS distribution
] as const;

// ---------------------------------------------------------------------------
// High-risk actions requiring approval before execution
// ---------------------------------------------------------------------------

export const MOBILE_ROLE_HIGH_RISK_ACTIONS: ReadonlyArray<string> = [
    // Store submissions cannot be easily retracted and affect public users
    'workspace_mob_store_upload',
    // Inherited developer high-risk
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
    'workspace_dependency_upgrade_apply',
    'workspace_migration_generate',
    'git_push',
] as const;

// ---------------------------------------------------------------------------
// Role profile aliases (normalised lowercase)
// ---------------------------------------------------------------------------

export const MOBILE_ROLE_PROFILE_ALIASES = new Set([
    'mobile',
    'mobile_engineer',
    'mobile_developer',
    'mobile_dev',
    'ios_developer',
    'ios_engineer',
    'ios',
    'android_developer',
    'android_engineer',
    'android',
    'react_native_developer',
    'flutter_developer',
]);

export const normalizeMobileRoleAlias = (profile: string): string =>
    profile.trim().toLowerCase().replace(/[\s/]+/g, '_');

export const isMobileRoleProfile = (profile: string): boolean =>
    MOBILE_ROLE_PROFILE_ALIASES.has(normalizeMobileRoleAlias(profile));
