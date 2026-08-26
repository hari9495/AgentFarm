/**
 * Recruiter Agent Manifest
 *
 * Customer-facing capability catalogue for the Recruiting Agent.
 * All 26 workspace_rec_* actions are mapped here with:
 *   - tier: core | connector_enhanced | connector_required
 *   - visibility: visible (shown on purchase page) | hidden (infrastructure)
 *   - required / optional connector categories
 *
 * Use getRecruiterPurchaseView()    → purchase page rendering
 * Use getRecruiterOnboardingChecklist() → post-purchase setup flow
 * Use getRecruiterCapabilityList()  → feature-comparison table
 */

import {
    buildManifest,
    buildPurchaseView,
    buildOnboardingChecklist,
} from '../../platform/agent-manifest.js';
import type {
    AgentCapability,
    AgentManifest,
    PurchaseView,
    OnboardingChecklist,
    OnboardingStep,
} from '../../platform/agent-manifest.js';

// ---------------------------------------------------------------------------
// Capability catalogue
// ---------------------------------------------------------------------------

const RECRUITER_CAPABILITIES: AgentCapability[] = [

    // ── Core: Job description & compliance ────────────────────────────────────

    {
        id: 'build-job-description',
        actionId: 'workspace_rec_build_jd',
        name: 'Build Job Descriptions',
        description:
            'Generates branded, structured job descriptions from a role brief — ' +
            'covering responsibilities, requirements, salary range, and DEI-inclusive language.',
        tier: 'core',
        visibility: 'visible',
        icon: 'file-text',
        exampleUseCase:
            'Draft a Senior Backend Engineer JD with FAANG-comparable scope and a remote-first tone.',
    },

    {
        id: 'scan-jd-bias',
        actionId: 'workspace_rec_scan_jd_bias',
        name: 'Inclusive Language Scan',
        description:
            'Detects gender-coded, ageist, or exclusionary language in a job description and ' +
            'suggests neutral, research-backed alternatives to broaden applicant diversity.',
        tier: 'core',
        visibility: 'visible',
        icon: 'scan-eye',
        exampleUseCase:
            'Remove masculine-coded terms from a Product Manager JD to increase female applicant rate.',
    },

    {
        id: 'advise-jd-compliance',
        actionId: 'workspace_rec_advise_jd_compliance',
        name: 'JD Compliance Guidance',
        description:
            'Flags required disclosures for regulated roles — salary transparency, EEO statements, ' +
            'ITAR controls, healthcare licensure, and more — by US state and country.',
        tier: 'core',
        visibility: 'visible',
        icon: 'shield',
        exampleUseCase:
            'Confirm a California job posting includes the legally required salary range disclosure.',
    },

    // ── Core: Candidate screening ─────────────────────────────────────────────

    {
        id: 'screen-resume',
        actionId: 'workspace_rec_screen_resume',
        name: 'Resume Screening & Scoring',
        description:
            'Parses and scores resumes against the job description — covering qualifications, ' +
            'professional credentials, skills (with synonym expansion across 50+ terms), and experience level.',
        tier: 'core',
        visibility: 'visible',
        icon: 'file-search',
        exampleUseCase:
            'Screen 50 nurse applications and rank them by licence type, specialisation, and tenure.',
    },

    {
        id: 'validate-credentials',
        actionId: 'workspace_rec_validate_credentials',
        name: 'Professional Credential Validation',
        description:
            'Detects and validates 70+ professional licences (RN, CPA, JD, PE, MD, PMP, CFA, FAA-ATP …) ' +
            'across healthcare, legal, finance, engineering, aviation, and more.',
        tier: 'core',
        visibility: 'visible',
        icon: 'badge-check',
        exampleUseCase:
            'Confirm a nursing candidate holds a valid RN licence, BLS certification, and EMR training.',
    },

    // ── Core: Interviews ──────────────────────────────────────────────────────

    {
        id: 'conduct-phone-screen',
        actionId: 'workspace_rec_conduct_phone_screen',
        name: 'Phone Screen Script & Scorecard',
        description:
            'Generates a structured phone screen guide with competency-based questions and a ' +
            'scoring rubric — tailored to the role, seniority, and industry.',
        tier: 'core',
        visibility: 'visible',
        icon: 'phone',
        exampleUseCase:
            'Create a 30-minute DevOps phone screen focusing on CI/CD tooling and incident response.',
    },

    {
        id: 'run-assessment',
        actionId: 'workspace_rec_run_assessment',
        name: 'Take-Home Assessments',
        description:
            'Designs and scores take-home briefs — coding challenges, case studies, writing samples, ' +
            'domain-specific projects — with auto-scoring rubrics and candidate debrief templates.',
        tier: 'core',
        visibility: 'visible',
        icon: 'clipboard-list',
        exampleUseCase:
            'Design a 3-hour data science take-home with Python notebook stub and auto-scoring rubric.',
    },

    {
        id: 'gather-feedback',
        actionId: 'workspace_rec_gather_feedback',
        name: 'Interview Feedback Collection',
        description:
            'Aggregates structured interviewer scorecards into a debrief report aligned to ' +
            'competency ratings — identifying consensus and divergence across a panel.',
        tier: 'core',
        visibility: 'visible',
        icon: 'message-circle',
        exampleUseCase:
            'Compile four-panel feedback into a ranked debrief for a Senior Product Manager hire.',
    },

    // ── Core: Pipeline & offer ────────────────────────────────────────────────

    {
        id: 'manage-pipeline',
        actionId: 'workspace_rec_manage_pipeline',
        name: 'Pipeline Status Reports',
        description:
            'Generates SLA-aware pipeline health reports with industry-calibrated time targets — ' +
            'surfacing stalled candidates, stage bottlenecks, and conversion-rate trends.',
        tier: 'core',
        visibility: 'visible',
        icon: 'kanban',
        exampleUseCase:
            'Identify which candidates are past SLA in the offer stage for a healthcare client.',
    },

    {
        id: 'recruiting-metrics',
        actionId: 'workspace_rec_metrics',
        name: 'Recruiting Metrics',
        description:
            'Computes funnel conversion, time-to-fill, days-open, pipeline aging (stale candidates), ' +
            'and source effectiveness over a candidate snapshot.',
        tier: 'core',
        visibility: 'visible',
        icon: 'chart-bar',
        exampleUseCase:
            'Report time-to-fill and stage-by-stage conversion for the open Staff Engineer requisition.',
    },

    {
        id: 'generate-offer',
        actionId: 'workspace_rec_generate_offer',
        name: 'Offer Letter Generation',
        description:
            'Produces country-aware offer letters with statutory clauses (UK Employment Rights Act, ' +
            'AU Fair Work Act, CA ESA, EU Working Time Directive, US at-will), localised benefits, ' +
            'and budget validation.',
        tier: 'core',
        visibility: 'visible',
        icon: 'file-signature',
        exampleUseCase:
            'Draft a compliant UK offer letter with Employment Rights Act 1996 statutory clauses.',
    },

    {
        id: 'negotiate-offer',
        actionId: 'workspace_rec_negotiate_offer',
        name: 'Offer Negotiation Support',
        description:
            'Evaluates counter-offers against budget and market bands, suggests trade-off levers ' +
            '(equity, start date, title adjustment, sign-on), and prepares verbal negotiation scripts.',
        tier: 'core',
        visibility: 'visible',
        icon: 'handshake',
        exampleUseCase:
            'Candidate countered 20% above budget — recommend equity-for-salary swap with rationale.',
    },

    {
        id: 'approve-requisition',
        actionId: 'workspace_rec_approve_requisition',
        name: 'Requisition & Headcount Approval',
        description:
            'Routes headcount requests through a multi-level approval workflow — validating against ' +
            'budget, org chart, and approval policy before submission.',
        tier: 'core',
        visibility: 'visible',
        icon: 'check-circle',
        exampleUseCase:
            'Submit a backfill request for a departing engineer to Finance and Exec for sign-off.',
    },

    // ── Core: Candidate communications & compliance ───────────────────────────

    {
        id: 'compose-rejection',
        actionId: 'workspace_rec_compose_rejection',
        name: 'Rejection Email Drafting',
        description:
            'Composes EEOC-safe, stage-appropriate rejection emails — from application ' +
            'acknowledgment through post-offer withdrawal — personalised by candidate stage.',
        tier: 'core',
        visibility: 'visible',
        icon: 'mail-minus',
        exampleUseCase:
            'Draft a respectful post-final-round rejection for a finalist who lost to an internal hire.',
    },

    {
        id: 'run-reference-check',
        actionId: 'workspace_rec_run_reference_check',
        name: 'Reference Checks',
        description:
            'Generates structured reference questionnaires, analyses completed responses into a ' +
            'debrief summary, and flags red signals for the hiring team.',
        tier: 'core',
        visibility: 'visible',
        icon: 'users',
        exampleUseCase:
            'Send a 10-question reference form to three contacts and summarise the results.',
    },

    {
        id: 'onboarding-handoff',
        actionId: 'workspace_rec_onboarding_handoff',
        name: 'Onboarding Handoff Package',
        description:
            'Generates a Day-1 checklist, equipment request, IT provisioning note, and welcome ' +
            'email sequence for the new hire — routed to HR, IT, and the hiring manager.',
        tier: 'core',
        visibility: 'visible',
        icon: 'rocket',
        exampleUseCase:
            'Create a complete onboarding package for a remote engineer starting Monday.',
    },

    // ── Core: Research & intelligence ─────────────────────────────────────────

    {
        id: 'market-intelligence',
        actionId: 'workspace_rec_market_intelligence',
        name: 'Market Intelligence & Salary Benchmarking',
        description:
            'Researches salary bands (p25/p50/p75/p90), hiring trends, competitor talent strategies, ' +
            'and talent availability — across 25+ industries and 24 countries.',
        tier: 'core',
        visibility: 'visible',
        icon: 'bar-chart-2',
        exampleUseCase:
            'What are p50 engineering salaries in Singapore vs. Sydney for Staff Engineers in 2025?',
    },

    {
        id: 'international-recruiting',
        actionId: 'workspace_rec_international',
        name: 'International Recruiting',
        description:
            'Handles right-to-work checks, visa sponsorship assessment, IR35 determination, ' +
            'GDPR / DPDPA / LGPD data-privacy compliance, and market-specific adaptations for 24 countries.',
        tier: 'core',
        visibility: 'visible',
        icon: 'globe',
        exampleUseCase:
            'Check right-to-work and GDPR obligations for a UAE candidate hired under a UK contract.',
    },

    {
        id: 'campus-recruiting',
        actionId: 'workspace_rec_campus_recruiting',
        name: 'Campus & Bulk Recruiting',
        description:
            'Manages career fair logistics, bulk resume screening, intern cohort tracking, and ' +
            'seasonal batch hiring pipelines for high-volume early-career programmes.',
        tier: 'core',
        visibility: 'visible',
        icon: 'graduation-cap',
        exampleUseCase:
            'Screen 200 applications from a university career fair in under 10 minutes.',
    },

    // ── Connector-enhanced: works standalone, significantly better with a connector ──

    {
        id: 'source-candidates',
        actionId: 'workspace_rec_source_candidates',
        name: 'Live Candidate Sourcing',
        description:
            'Searches live talent databases and professional networks for matching candidates. ' +
            'Without a connector the agent falls back to structured heuristic profiles — ' +
            'configuring a sourcing connector enables real candidate data.',
        tier: 'connector_enhanced',
        visibility: 'visible',
        optionalConnectorCategories: ['candidate_sourcing'],
        icon: 'user-search',
        exampleUseCase:
            'Find 15 senior Java engineers in Austin with fintech experience and verified emails.',
    },

    {
        id: 'send-outreach',
        actionId: 'workspace_rec_send_outreach',
        name: 'Candidate Outreach & Sequences',
        description:
            'Composes personalised outreach messages and multi-touch sequences. ' +
            'Connect a business email account to send live — works as a draft composer without one.',
        tier: 'connector_enhanced',
        visibility: 'visible',
        optionalConnectorCategories: ['email'],
        icon: 'send',
        exampleUseCase:
            'Send a personalised 3-touch outreach sequence to 20 passive candidates.',
    },

    {
        id: 'schedule-interview',
        actionId: 'workspace_rec_schedule_interview',
        name: 'Automated Interview Scheduling',
        description:
            'Creates booking links and calendar invites for candidates and interviewers. ' +
            'Connect a scheduling or calendar tool to send live invites — ' +
            'works as a scheduling plan without one.',
        tier: 'connector_enhanced',
        visibility: 'visible',
        optionalConnectorCategories: ['interview_scheduling'],
        icon: 'calendar-clock',
        exampleUseCase:
            'Schedule a four-interviewer technical loop with 30-minute buffers and a Zoom link.',
    },

    {
        id: 'post-job',
        actionId: 'workspace_rec_post_job',
        name: 'Job Board Posting',
        description:
            'Publishes approved job descriptions to external job boards — ' +
            'requires a job board connector to post live; ' +
            'generates the posting payload and copy without one.',
        tier: 'connector_enhanced',
        visibility: 'visible',
        optionalConnectorCategories: ['job_board'],
        icon: 'megaphone',
        exampleUseCase:
            'Post a new opening to LinkedIn Jobs and Indeed simultaneously.',
    },

    {
        id: 'manage-talent-pool',
        actionId: 'workspace_rec_manage_talent_pool',
        name: 'Talent Pool & Nurture',
        description:
            'Maintains a CRM of silver-medal candidates with re-engagement triggers and ' +
            'personalised nurture sequences. A Talent CRM connector enables persistent ' +
            'storage across sessions.',
        tier: 'connector_enhanced',
        visibility: 'visible',
        optionalConnectorCategories: ['talent_crm'],
        icon: 'users-round',
        exampleUseCase:
            'Re-engage 30 pipeline candidates from 6 months ago for a newly opened role.',
    },

    // ── Connector-required: must have a connector in the category to function ──

    {
        id: 'check-bgc',
        actionId: 'workspace_rec_check_bgc',
        name: 'Background Checks',
        description:
            'Initiates FCRA-compliant background checks after obtaining signed candidate ' +
            'authorisation. Requires a connected background check provider (Checkr, Sterling, HireRight).',
        tier: 'connector_required',
        visibility: 'visible',
        requiredConnectorCategories: ['background_check'],
        icon: 'shield-check',
        exampleUseCase:
            'Order a criminal, employment, and education background check for a finalist candidate.',
    },

    {
        id: 'send-offer-for-signature',
        actionId: 'workspace_rec_generate_offer',
        name: 'Offer Delivery & E-Signature',
        description:
            'Sends the generated offer letter for legally binding e-signature. ' +
            'Requires a connected e-signature platform (DocuSign, Zoho Sign, Adobe Sign, HelloSign).',
        tier: 'connector_required',
        visibility: 'visible',
        requiredConnectorCategories: ['e_signature'],
        icon: 'pen-line',
        exampleUseCase:
            'Send a DocuSign offer letter with a 48-hour signing deadline and automated reminders.',
    },

    // ── Hidden: infrastructure (not shown to customers) ───────────────────────

    {
        id: 'request-human-gate',
        actionId: 'workspace_rec_request_human_gate',
        name: 'Human Approval Gate',
        description: 'Routes high-risk actions to human approval before execution.',
        tier: 'core',
        visibility: 'hidden',
    },

    {
        id: 'dashboard-request',
        actionId: 'workspace_rec_dashboard_request',
        name: 'Dashboard Request Emitter',
        description: 'Emits structured requests to the customer dashboard for API config, document upload, and approvals.',
        tier: 'core',
        visibility: 'hidden',
    },
];

// ---------------------------------------------------------------------------
// Manifest instance
// ---------------------------------------------------------------------------

export const RECRUITER_MANIFEST: AgentManifest = buildManifest({
    agentId: 'recruiter',
    agentName: 'Recruiting Agent',
    version: '1.0.0',
    tagline: 'A full-cycle recruiting agent for any industry, any country.',
    description:
        'Automates the end-to-end hiring workflow — from crafting job descriptions and sourcing ' +
        'candidates to screening resumes, scheduling interviews, running reference checks, ' +
        'drafting compliant offer letters, and generating onboarding packages. ' +
        'Covers 25+ industries and 24 countries with built-in salary benchmarking, ' +
        'credential validation, and data-privacy compliance.',
    capabilities: RECRUITER_CAPABILITIES,
});

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Customer-facing purchase page view — filtered to visible capabilities only. */
export function getRecruiterPurchaseView(): PurchaseView {
    return buildPurchaseView(RECRUITER_MANIFEST);
}

/**
 * Post-purchase onboarding checklist.
 * Optionally pass extra steps (document uploads, company settings) to append.
 */
export function getRecruiterOnboardingChecklist(extraSteps?: OnboardingStep[]): OnboardingChecklist {
    return buildOnboardingChecklist(RECRUITER_MANIFEST, extraSteps);
}

/** Flat list of all customer-visible capabilities — suitable for a feature-comparison table. */
export function getRecruiterCapabilityList(): AgentCapability[] {
    return RECRUITER_MANIFEST.capabilities.filter(c => c.visibility === 'visible');
}

export type { AgentCapability, AgentManifest, PurchaseView, OnboardingChecklist, OnboardingStep };
