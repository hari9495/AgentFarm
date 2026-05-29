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
    MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS,
    MARKETING_SPECIALIST_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/marketing-specialist/marketing-specialist-agent-profile.js';
import {
    RECRUITER_ROLE_ALLOWED_CONNECTORS,
    RECRUITER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/recruiter/recruiter-agent-profile.js';
import {
    CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_CONNECTORS,
    CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/customer-support-executive/customer-support-executive-agent-profile.js';
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
import {
    MOBILE_ROLE_ALLOWED_CONNECTORS,
    MOBILE_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/mobile/mobile-agent-profile.js';
import {
    BUSINESS_ANALYST_ROLE_ALLOWED_CONNECTORS,
    BUSINESS_ANALYST_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/business-analyst/business-analyst-agent-profile.js';
import {
    PROJECT_MANAGER_ROLE_ALLOWED_CONNECTORS,
    PROJECT_MANAGER_ROLE_ALLOWED_LOCAL_ACTIONS,
} from '../agents/project-manager/project-manager-agent-profile.js';

export interface RoleProfile {
    roleKey: RoleKey;
    displayName: string;
    description: string;
    allowedConnectorTools: string[];
    allowedActions: string[];
    requiredConfig: string[];
    /** Set when this role is a sub-agent spawned by another role rather than a top-level agent */
    parentRole?: RoleKey;
}

export const ROLE_PROFILES: Record<RoleKey, RoleProfile> = {
    recruiter: {
        roleKey: 'recruiter',
        displayName: 'Recruiter',
        description: 'Handles the full talent-acquisition lifecycle — job description creation, multi-platform sourcing, resume screening, personalised candidate outreach, interview scheduling, panel debrief, offer generation, pipeline tracking, and market intelligence',
        allowedConnectorTools: [...RECRUITER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...RECRUITER_ROLE_ALLOWED_LOCAL_ACTIONS],
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
        description: 'Handles the full requirements lifecycle — BRD drafting and finalisation, user story and acceptance criteria authoring, process mapping, gap and impact analysis, solution evaluation, stakeholder communication, UAT checklists, RTM generation, and proactive AC/epic/conflict monitoring',
        allowedConnectorTools: [...BUSINESS_ANALYST_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...BUSINESS_ANALYST_ROLE_ALLOWED_LOCAL_ACTIONS],
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
        description: 'Handles full campaign lifecycle — planning, PPC optimisation, SEO/keyword research, email sequences, social scheduling, A/B testing, KPI reporting, competitor analysis, and cross-team alignment',
        allowedConnectorTools: [...MARKETING_SPECIALIST_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...MARKETING_SPECIALIST_ROLE_ALLOWED_LOCAL_ACTIONS],
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
        description: 'Handles the full customer support lifecycle — multi-channel inbound/outbound, ticket management, issue diagnosis, tiered escalation, refund processing, CSAT/NPS surveys, CRM documentation, KB authoring, KPI reporting, and SLA adherence across all industries and domains',
        allowedConnectorTools: [...CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...CUSTOMER_SUPPORT_EXECUTIVE_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['ticketingProvider', 'emailProvider'],
    },
    project_manager_product_owner_scrum_master: {
        roleKey: 'project_manager_product_owner_scrum_master',
        displayName: 'Project Manager / Product Owner / Scrum Master',
        description: 'Handles the full delivery lifecycle — project charters, status reports, risk registers, dependency maps, change requests, milestone plans, budget forecasts, sprint planning, backlog grooming, velocity reports, retrospectives, impediment logs, ceremony facilitation, live board sync, delivery forecasting, sprint health monitoring, and cross-agent handoffs',
        allowedConnectorTools: [...PROJECT_MANAGER_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...PROJECT_MANAGER_ROLE_ALLOWED_LOCAL_ACTIONS],
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
    mobile_engineer: {
        roleKey: 'mobile_engineer',
        displayName: 'Mobile Engineer',
        description: 'Sub-agent of the Tester — handles iOS and Android test execution, real-device cloud testing (BrowserStack, Sauce Labs), app store uploads, push-notification verification, deep-link validation, and mobile performance/accessibility audits',
        allowedConnectorTools: [...MOBILE_ROLE_ALLOWED_CONNECTORS],
        allowedActions: [...MOBILE_ROLE_ALLOWED_LOCAL_ACTIONS],
        requiredConfig: ['codeRepoProvider'],
        parentRole: 'tester',
    },
};

export function getRoleProfile(roleKey: RoleKey): RoleProfile {
    return ROLE_PROFILES[roleKey];
}
