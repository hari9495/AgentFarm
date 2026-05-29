/**
 * Customer Support Executive MCP Provisioner
 *
 * Auto-registers and caches MCP servers for the Customer Support Executive role.
 * Covers helpdesk, CRM, email, messaging, commerce/billing, issue tracking,
 * knowledge base, surveys, voice STT/TTS, and telephony.
 */

import { createMcpProvisioner } from '../../mcp-provisioner-factory.js';
import { CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_CONNECTORS } from './customer-support-executive-agent-profile.js';

const CSE_MCP_ENV_MAP: Record<string, string> = {
    // Helpdesk / ticketing
    zendesk:                 'MCP_ZENDESK_URL',
    intercom:                'MCP_INTERCOM_URL',
    freshdesk:               'MCP_FRESHDESK_URL',
    freshservice:            'MCP_FRESHSERVICE_URL',
    servicenow:              'MCP_SERVICENOW_URL',
    happyfox:                'MCP_HAPPYFOX_URL',
    // CRM
    salesforce:              'MCP_SALESFORCE_URL',
    hubspot:                 'MCP_HUBSPOT_URL',
    zoho_crm:                'MCP_ZOHO_CRM_URL',
    microsoft_dynamics:      'MCP_MICROSOFT_DYNAMICS_URL',
    // Email
    gmail:                   'MCP_GMAIL_URL',
    outlook:                 'MCP_OUTLOOK_URL',
    exchange:                'MCP_EXCHANGE_URL',
    generic_smtp:            'MCP_GENERIC_SMTP_URL',
    generic_rest_email:      'MCP_GENERIC_REST_EMAIL_URL',
    // Messaging
    slack:                   'MCP_SLACK_URL',
    microsoft_teams:         'MCP_TEAMS_URL',
    discord:                 'MCP_DISCORD_URL',
    google_chat:             'MCP_GOOGLE_CHAT_URL',
    generic_rest_messaging:  'MCP_GENERIC_REST_MESSAGING_URL',
    // Commerce / billing
    stripe:                  'MCP_STRIPE_URL',
    braintree:               'MCP_BRAINTREE_URL',
    shopify:                 'MCP_SHOPIFY_URL',
    woocommerce:             'MCP_WOOCOMMERCE_URL',
    magento:                 'MCP_MAGENTO_URL',
    razorpay:                'MCP_RAZORPAY_URL',
    // Issue tracking (escalated bugs)
    jira:                    'MCP_JIRA_URL',
    linear:                  'MCP_LINEAR_URL',
    asana:                   'MCP_ASANA_URL',
    trello:                  'MCP_TRELLO_URL',
    clickup:                 'MCP_CLICKUP_URL',
    // Knowledge base / docs
    confluence:              'MCP_CONFLUENCE_URL',
    notion:                  'MCP_NOTION_URL',
    google_drive:            'MCP_GOOGLE_DRIVE_URL',
    // Surveys
    surveymonkey:            'MCP_SURVEYMONKEY_URL',
    typeform:                'MCP_TYPEFORM_URL',
    // Voice STT/TTS
    sarvam_ai:               'MCP_SARVAM_AI_URL',
    deepgram:                'MCP_DEEPGRAM_URL',
    // Telephony
    twilio:                  'MCP_TWILIO_URL',
    vonage:                  'MCP_VONAGE_URL',
    amazon_connect:          'MCP_AMAZON_CONNECT_URL',
    genesys:                 'MCP_GENESYS_URL',
    generic_telephony:       'MCP_GENERIC_TELEPHONY_URL',
};

const _provisioner = createMcpProvisioner(
    'customer-support-executive',
    CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_CONNECTORS,
    CSE_MCP_ENV_MAP,
);

export const ensureCseMcpServers     = _provisioner.ensureServers.bind(_provisioner);
export const getCseMcpClients        = _provisioner.getClients.bind(_provisioner);
export const invalidateCseMcpSession = _provisioner.invalidateSession.bind(_provisioner);
