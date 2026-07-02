import { createHash, timingSafeEqual } from 'node:crypto';

// ─── Capability categories (tool-agnostic) ────────────────────────────────
export type ConnectorCategory =
  | 'task_tracker'   // Jira, Linear, Asana, Monday, Trello, ClickUp
  | 'messaging'      // Teams, Slack, Discord, Google Chat
  | 'code'           // GitHub, GitLab, Bitbucket, Azure DevOps
  | 'email'          // Outlook (Graph), Gmail, Exchange
  | 'telephony'      // Twilio, Vonage, Amazon Connect, Genesys, Generic
  | 'crm'            // HubSpot, Salesforce
  | 'ats'            // Greenhouse
  | 'cms';           // WordPress

// ─── Supported tool slugs per category ───────────────────────────────────
export type TaskTrackerTool = 'jira' | 'linear' | 'asana' | 'monday' | 'trello' | 'clickup' | 'generic_rest';
export type MessagingTool = 'teams' | 'slack' | 'discord' | 'google_chat' | 'generic_rest_messaging';
export type CodeTool = 'github' | 'gitlab' | 'bitbucket' | 'azure_devops' | 'generic_rest_code';
export type EmailTool = 'outlook' | 'gmail' | 'exchange' | 'generic_smtp' | 'generic_rest_email';
export type TelephonyTool = 'twilio' | 'vonage' | 'amazon_connect' | 'genesys' | 'generic_telephony';
export type CrmTool = 'hubspot' | 'salesforce';
export type AtsTool = 'greenhouse';
export type CmsTool = 'wordpress';
export type ConnectorTool = TaskTrackerTool | MessagingTool | CodeTool | EmailTool | TelephonyTool | CrmTool | AtsTool | CmsTool;

// Legacy alias kept for back-compat with existing gateway code
export type ConnectorId = ConnectorTool;

// ─── Auth methods a connector can use ────────────────────────────────────
export type ConnectorAuthMethod = 'oauth2' | 'api_key' | 'basic' | 'bearer_token' | 'generic_rest';

export type AgentRoleKey =
  | 'recruiter'
  | 'developer'
  | 'fullstack_developer'
  | 'tester'
  | 'business_analyst'
  | 'technical_writer'
  | 'content_writer'
  | 'sales_rep'
  | 'marketing_specialist'
  | 'corporate_assistant'
  | 'customer_support_executive'
  | 'project_manager_product_owner_scrum_master'
  | 'devops_engineer';

// ─── Normalized actions the agent always uses ────────────────────────────
export type NormalizedActionType =
  // task tracker
  | 'get_task'
  | 'create_task'
  | 'update_task_status'
  | 'add_comment'
  | 'assign_task'
  | 'list_tasks'
  // sprint / cycle management (PM role)
  | 'create_sprint'
  | 'update_sprint_status'
  | 'add_issue_to_sprint'
  | 'list_sprints'
  | 'get_sprint_issues'
  // scheduling (PM role)
  | 'register_schedule'
  // messaging
  | 'send_message'
  | 'create_channel'
  | 'mention_user'
  // code
  | 'create_pr'
  | 'add_pr_comment'
  | 'merge_pr'
  | 'list_prs'
  // GitHub Actions / CI/CD (DevOps role)
  | 'trigger_workflow'
  | 'list_workflow_runs'
  | 'get_workflow_run'
  | 'create_release'
  // email
  | 'list_emails'
  | 'read_email'
  | 'send_email'
  | 'reply_email'
  | 'read_thread'
  // telephony
  | 'initiate_call'
  | 'hangup_call'
  | 'transfer_call'
  | 'get_call_status'
  | 'get_call_recording'
  | 'send_dtmf'
  // crm / ats (record = contact / deal / candidate / application …)
  | 'get_record'
  | 'search_records'
  | 'create_record'
  | 'update_record'
  | 'log_activity'
  // cms
  | 'get_content'
  | 'list_content'
  | 'publish_content'
  | 'update_content';

// ─── Connector definition (what the registry stores) ─────────────────────
export interface ConnectorDefinition {
  tool: ConnectorTool;
  category: ConnectorCategory;
  displayName: string;
  logoUrl: string;
  authMethod: ConnectorAuthMethod;
  supportedActions: NormalizedActionType[];
  // Role compatibility for independent role-bot filtering in UI and API.
  allowedRoles?: AgentRoleKey[];
  // Optional defaults used when a role does not explicitly customize actions.
  defaultActionPolicyByRole?: Partial<Record<AgentRoleKey, NormalizedActionType[]>>;
  oauthScopes?: string[];
  docsUrl: string;
  // For generic_rest: customer-configurable fields
  configSchema?: ConnectorConfigField[];
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
}

// ─── Per-tenant connector instance (what customer configures) ─────────────
export type ConnectorStatus = 'connected' | 'disconnected' | 'error' | 'pending_auth';

export interface TenantConnector {
  connectorId: string;          // unique per tenant instance
  tenantId: string;
  workspaceId: string;
  tool: ConnectorTool;
  category: ConnectorCategory;
  displayName: string;          // customer can rename: "Our Jira"
  status: ConnectorStatus;
  authMethod: ConnectorAuthMethod;
  // For OAuth: stored as Key Vault reference
  secretRefId: string | null;
  // For API key / generic REST: base URL + key ref
  baseUrl?: string;
  configValues?: Record<string, string>;
  // Health
  lastHealthcheckAt: string | null;
  lastErrorClass: string | null;
  // Audit
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

// ─── Connector action (what the agent dispatches) ─────────────────────────
export interface ConnectorAction {
  connector: ConnectorTool;
  actionType: NormalizedActionType;
  actorBotId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export const TESTER_ROLE_POLICY = {
  allowedActions: [
    // Core test authoring & analysis
    'workspace_generate_test', 'workspace_run_ci_checks', 'workspace_fix_test_failures',
    'workspace_code_coverage', 'workspace_complexity_metrics', 'workspace_security_scan',
    'workspace_flaky_test_detector', 'workspace_test_coverage_reporter',
    'workspace_diff_preview', 'workspace_audit_export',
    // Browser & CDP actions (Tier 17 / 17b / 17c)
    'workspace_browser_open', 'workspace_app_launch',
    'workspace_web_login', 'workspace_web_navigate', 'workspace_web_read_page',
    'workspace_web_fill_form', 'workspace_web_click', 'workspace_web_extract_data',
    'workspace_lighthouse_audit', 'workspace_console_logs', 'workspace_network_requests',
    'workspace_heap_snapshot', 'workspace_dom_snapshot', 'workspace_web_wait',
    'workspace_web_hover', 'workspace_web_drag', 'workspace_web_type',
    'workspace_web_press_key', 'workspace_web_upload_file', 'workspace_web_handle_dialog',
    'workspace_perf_trace_start', 'workspace_perf_trace_stop', 'workspace_perf_trace_analyze',
    'workspace_web_emulate', 'workspace_web_resize',
    'workspace_tab_new', 'workspace_tab_close', 'workspace_tab_list', 'workspace_tab_select',
    'workspace_network_request_detail', 'workspace_screencast_start', 'workspace_screencast_stop',
    'workspace_extension_list', 'workspace_extension_install', 'workspace_extension_trigger',
    // Testing tool integrations (Tier 20)
    'workspace_selenium_test_run', 'workspace_cypress_test_run', 'workspace_appium_test_run',
    'workspace_playwright_test_run', 'workspace_load_test_run', 'workspace_load_test_report',
    'workspace_load_test_regression', 'workspace_api_test_run', 'workspace_api_test_report',
    'workspace_dast_scan', 'workspace_security_test_report',
    'workspace_test_case_sync', 'workspace_test_run_publish', 'workspace_visual_regression',
    // Accessibility & mutation testing (Tier 21 / 22)
    'workspace_axe_scan', 'workspace_create_bug', 'workspace_mutation_test', 'workspace_contract_test',
    // Test data & mobile (Tier 23)
    'workspace_generate_test_data', 'workspace_mobile_test',
    // Sub-agent spawn (mobile_engineer delegation)
    'workspace_subagent_spawn',
    // Connector actions
    'create_task', 'add_comment', 'send_message',
  ],
  highRiskActions: [
    'workspace_autonomous_plan_execute',
    'workspace_github_issue_fix',
  ],
  blockedActions: [
    'merge_pr',
    'deploy_production',
    'delete_resource',
    'run_shell_command',
    'change_permissions',
  ],
  defaultConnectors: ['github', 'jira', 'slack'],
} as const;

const ALL_ROLE_KEYS: AgentRoleKey[] = [
  'recruiter',
  'developer',
  'fullstack_developer',
  'tester',
  'business_analyst',
  'technical_writer',
  'content_writer',
  'sales_rep',
  'marketing_specialist',
  'corporate_assistant',
  'customer_support_executive',
  'project_manager_product_owner_scrum_master',
  'devops_engineer',
];

const TASK_ORIENTED_ROLE_KEYS: AgentRoleKey[] = [
  'developer',
  'fullstack_developer',
  'tester',
  'business_analyst',
  'project_manager_product_owner_scrum_master',
  'devops_engineer',
];

const CODE_ORIENTED_ROLE_KEYS: AgentRoleKey[] = [
  'developer',
  'fullstack_developer',
  'tester',
  'technical_writer',
  'project_manager_product_owner_scrum_master',
  'devops_engineer',
];

// ─── Built-in connector registry ──────────────────────────────────────────
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  // ── Task Trackers ─────────────────────────────────────────────────────
  {
    tool: 'jira',
    category: 'task_tracker',
    displayName: 'Jira',
    logoUrl: '/icons/connectors/jira.svg',
    authMethod: 'oauth2',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    defaultActionPolicyByRole: {
      tester: ['get_task', 'list_tasks', 'add_comment', 'update_task_status', 'create_task'],
    },
    oauthScopes: ['read:jira-work', 'write:jira-work', 'read:jira-user'],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task', 'list_tasks', 'create_sprint', 'update_sprint_status', 'add_issue_to_sprint', 'list_sprints'],
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/',
  },
  {
    tool: 'linear',
    category: 'task_tracker',
    displayName: 'Linear',
    logoUrl: '/icons/connectors/linear.svg',
    authMethod: 'oauth2',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    oauthScopes: ['read', 'write'],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task', 'list_tasks', 'create_sprint', 'update_sprint_status', 'add_issue_to_sprint', 'list_sprints'],
    docsUrl: 'https://developers.linear.app/docs/oauth/authentication',
  },
  {
    tool: 'asana',
    category: 'task_tracker',
    displayName: 'Asana',
    logoUrl: '/icons/connectors/asana.svg',
    authMethod: 'oauth2',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    oauthScopes: ['default'],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task', 'list_tasks'],
    docsUrl: 'https://developers.asana.com/docs/oauth',
  },
  {
    tool: 'monday',
    category: 'task_tracker',
    displayName: 'Monday.com',
    logoUrl: '/icons/connectors/monday.svg',
    authMethod: 'oauth2',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    oauthScopes: ['me:read', 'boards:read', 'boards:write'],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment'],
    docsUrl: 'https://developer.monday.com/apps/docs/oauth',
  },
  {
    tool: 'trello',
    category: 'task_tracker',
    displayName: 'Trello',
    logoUrl: '/icons/connectors/trello.svg',
    authMethod: 'api_key',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment'],
    configSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your Trello API key' },
      { key: 'token', label: 'Token', type: 'password', required: true, placeholder: 'Your Trello token' },
    ],
    docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/',
  },
  {
    tool: 'clickup',
    category: 'task_tracker',
    displayName: 'ClickUp',
    logoUrl: '/icons/connectors/clickup.svg',
    authMethod: 'oauth2',
    allowedRoles: TASK_ORIENTED_ROLE_KEYS,
    oauthScopes: ['task:write', 'task:read'],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task'],
    docsUrl: 'https://clickup.com/api/clickupreference/authentication/',
  },
  // ── Messaging ────────────────────────────────────────────────────────
  {
    tool: 'teams',
    category: 'messaging',
    displayName: 'Microsoft Teams',
    logoUrl: '/icons/connectors/teams.svg',
    authMethod: 'oauth2',
    allowedRoles: ALL_ROLE_KEYS,
    oauthScopes: ['ChannelMessage.Send', 'Chat.ReadWrite', 'User.Read'],
    supportedActions: ['send_message', 'create_channel', 'mention_user'],
    docsUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/authentication/authentication',
  },
  {
    tool: 'slack',
    category: 'messaging',
    displayName: 'Slack',
    logoUrl: '/icons/connectors/slack.svg',
    authMethod: 'oauth2',
    allowedRoles: ALL_ROLE_KEYS,
    oauthScopes: ['chat:write', 'channels:read', 'users:read'],
    supportedActions: ['send_message', 'create_channel', 'mention_user'],
    docsUrl: 'https://api.slack.com/authentication/oauth-v2',
  },
  // ── Code ─────────────────────────────────────────────────────────────
  {
    tool: 'github',
    category: 'code',
    displayName: 'GitHub',
    logoUrl: '/icons/connectors/github.svg',
    authMethod: 'oauth2',
    allowedRoles: CODE_ORIENTED_ROLE_KEYS,
    defaultActionPolicyByRole: {
      project_manager_product_owner_scrum_master: ['list_prs', 'add_pr_comment'],
      tester: ['list_prs', 'add_pr_comment', 'create_pr'],
      devops_engineer: ['create_pr', 'add_pr_comment', 'merge_pr', 'list_prs', 'trigger_workflow', 'list_workflow_runs', 'get_workflow_run', 'create_release'],
    },
    oauthScopes: ['repo', 'pull_requests', 'read:user', 'workflow'],
    supportedActions: ['create_pr', 'add_pr_comment', 'merge_pr', 'list_prs', 'trigger_workflow', 'list_workflow_runs', 'get_workflow_run', 'create_release'],
    docsUrl: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps',
  },
  {
    tool: 'gitlab',
    category: 'code',
    displayName: 'GitLab',
    logoUrl: '/icons/connectors/gitlab.svg',
    authMethod: 'bearer_token',
    allowedRoles: CODE_ORIENTED_ROLE_KEYS,
    oauthScopes: ['api', 'read_user', 'read_repository'],
    supportedActions: ['create_pr', 'add_pr_comment', 'list_prs', 'merge_pr', 'get_task', 'create_task', 'list_tasks', 'add_comment'],
    docsUrl: 'https://docs.gitlab.com/ee/api/oauth2.html',
  },
  {
    tool: 'azure_devops',
    category: 'code',
    displayName: 'Azure DevOps',
    logoUrl: '/icons/connectors/azure-devops.svg',
    authMethod: 'oauth2',
    allowedRoles: CODE_ORIENTED_ROLE_KEYS,
    defaultActionPolicyByRole: {
      tester: ['add_pr_comment', 'list_prs', 'create_task', 'update_task_status'],
    },
    oauthScopes: ['vso.code', 'vso.work_write'],
    supportedActions: ['create_pr', 'add_pr_comment', 'merge_pr', 'list_prs', 'create_task', 'update_task_status'],
    docsUrl: 'https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth',
  },
  // ── Email ─────────────────────────────────────────────────────────────
  {
    tool: 'outlook',
    category: 'email',
    displayName: 'Outlook / Microsoft 365',
    logoUrl: '/icons/connectors/outlook.svg',
    authMethod: 'oauth2',
    allowedRoles: ALL_ROLE_KEYS,
    oauthScopes: ['Mail.Send', 'Mail.Read', 'User.Read'],
    supportedActions: ['list_emails', 'read_email', 'send_email', 'reply_email', 'read_thread'],
    docsUrl: 'https://learn.microsoft.com/en-us/graph/auth/auth-concepts',
  },
  {
    tool: 'gmail',
    category: 'email',
    displayName: 'Gmail',
    logoUrl: '/icons/connectors/gmail.svg',
    authMethod: 'oauth2',
    allowedRoles: ALL_ROLE_KEYS,
    oauthScopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    supportedActions: ['list_emails', 'read_email', 'send_email', 'reply_email', 'read_thread'],
    docsUrl: 'https://developers.google.com/gmail/api/auth/oauth-and-service-accounts',
  },
  // ── CRM ──────────────────────────────────────────────────────────────
  {
    tool: 'hubspot',
    category: 'crm',
    displayName: 'HubSpot',
    logoUrl: '/icons/connectors/hubspot.svg',
    authMethod: 'bearer_token',
    allowedRoles: ['sales_rep', 'marketing_specialist', 'customer_support_executive', 'business_analyst'],
    supportedActions: ['get_record', 'search_records', 'create_record', 'update_record', 'log_activity'],
    docsUrl: 'https://developers.hubspot.com/docs/api/private-apps',
  },
  {
    tool: 'salesforce',
    category: 'crm',
    displayName: 'Salesforce',
    logoUrl: '/icons/connectors/salesforce.svg',
    authMethod: 'oauth2',
    allowedRoles: ['sales_rep', 'marketing_specialist', 'customer_support_executive', 'business_analyst'],
    oauthScopes: ['api', 'refresh_token'],
    supportedActions: ['get_record', 'search_records', 'create_record', 'update_record', 'log_activity'],
    docsUrl: 'https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/',
  },
  // ── ATS ──────────────────────────────────────────────────────────────
  {
    tool: 'greenhouse',
    category: 'ats',
    displayName: 'Greenhouse',
    logoUrl: '/icons/connectors/greenhouse.svg',
    authMethod: 'api_key',
    allowedRoles: ['recruiter'],
    supportedActions: ['get_record', 'search_records', 'create_record', 'update_record', 'log_activity'],
    docsUrl: 'https://developers.greenhouse.io/harvest.html',
  },
  // ── CMS ──────────────────────────────────────────────────────────────
  {
    tool: 'wordpress',
    category: 'cms',
    displayName: 'WordPress',
    logoUrl: '/icons/connectors/wordpress.svg',
    authMethod: 'basic',
    allowedRoles: ['content_writer', 'marketing_specialist', 'technical_writer'],
    supportedActions: ['get_content', 'list_content', 'publish_content', 'update_content'],
    docsUrl: 'https://developer.wordpress.org/rest-api/reference/posts/',
  },
  // ── Generic REST (bring your own tool) ──────────────────────────────
  {
    tool: 'generic_rest',
    category: 'task_tracker',
    displayName: 'Custom REST API (Tasks)',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'generic_rest',
    allowedRoles: [
      'developer',
      'fullstack_developer',
      'tester',
      'business_analyst',
      'project_manager_product_owner_scrum_master',
      'recruiter',
      'customer_support_executive',
    ],
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment'],
    configSchema: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.yourapp.com/v1' },
      { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [{ value: 'bearer', label: 'Bearer Token' }, { value: 'apikey', label: 'API Key Header' }, { value: 'basic', label: 'Basic Auth' }] },
      { key: 'authValue', label: 'Token / API Key', type: 'password', required: true, placeholder: 'Your auth value' },
      { key: 'headerName', label: 'Header Name', type: 'text', required: false, placeholder: 'X-API-Key (if API Key type)' },
    ],
    docsUrl: '',
  },
  {
    tool: 'generic_rest_messaging',
    category: 'messaging',
    displayName: 'Custom REST API (Messaging)',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'generic_rest',
    allowedRoles: ALL_ROLE_KEYS,
    supportedActions: ['send_message', 'create_channel', 'mention_user'],
    configSchema: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.yourapp.com/v1' },
      { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [{ value: 'bearer', label: 'Bearer Token' }, { value: 'apikey', label: 'API Key Header' }, { value: 'basic', label: 'Basic Auth' }] },
      { key: 'authValue', label: 'Token / API Key', type: 'password', required: true, placeholder: 'Your auth value' },
      { key: 'headerName', label: 'Header Name', type: 'text', required: false, placeholder: 'X-API-Key (if API Key type)' },
    ],
    docsUrl: '',
  },
  {
    tool: 'generic_rest_code',
    category: 'code',
    displayName: 'Custom REST API (Code)',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'generic_rest',
    allowedRoles: CODE_ORIENTED_ROLE_KEYS,
    supportedActions: ['create_pr', 'add_pr_comment', 'merge_pr', 'list_prs'],
    configSchema: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.yourapp.com/v1' },
      { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [{ value: 'bearer', label: 'Bearer Token' }, { value: 'apikey', label: 'API Key Header' }, { value: 'basic', label: 'Basic Auth' }] },
      { key: 'authValue', label: 'Token / API Key', type: 'password', required: true, placeholder: 'Your auth value' },
      { key: 'headerName', label: 'Header Name', type: 'text', required: false, placeholder: 'X-API-Key (if API Key type)' },
    ],
    docsUrl: '',
  },
  {
    tool: 'generic_rest_email',
    category: 'email',
    displayName: 'Custom REST API (Email)',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'generic_rest',
    allowedRoles: ALL_ROLE_KEYS,
    supportedActions: ['list_emails', 'read_email', 'send_email', 'reply_email', 'read_thread'],
    configSchema: [
      { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.yourapp.com/v1' },
      { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [{ value: 'bearer', label: 'Bearer Token' }, { value: 'apikey', label: 'API Key Header' }, { value: 'basic', label: 'Basic Auth' }] },
      { key: 'authValue', label: 'Token / API Key', type: 'password', required: true, placeholder: 'Your auth value' },
      { key: 'headerName', label: 'Header Name', type: 'text', required: false, placeholder: 'X-API-Key (if API Key type)' },
      { key: 'listEmailsPath', label: 'List Emails Path', type: 'text', required: true, placeholder: '/emails', hint: 'Endpoint that returns a list of emails.' },
      { key: 'readEmailPath', label: 'Read Email Path', type: 'text', required: true, placeholder: '/emails/{id}', hint: 'Endpoint to read one email by id.' },
      { key: 'readThreadPath', label: 'Read Thread Path', type: 'text', required: true, placeholder: '/threads/{threadId}', hint: 'Endpoint to read full thread history.' },
      { key: 'sendEmailPath', label: 'Send Email Path', type: 'text', required: true, placeholder: '/emails/send', hint: 'Endpoint used to send a new email.' },
      { key: 'replyEmailPath', label: 'Reply Email Path', type: 'text', required: true, placeholder: '/emails/{id}/reply', hint: 'Endpoint used to reply to an email.' },
    ],
    docsUrl: '',
  },
  {
    tool: 'generic_smtp',
    category: 'email',
    displayName: 'Custom SMTP',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'basic',
    allowedRoles: ALL_ROLE_KEYS,
    supportedActions: ['send_email', 'reply_email'],
    configSchema: [
      { key: 'smtpHost', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.yourcompany.com' },
      { key: 'smtpPort', label: 'SMTP Port', type: 'text', required: true, placeholder: '587' },
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'bot@yourcompany.com' },
      { key: 'password', label: 'Password', type: 'password', required: true, placeholder: 'SMTP password' },
      { key: 'fromAddress', label: 'From Address', type: 'text', required: true, placeholder: 'bot@yourcompany.com' },
      { key: 'useTls', label: 'Use TLS', type: 'select', required: true, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
    ],
    docsUrl: '',
  },
  // ── Telephony ─────────────────────────────────────────────────────────
  {
    tool: 'twilio',
    category: 'telephony',
    displayName: 'Twilio Voice',
    logoUrl: '/icons/connectors/twilio.svg',
    authMethod: 'basic',
    allowedRoles: ['customer_support_executive'],
    supportedActions: ['initiate_call', 'hangup_call', 'transfer_call', 'get_call_status', 'get_call_recording', 'send_dtmf'],
    configSchema: [
      { key: 'accountSid', label: 'Account SID', type: 'text', required: true, placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'Auth Token', type: 'password', required: true, placeholder: 'Your Twilio auth token' },
      { key: 'fromNumber', label: 'From Phone Number', type: 'text', required: true, placeholder: '+1234567890', hint: 'Twilio number to use as caller ID for outbound calls.' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password', required: false, placeholder: 'Twilio webhook signing secret', hint: 'Used to verify Twilio webhook authenticity. Found in your Twilio console.' },
    ],
    docsUrl: 'https://www.twilio.com/docs/voice/api',
  },
  {
    tool: 'vonage',
    category: 'telephony',
    displayName: 'Vonage Voice (Nexmo)',
    logoUrl: '/icons/connectors/vonage.svg',
    authMethod: 'api_key',
    allowedRoles: ['customer_support_executive'],
    supportedActions: ['initiate_call', 'hangup_call', 'transfer_call', 'get_call_status', 'get_call_recording', 'send_dtmf'],
    configSchema: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true, placeholder: 'Your Vonage API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true, placeholder: 'Your Vonage API secret' },
      { key: 'applicationId', label: 'Application ID', type: 'text', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Vonage Voice Application ID.' },
      { key: 'privateKey', label: 'Private Key (PEM)', type: 'password', required: true, placeholder: '-----BEGIN PRIVATE KEY-----\n...', hint: 'Private key for JWT signing. Download from Vonage dashboard.' },
      { key: 'fromNumber', label: 'From Phone Number', type: 'text', required: true, placeholder: '+1234567890' },
    ],
    docsUrl: 'https://developer.vonage.com/en/voice/voice-api/overview',
  },
  {
    tool: 'amazon_connect',
    category: 'telephony',
    displayName: 'Amazon Connect',
    logoUrl: '/icons/connectors/amazon-connect.svg',
    authMethod: 'api_key',
    allowedRoles: ['customer_support_executive'],
    supportedActions: ['initiate_call', 'hangup_call', 'transfer_call', 'get_call_status', 'get_call_recording'],
    configSchema: [
      { key: 'instanceId', label: 'Instance ID', type: 'text', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'region', label: 'AWS Region', type: 'text', required: true, placeholder: 'us-east-1' },
      { key: 'accessKeyId', label: 'AWS Access Key ID', type: 'text', required: true, placeholder: 'AKIAIOSFODNN7EXAMPLE' },
      { key: 'secretAccessKey', label: 'AWS Secret Access Key', type: 'password', required: true, placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
      { key: 'contactFlowId', label: 'Contact Flow ID', type: 'text', required: false, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Default contact flow for outbound calls.' },
    ],
    docsUrl: 'https://docs.aws.amazon.com/connect/latest/APIReference/',
  },
  {
    tool: 'genesys',
    category: 'telephony',
    displayName: 'Genesys Cloud',
    logoUrl: '/icons/connectors/genesys.svg',
    authMethod: 'oauth2',
    allowedRoles: ['customer_support_executive'],
    supportedActions: ['initiate_call', 'hangup_call', 'transfer_call', 'get_call_status', 'get_call_recording'],
    configSchema: [
      { key: 'clientId', label: 'OAuth Client ID', type: 'text', required: true, placeholder: 'Your Genesys OAuth client ID' },
      { key: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true, placeholder: 'Your Genesys OAuth client secret' },
      { key: 'region', label: 'Genesys Region', type: 'select', required: true, options: [{ value: 'mypurecloud.com', label: 'US East' }, { value: 'usw2.pure.cloud', label: 'US West' }, { value: 'euw2.pure.cloud', label: 'EU (London)' }, { value: 'aps1.pure.cloud', label: 'Asia Pacific' }, { value: 'apne1.pure.cloud', label: 'Asia Pacific (Tokyo)' }, { value: 'ind.pure.cloud', label: 'India' }] },
      { key: 'queueId', label: 'Default Queue ID', type: 'text', required: false, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Queue for inbound call routing.' },
    ],
    docsUrl: 'https://developer.genesys.cloud/api/rest/',
  },
  {
    tool: 'generic_telephony',
    category: 'telephony',
    displayName: 'Custom Telephony API',
    logoUrl: '/icons/connectors/generic.svg',
    authMethod: 'generic_rest',
    allowedRoles: ['customer_support_executive'],
    supportedActions: ['initiate_call', 'hangup_call', 'transfer_call', 'get_call_status', 'get_call_recording', 'send_dtmf'],
    configSchema: [
      { key: 'baseUrl', label: 'API Base URL', type: 'url', required: true, placeholder: 'https://api.yourtelephony.com/v1', hint: 'The root URL of your telephony provider REST API.' },
      { key: 'providerFormat', label: 'Provider Format', type: 'select', required: true, options: [{ value: 'twilio', label: 'Twilio-compatible' }, { value: 'vonage', label: 'Vonage-compatible (NCCO)' }, { value: 'amazon_connect', label: 'Amazon Connect-compatible' }, { value: 'generic', label: 'Generic JSON' }], hint: 'Controls how webhooks are parsed and responses are formatted.' },
      { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [{ value: 'basic', label: 'Basic Auth (username:password)' }, { value: 'bearer', label: 'Bearer Token' }, { value: 'api_key', label: 'API Key Header' }, { value: 'hmac', label: 'HMAC Signature' }] },
      { key: 'authValue', label: 'Token / API Key / Password', type: 'password', required: true, placeholder: 'Your authentication value' },
      { key: 'authHeaderName', label: 'Auth Header Name', type: 'text', required: false, placeholder: 'X-API-Key', hint: 'Required when Auth Type is "API Key Header".' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password', required: false, placeholder: 'Secret for verifying inbound webhook signatures', hint: 'Used for HMAC validation of inbound call events from your provider.' },
      { key: 'inboundRecordingPath', label: 'Recording Fetch Path', type: 'text', required: false, placeholder: '/calls/{callId}/recording', hint: 'Path to download the call recording. Use {callId} as a placeholder.' },
      { key: 'outboundCallPath', label: 'Outbound Call Path', type: 'text', required: false, placeholder: '/calls', hint: 'Path to initiate an outbound call (POST).' },
      { key: 'hangupPath', label: 'Hangup Path', type: 'text', required: false, placeholder: '/calls/{callId}', hint: 'Path to end an active call (DELETE or POST). Use {callId} as placeholder.' },
      { key: 'fromNumber', label: 'From Phone Number', type: 'text', required: false, placeholder: '+1234567890', hint: 'Caller ID for outbound calls.' },
    ],
    docsUrl: '',
  },
];

// ─── Agent role metadata (display names, groups, feature highlights) ─────────

export type AgentGroup = 'engineering' | 'business' | 'content' | 'marketing' | 'people' | 'support';

export interface AgentRoleMeta {
  displayName: string;
  tagline: string;
  group: AgentGroup;
  /** 4-5 bullet-point capability highlights shown in the dashboard capabilities section */
  featureHighlights: string[];
}

export const AGENT_ROLE_META: Record<AgentRoleKey, AgentRoleMeta> = {
  developer: {
    displayName: 'Developer',
    tagline: 'Code, debug, and ship features autonomously',
    group: 'engineering',
    featureHighlights: [
      'Read, edit, and refactor files across any codebase',
      'Generate and fix failing tests end-to-end',
      'Create pull requests, run CI checks, and manage git',
      'Security scanning and vulnerability suggestions',
      'Deep debug, architecture research, and pair-mode',
    ],
  },
  fullstack_developer: {
    displayName: 'Full-Stack Developer',
    tagline: 'End-to-end web development — frontend to API',
    group: 'engineering',
    featureHighlights: [
      'React / Next.js UI implementation and styling',
      'API design and backend service integration',
      'UX analytics, design scoring, and A11y audits',
      'Cross-repo coordination and feature-flag wiring',
      'Performance profiling and bundle analysis',
    ],
  },
  tester: {
    displayName: 'QA Tester',
    tagline: 'Automated test generation, execution, and reporting',
    group: 'engineering',
    featureHighlights: [
      'Unit, integration, and E2E test generation',
      'Flaky test detection and coverage reporting',
      'Browser automation — Selenium, Playwright, Cypress',
      'Load testing with k6, JMeter, and Artillery',
      'Security scanning via OWASP ZAP and Burp Suite',
    ],
  },
  devops_engineer: {
    displayName: 'DevOps Engineer',
    tagline: 'Infrastructure, CI/CD pipelines, and incident response',
    group: 'engineering',
    featureHighlights: [
      'Terraform plan, validate, and apply (with approval gate)',
      'Kubernetes deploy, rollback, and pod management',
      'Helm chart generation, diff, and upgrade',
      'Incident triage, log analysis, and DORA metrics',
      'Secret rotation, cert renewal, and cost estimation',
    ],
  },
  business_analyst: {
    displayName: 'Business Analyst',
    tagline: 'Requirements, process modelling, and stakeholder reporting',
    group: 'business',
    featureHighlights: [
      'Requirements gathering and BRD / FRD authoring',
      'Process flow and swimlane diagram generation',
      'Gap analysis and feasibility assessments',
      'Backlog grooming from business inputs',
      'Executive summaries and stakeholder reports',
    ],
  },
  project_manager_product_owner_scrum_master: {
    displayName: 'Project Manager',
    tagline: 'Sprint planning, backlog management, and delivery tracking',
    group: 'business',
    featureHighlights: [
      'Sprint creation, planning, and retrospectives',
      'Backlog grooming and priority scoring',
      'Risk register and dependency tracking',
      'RAG status and stakeholder update emails',
      'Daily standup summaries and blocker tracking',
    ],
  },
  technical_writer: {
    displayName: 'Technical Writer',
    tagline: 'API docs, changelogs, and developer guides',
    group: 'content',
    featureHighlights: [
      'OpenAPI / Swagger documentation generation',
      'Changelog and release notes from git history',
      'README and onboarding guide authoring',
      'Architecture decision records (ADRs)',
      'Runbook and incident playbook creation',
    ],
  },
  content_writer: {
    displayName: 'Content Writer',
    tagline: 'Blog posts, landing pages, and SEO copy',
    group: 'content',
    featureHighlights: [
      'Long-form blog and article writing',
      'SEO keyword optimisation and meta tags',
      'Landing page and CTA copy',
      'Social media posts and caption drafting',
      'Newsletter and drip email sequences',
    ],
  },
  marketing_specialist: {
    displayName: 'Marketing Specialist',
    tagline: 'Campaigns, growth analytics, and brand strategy',
    group: 'marketing',
    featureHighlights: [
      'Campaign planning and creative briefing',
      'Competitor and market analysis reports',
      'Ad copy and A/B variant generation',
      'UTM tracking and attribution analysis',
      'ROI and funnel reporting',
    ],
  },
  sales_rep: {
    displayName: 'Sales Representative',
    tagline: 'Lead qualification, outreach, and deal tracking',
    group: 'marketing',
    featureHighlights: [
      'Prospect research and ICP scoring',
      'Personalised outbound email sequences',
      'CRM record updates and pipeline tracking',
      'Meeting scheduling and follow-up automation',
      'Win/loss analysis and proposal drafting',
    ],
  },
  recruiter: {
    displayName: 'Recruiter',
    tagline: 'Job postings, candidate screening, and interview scheduling',
    group: 'people',
    featureHighlights: [
      'Job description authoring and JD scoring',
      'CV parsing and candidate shortlisting',
      'Interview question generation per role',
      'Offer letter and rejection email drafting',
      'ATS integration and pipeline tracking',
    ],
  },
  corporate_assistant: {
    displayName: 'Corporate Assistant',
    tagline: 'Calendar, email management, and internal workflows',
    group: 'people',
    featureHighlights: [
      'Meeting scheduling and calendar management',
      'Email drafting, triage, and follow-up',
      'Document preparation and summarisation',
      'Internal announcement authoring',
      'Task delegation and reminder management',
    ],
  },
  customer_support_executive: {
    displayName: 'Customer Support Executive',
    tagline: 'Multi-channel support, voice care, and KPI reporting',
    group: 'support',
    featureHighlights: [
      'Ticket management across Zendesk, Freshdesk, and ServiceNow',
      'Voice support via Sarvam AI (10 Indian languages) + Deepgram fallback',
      'Telephony: Twilio, Vonage, Amazon Connect, or any custom provider',
      'Refund processing, escalation routing, and SLA enforcement',
      'CSAT / NPS surveys and KPI dashboards (FCR, AHT)',
    ],
  },
};

export const AGENT_GROUP_LABELS: Record<AgentGroup, string> = {
  engineering: 'Engineering',
  business: 'Business & Operations',
  content: 'Content & Documentation',
  marketing: 'Marketing & Sales',
  people: 'People & Administration',
  support: 'Customer Support',
};

export function getConnectorDefinition(tool: ConnectorTool): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.tool === tool);
}

export function getConnectorsByCategory(category: ConnectorCategory): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY.filter((c) => c.category === category);
}

export function isRoleAllowedForConnector(tool: ConnectorTool, role: AgentRoleKey): boolean {
  const connector = getConnectorDefinition(tool);
  if (!connector) {
    return false;
  }

  if (!connector.allowedRoles || connector.allowedRoles.length === 0) {
    return true;
  }

  return connector.allowedRoles.includes(role);
}

export function getConnectorActionsForRole(tool: ConnectorTool, role: AgentRoleKey): NormalizedActionType[] {
  const connector = getConnectorDefinition(tool);
  if (!connector) {
    return [];
  }

  if (!isRoleAllowedForConnector(tool, role)) {
    return [];
  }

  const roleDefaults = connector.defaultActionPolicyByRole?.[role];
  return roleDefaults ? [...roleDefaults] : [...connector.supportedActions];
}

// ── External plugin manifest contracts (Phase 3 C2) ─────────────────────
export type PluginSignatureAlgorithm = 'sha256' | 'sha512';

export interface ExternalPluginManifestContract {
  plugin_key: string;
  plugin_name: string;
  version: string;
  provider: string;
  capabilities: string[];
  supported_adapter_types: ConnectorCategory[];
  artifact_url: string;
  signature: string;
  signature_algorithm: PluginSignatureAlgorithm;
  provenance: {
    publisher: string;
    source_repo?: string;
    source_commit?: string;
  };
}

export type TrustedPublisherRule = {
  publisher: string;
  sourceRepoPrefix?: string;
};

export const isValidPluginManifest = (manifest: unknown): manifest is ExternalPluginManifestContract => {
  if (typeof manifest !== 'object' || manifest === null) return false;
  const row = manifest as Record<string, unknown>;

  if (typeof row.plugin_key !== 'string' || row.plugin_key.length === 0) return false;
  if (typeof row.plugin_name !== 'string' || row.plugin_name.length === 0) return false;
  if (typeof row.version !== 'string' || row.version.length === 0) return false;
  if (typeof row.provider !== 'string' || row.provider.length === 0) return false;
  if (!Array.isArray(row.capabilities) || row.capabilities.some((item) => typeof item !== 'string')) return false;
  if (!Array.isArray(row.supported_adapter_types) || row.supported_adapter_types.some((item) => typeof item !== 'string')) return false;
  if (typeof row.artifact_url !== 'string' || row.artifact_url.length === 0) return false;
  if (typeof row.signature !== 'string' || row.signature.length < 16) return false;
  if (row.signature_algorithm !== 'sha256' && row.signature_algorithm !== 'sha512') return false;

  if (typeof row.provenance !== 'object' || row.provenance === null) return false;
  const provenance = row.provenance as Record<string, unknown>;
  if (typeof provenance.publisher !== 'string' || provenance.publisher.length === 0) return false;

  return true;
};

export const isTrustedPluginPublisher = (
  manifest: ExternalPluginManifestContract,
  trustedRules: TrustedPublisherRule[],
): boolean => {
  for (const rule of trustedRules) {
    if (manifest.provenance.publisher !== rule.publisher) continue;
    if (!rule.sourceRepoPrefix) return true;
    const sourceRepo = manifest.provenance.source_repo ?? '';
    if (sourceRepo.startsWith(rule.sourceRepoPrefix)) {
      return true;
    }
  }
  return false;
};

const getDigestHexLength = (algorithm: PluginSignatureAlgorithm): number => {
  return algorithm === 'sha256' ? 64 : 128;
};

const normalizeManifestSignature = (
  signature: string,
  algorithm: PluginSignatureAlgorithm,
): string | null => {
  const normalized = signature.trim().toLowerCase();
  const prefixed = `${algorithm}:`;
  const withoutPrefix = normalized.startsWith(prefixed)
    ? normalized.slice(prefixed.length)
    : normalized;

  if (!/^[a-f0-9]+$/.test(withoutPrefix)) {
    return null;
  }

  if (withoutPrefix.length !== getDigestHexLength(algorithm)) {
    return null;
  }

  return withoutPrefix;
};

export const getPluginManifestSigningPayload = (
  manifest: ExternalPluginManifestContract,
): string => {
  return JSON.stringify({
    plugin_key: manifest.plugin_key,
    plugin_name: manifest.plugin_name,
    version: manifest.version,
    provider: manifest.provider,
    capabilities: manifest.capabilities,
    supported_adapter_types: manifest.supported_adapter_types,
    artifact_url: manifest.artifact_url,
    provenance: {
      publisher: manifest.provenance.publisher,
      source_repo: manifest.provenance.source_repo ?? null,
      source_commit: manifest.provenance.source_commit ?? null,
    },
  });
};

export const computePluginManifestSignature = (
  manifest: ExternalPluginManifestContract,
): string => {
  return createHash(manifest.signature_algorithm)
    .update(getPluginManifestSigningPayload(manifest), 'utf8')
    .digest('hex');
};

export const verifyPluginManifestSignature = (
  manifest: ExternalPluginManifestContract,
): boolean => {
  const normalizedSignature = normalizeManifestSignature(
    manifest.signature,
    manifest.signature_algorithm,
  );
  if (!normalizedSignature) {
    return false;
  }

  const expected = computePluginManifestSignature(manifest);
  return timingSafeEqual(
    Buffer.from(normalizedSignature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
};

