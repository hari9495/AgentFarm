/**
 * Recruiter MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Recruiter role.
 * Covers job boards, ATS platforms, prospecting, communication,
 * calendar, document storage, e-signature, and CRM.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { RECRUITER_ROLE_ALLOWED_CONNECTORS } from './recruiter-agent-profile.js';

const RECRUITER_MCP_ENV_MAP: Record<string, string> = {
    // Job boards & talent platforms
    linkedin:             'MCP_LINKEDIN_URL',
    linkedin_recruiter:   'MCP_LINKEDIN_RECRUITER_URL',
    indeed:               'MCP_INDEED_URL',
    glassdoor:            'MCP_GLASSDOOR_URL',
    // Prospecting / enrichment
    apollo:               'MCP_APOLLO_URL',
    hunter:               'MCP_HUNTER_URL',
    // ATS platforms
    greenhouse:           'MCP_GREENHOUSE_URL',
    lever:                'MCP_LEVER_URL',
    workday:              'MCP_WORKDAY_URL',
    ashby:                'MCP_ASHBY_URL',
    icims:                'MCP_ICIMS_URL',
    // Communication
    gmail:                'MCP_GMAIL_URL',
    outlook:              'MCP_OUTLOOK_URL',
    slack:                'MCP_SLACK_URL',
    microsoft_teams:      'MCP_TEAMS_URL',
    // Calendar / scheduling
    google_calendar:      'MCP_GOOGLE_CALENDAR_URL',
    calendly:             'MCP_CALENDLY_URL',
    cal_com:              'MCP_CAL_COM_URL',
    // Document platforms
    google_drive:         'MCP_GOOGLE_DRIVE_URL',
    // E-signature
    docusign:             'MCP_DOCUSIGN_URL',
    zoho_sign:            'MCP_ZOHO_SIGN_URL',
    // CRM
    hubspot:              'MCP_HUBSPOT_URL',
    salesforce:           'MCP_SALESFORCE_URL',
};

const _provisioner = createMcpProvisioner('recruiter', RECRUITER_ROLE_ALLOWED_CONNECTORS, RECRUITER_MCP_ENV_MAP);

export const ensureRecruiterMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getRecruiterMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateRecruiterMcpSession = _provisioner.invalidateSession.bind(_provisioner);
