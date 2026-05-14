import type { RoleKey } from '@agentfarm/shared-types';
import {
    TESTER_ROLE_ALLOWED_CONNECTORS,
    TESTER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../tester-agent-profile.js';

export interface RoleProfile {
    roleKey: RoleKey;
    displayName: string;
    description: string;
    allowedConnectorTools: string[];
    allowedActions: string[];
    requiredConfig: string[];
}

export const ROLE_PROFILES: Record<RoleKey, RoleProfile> = {
    recruiter: {
        roleKey: 'recruiter',
        displayName: 'Recruiter',
        description: 'Handles end-to-end recruitment — sourcing, screening, scheduling, and offer management',
        allowedConnectorTools: ['linkedin', 'gmail', 'outlook', 'google_calendar', 'slack'],
        allowedActions: ['send_email', 'schedule_meeting', 'search_candidates', 'post_job', 'send_message'],
        requiredConfig: ['emailProvider', 'calendarProvider'],
    },
    developer: {
        roleKey: 'developer',
        displayName: 'Developer',
        description: 'Handles code review, PR drafts, bug triage, and issue management',
        allowedConnectorTools: ['github', 'gitlab', 'jira', 'slack', 'confluence'],
        allowedActions: ['create_pr', 'review_code', 'create_issue', 'comment_issue', 'run_pipeline', 'send_message'],
        requiredConfig: ['codeRepoProvider', 'issueTrackerProvider'],
    },
    fullstack_developer: {
        roleKey: 'fullstack_developer',
        displayName: 'Fullstack Developer',
        description: 'Handles frontend + backend code review, PR drafts, design handoff, and issue management',
        allowedConnectorTools: ['github', 'gitlab', 'jira', 'slack', 'confluence', 'figma'],
        allowedActions: ['create_pr', 'review_code', 'create_issue', 'comment_issue', 'run_pipeline', 'send_message', 'read_design'],
        requiredConfig: ['codeRepoProvider', 'issueTrackerProvider'],
    },
    tester: {
        roleKey: 'tester',
        displayName: 'Tester',
        description: 'Validates software behaviour through systematic, reproducible, and thorough testing',
        allowedConnectorTools: [...TESTER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...TESTER_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: [],
    },
    business_analyst: {
        roleKey: 'business_analyst',
        displayName: 'Business Analyst',
        description: 'Handles requirements gathering, documentation, and stakeholder communication',
        allowedConnectorTools: ['jira', 'confluence', 'slack', 'google_drive', 'microsoft_teams'],
        allowedActions: ['create_issue', 'comment_issue', 'create_document', 'send_message', 'read_document'],
        requiredConfig: ['documentProvider', 'issueTrackerProvider'],
    },
    technical_writer: {
        roleKey: 'technical_writer',
        displayName: 'Technical Writer',
        description: 'Handles technical documentation, API docs, and release notes',
        allowedConnectorTools: ['confluence', 'github', 'google_drive', 'slack'],
        allowedActions: ['create_document', 'update_document', 'read_document', 'create_pr', 'send_message'],
        requiredConfig: ['documentProvider'],
    },
    content_writer: {
        roleKey: 'content_writer',
        displayName: 'Content Writer',
        description: 'Handles blog posts, marketing copy, social content, and email campaigns',
        allowedConnectorTools: ['google_drive', 'slack', 'microsoft_teams', 'gmail'],
        allowedActions: ['create_document', 'update_document', 'send_message', 'send_email'],
        requiredConfig: ['documentProvider', 'emailProvider'],
    },
    sales_rep: {
        roleKey: 'sales_rep',
        displayName: 'Sales Rep',
        description: 'Handles end-to-end sales — prospecting, outreach, qualification, proposals, and closing',
        allowedConnectorTools: [
            'apollo', 'hunter', 'linkedin', 'gmail', 'outlook', 'smtp',
            'sendgrid', 'mailgun', 'salesforce', 'hubspot', 'pipedrive', 'zoho_crm',
            'google_calendar', 'calendly', 'cal_com', 'docusign', 'zoho_sign', 'slack',
        ],
        allowedActions: [
            'find_leads', 'enrich_lead', 'send_email', 'schedule_meeting',
            'create_deal', 'update_deal', 'generate_proposal', 'send_contract',
            'update_crm', 'send_message', 'qualify_lead', 'handle_objection',
        ],
        requiredConfig: ['leadSourceProvider', 'emailProvider', 'crmProvider', 'calendarProvider', 'productDescription', 'icp'],
    },
    marketing_specialist: {
        roleKey: 'marketing_specialist',
        displayName: 'Marketing Specialist',
        description: 'Handles campaigns, email marketing, content distribution, and CRM updates',
        allowedConnectorTools: ['google_drive', 'slack', 'gmail', 'sendgrid', 'mailgun', 'hubspot', 'salesforce', 'microsoft_teams'],
        allowedActions: ['create_document', 'send_email', 'create_campaign', 'update_crm', 'send_message', 'schedule_post'],
        requiredConfig: ['emailProvider', 'crmProvider'],
    },
    corporate_assistant: {
        roleKey: 'corporate_assistant',
        displayName: 'Corporate Assistant',
        description: 'Handles scheduling, email management, document prep, and internal communication',
        allowedConnectorTools: ['gmail', 'outlook', 'google_calendar', 'slack', 'microsoft_teams', 'google_drive', 'confluence'],
        allowedActions: ['send_email', 'schedule_meeting', 'create_document', 'send_message', 'read_document', 'read_calendar'],
        requiredConfig: ['emailProvider', 'calendarProvider'],
    },
    customer_support_executive: {
        roleKey: 'customer_support_executive',
        displayName: 'Customer Support Executive',
        description: 'Handles support tickets, customer replies, escalations, and issue resolution',
        allowedConnectorTools: ['jira', 'slack', 'microsoft_teams', 'gmail', 'outlook', 'zendesk', 'intercom'],
        allowedActions: ['create_issue', 'comment_issue', 'send_email', 'send_message', 'escalate_ticket', 'close_ticket', 'update_crm'],
        requiredConfig: ['ticketingProvider', 'emailProvider'],
    },
    project_manager_product_owner_scrum_master: {
        roleKey: 'project_manager_product_owner_scrum_master',
        displayName: 'Project Manager / Product Owner / Scrum Master',
        description: 'Handles sprint planning, backlog grooming, stakeholder updates, and delivery tracking',
        allowedConnectorTools: ['jira', 'confluence', 'slack', 'github', 'gitlab', 'microsoft_teams', 'google_calendar'],
        allowedActions: [
            'create_issue', 'comment_issue', 'create_document', 'update_document',
            'send_message', 'schedule_meeting', 'run_pipeline', 'create_pr',
        ],
        requiredConfig: ['issueTrackerProvider', 'documentProvider'],
    },
};

export function getRoleProfile(roleKey: RoleKey): RoleProfile {
    return ROLE_PROFILES[roleKey];
}
