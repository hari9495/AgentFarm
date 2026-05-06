import { createHash, timingSafeEqual } from 'node:crypto';

// ─── Capability categories (tool-agnostic) ────────────────────────────────
export type ConnectorCategory =
  | 'task_tracker'   // Jira, Linear, Asana, Monday, Trello, ClickUp
  | 'messaging'      // Teams, Slack, Discord, Google Chat
  | 'code'           // GitHub, GitLab, Bitbucket, Azure DevOps
  | 'email';         // Outlook (Graph), Gmail, Exchange

// ─── Supported tool slugs per category ───────────────────────────────────
export type TaskTrackerTool = 'jira' | 'linear' | 'asana' | 'monday' | 'trello' | 'clickup' | 'generic_rest';
export type MessagingTool = 'teams' | 'slack' | 'discord' | 'google_chat' | 'generic_rest_messaging';
export type CodeTool = 'github' | 'gitlab' | 'bitbucket' | 'azure_devops' | 'generic_rest_code';
export type EmailTool = 'outlook' | 'gmail' | 'exchange' | 'generic_smtp' | 'generic_rest_email';
export type ConnectorTool = TaskTrackerTool | MessagingTool | CodeTool | EmailTool;

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
  | 'project_manager_product_owner_scrum_master';

// ─── Normalized actions the agent always uses ────────────────────────────
export type NormalizedActionType =
  // task tracker
  | 'get_task'
  | 'create_task'
  | 'update_task_status'
  | 'add_comment'
  | 'assign_task'
  | 'list_tasks'
  // messaging
  | 'send_message'
  | 'create_channel'
  | 'mention_user'
  // code
  | 'create_pr'
  | 'add_pr_comment'
  | 'merge_pr'
  | 'list_prs'
  // email
  | 'list_emails'
  | 'read_email'
  | 'send_email'
  | 'reply_email'
  | 'read_thread';

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
];

const TASK_ORIENTED_ROLE_KEYS: AgentRoleKey[] = [
  'developer',
  'fullstack_developer',
  'tester',
  'business_analyst',
  'project_manager_product_owner_scrum_master',
];

const CODE_ORIENTED_ROLE_KEYS: AgentRoleKey[] = [
  'developer',
  'fullstack_developer',
  'tester',
  'technical_writer',
  'project_manager_product_owner_scrum_master',
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
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task', 'list_tasks'],
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
    supportedActions: ['get_task', 'create_task', 'update_task_status', 'add_comment', 'assign_task', 'list_tasks'],
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
    },
    oauthScopes: ['repo', 'pull_requests', 'read:user'],
    supportedActions: ['create_pr', 'add_pr_comment', 'merge_pr', 'list_prs'],
    docsUrl: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps',
  },
  {
    tool: 'gitlab',
    category: 'code',
    displayName: 'GitLab',
    logoUrl: '/icons/connectors/gitlab.svg',
    authMethod: 'oauth2',
    allowedRoles: CODE_ORIENTED_ROLE_KEYS,
    oauthScopes: ['api', 'read_user', 'read_repository'],
    supportedActions: ['create_pr', 'add_pr_comment', 'list_prs'],
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
];

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

