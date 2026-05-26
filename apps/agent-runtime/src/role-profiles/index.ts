import type { RoleKey } from '@agentfarm/shared-types';
import {
    TESTER_ROLE_ALLOWED_CONNECTORS,
    TESTER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/tester/tester-agent-profile.js';
import {
    CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS,
    CORPORATE_ASSISTANT_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/corporate-assistant/corporate-assistant-agent-profile.js';
import {
    TECHNICAL_WRITER_ROLE_ALLOWED_CONNECTORS,
    TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/technical-writer/technical-writer-agent-profile.js';
import {
    CONTENT_WRITER_ROLE_ALLOWED_CONNECTORS,
    CONTENT_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/content-writer/content-writer-agent-profile.js';
import {
    DEVELOPER_ROLE_ALLOWED_CONNECTORS,
    DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/developer/developer-agent-profile.js';
import {
    FSD_ROLE_ALLOWED_CONNECTORS,
    FSD_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/full-stack-developer/fsd-agent-profile.js';
import {
    DEVOPS_ROLE_ALLOWED_CONNECTORS,
    DEVOPS_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/devops/devops-agent-profile.js';

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
        description: 'Handles full software development lifecycle — feature implementation, bug fixes, code review, refactoring, security audits, performance profiling, and PR management',
        allowedConnectorTools: [...DEVELOPER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...DEVELOPER_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['codeRepoProvider'],
    },
    fullstack_developer: {
        roleKey: 'fullstack_developer',
        displayName: 'Fullstack Developer',
        description: 'Handles end-to-end full-stack development — UI component generation, design handoff from Figma, responsive/a11y/SEO/performance audits, API integration, auth flows, realtime (WebSocket/SSE), state management, and full-stack feature delivery',
        allowedConnectorTools: [...FSD_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...FSD_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['codeRepoProvider'],
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
        allowedConnectorTools: [...TECHNICAL_WRITER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...TECHNICAL_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['documentProvider'],
    },
    content_writer: {
        roleKey: 'content_writer',
        displayName: 'Content Writer',
        description: 'Handles blog posts, marketing copy, social content, and email campaigns',
        allowedConnectorTools: [...CONTENT_WRITER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...CONTENT_WRITER_ROLE_ALLOWED_LOCAL_ACTIONS],
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
        allowedConnectorTools: [...CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...CORPORATE_ASSISTANT_ROLE_ALLOWED_LOCAL_ACTIONS],
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
    devops_engineer: {
        roleKey: 'devops_engineer',
        displayName: 'DevOps / Infrastructure Engineer',
        description: 'Handles CI/CD pipelines, Kubernetes deployments, Terraform IaC, Docker builds, incident triage, and DORA metrics',
        allowedConnectorTools: [...DEVOPS_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...DEVOPS_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['codeRepoProvider'],
    },
};

export function getRoleProfile(roleKey: RoleKey): RoleProfile {
    return ROLE_PROFILES[roleKey];
}
