/**
 * Connectors index
 *
 * Re-exports all connector implementations for the connector-gateway service.
 */

export { SlackConnector } from './slack-connector.js';
export type { SlackConnectorConfig, SlackMessage, SlackMessageResult, SlackChannelInfo, SlackUserInfo, SlackIncidentAlert } from './slack-connector.js';

export { EmailConnector } from './email-connector.js';
export type { EmailConnectorConfig, SendEmailInput, EmailConnectorResult } from './email-connector.js';

export { LinearConnector } from './linear-connector.js';
export type { LinearConnectorConfig, LinearIssue, CreateLinearIssueInput, LinearPriority, LinearQueryResult } from './linear-connector.js';

export { AzureDevOpsConnector } from './azure-devops-connector.js';
export type { AzureDevOpsConfig, AdoWorkItem, AdoPipelineRun, AdoBuildStatus, AdoQueryResult } from './azure-devops-connector.js';

export { PagerDutyConnector } from './pagerduty-connector.js';
export type { PagerDutyConfig, PdIncident, PdIncidentStatus, PdUrgency, PdOnCallEntry, PdQueryResult } from './pagerduty-connector.js';

export { GitHubConnector } from './github-connector.js';
export type { GitHubConnectorConfig, GitHubIssue, CreateIssueInput, GitHubPR, GitHubCommit, GitHubWorkflowRun, GitHubReview, GitHubComment, GitHubQueryResult } from './github-connector.js';

export { SentryConnector } from './sentry-connector.js';
export type { SentryConnectorConfig, SentryIssue, SentryEvent, SentryRelease, SentryAlert, SentryQueryResult } from './sentry-connector.js';

export { NotionConnector } from './notion-connector.js';
export type { NotionConnectorConfig, NotionPage, NotionDatabase, NotionBlock, NotionSearchResult, NotionQueryResult } from './notion-connector.js';

export { ConfluenceConnector } from './confluence-connector.js';
export type { ConfluenceConnectorConfig, ConfluencePage, ConfluenceSpace, ConfluenceComment, ConfluenceSearchResult, ConfluenceQueryResult } from './confluence-connector.js';
