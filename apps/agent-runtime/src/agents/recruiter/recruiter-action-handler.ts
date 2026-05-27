/**
 * Recruiter Action Handler (Tier 47)
 *
 * Dispatches workspace_rec_* actions to domain modules:
 *
 *   workspace_rec_build_jd              — craft a branded job description from a role brief
 *   workspace_rec_post_job              — gate + generate job-board posting payload
 *   workspace_rec_source_candidates     — search LinkedIn / Apollo / boards for talent
 *   workspace_rec_screen_resume         — parse + score a resume against a JD (credential-aware)
 *   workspace_rec_send_outreach         — compose personalised candidate outreach / sequence
 *   workspace_rec_schedule_interview    — coordinate calendars, produce invites & prep packs
 *   workspace_rec_conduct_phone_screen  — generate a structured phone-screen script + scorecard
 *   workspace_rec_gather_feedback       — aggregate interviewer feedback into a debrief report
 *   workspace_rec_manage_pipeline       — build an ATS pipeline status report with SLA warnings
 *   workspace_rec_generate_offer        — draft an employment offer letter with budget validation
 *   workspace_rec_market_intelligence   — industry-aware salary benchmarking, talent availability
 *   workspace_rec_request_human_gate    — route high-risk action to human approval
 *   workspace_rec_check_bgc             — FCRA-compliant background check initiation workflow
 *   workspace_rec_compose_rejection     — EEOC-safe rejection email for any pipeline stage
 *   workspace_rec_negotiate_offer       — counter-offer evaluation, verbal scripts, decline saves
 *   workspace_rec_scan_jd_bias          — DEI / inclusive language scan on job description text
 *   workspace_rec_validate_credentials  — domain credential checker (RN, JD, CPA, PE, etc.)
 *   workspace_rec_run_reference_check   — reference questionnaire, debrief capture and summary
 *   workspace_rec_manage_talent_pool    — silver-medal CRM, nurture sequences, re-engagement
 *   workspace_rec_approve_requisition   — multi-level headcount / budget approval workflow
 *   workspace_rec_onboarding_handoff    — post-offer Day-1 checklist and welcome sequence
 *   workspace_rec_run_assessment        — take-home brief + scoring rubric for any domain
 *   workspace_rec_advise_jd_compliance  — industry-specific regulatory JD disclosures
 *   workspace_rec_international         — right-to-work, IR35, GDPR, market adaptation
 *   workspace_rec_campus_recruiting     — career fair, bulk screen, intern tracker, seasonal batch
 */

import type { LocalWorkspaceResult } from '../../local-workspace-executor.js';

import { buildJobDescription } from './jd-builder.js';
import type { RoleBrief, EmploymentType, WorkArrangement, ExperienceLevel } from './jd-builder.js';

import { sourceCandidates } from './candidate-sourcer.js';
import type { SourcingCriteria } from './candidate-sourcer.js';

import { screenResume } from './resume-screener.js';
import type { ResumeScreenInput } from './resume-screener.js';

import { composeOutreach, buildOutreachSequence } from './outreach-composer.js';
import type { OutreachSpec, OutreachChannel, CandidateStatus } from './outreach-composer.js';

import { scheduleInterview } from './interview-scheduler.js';
import type {
    ScheduleInterviewInput,
    InterviewFormat,
    InterviewStage,
    Interviewer,
    InterviewSlot,
} from './interview-scheduler.js';

import { buildPhoneScreenGuide } from './phone-screen-guide.js';
import type { PhoneScreenInput } from './phone-screen-guide.js';

import { collectAndSummariseFeedback } from './feedback-collector.js';
import type { FeedbackCollectorInput, InterviewerFeedback, FeedbackRating } from './feedback-collector.js';

import { buildPipelineReport } from './pipeline-tracker.js';
import type { PipelineReportInput, PipelineCandidate, PipelineStage } from './pipeline-tracker.js';

import { generateOffer } from './offer-generator.js';
import type { OfferInput, OfferType, PayFrequency, CompensationPackage } from './offer-generator.js';

import { generateMarketIntelReport } from './market-intelligence.js';
import type { MarketIntelInput, SeniorityBand } from './market-intelligence.js';

import {
    isRecruiterGateType,
    buildRecruiterGateRecord,
    buildRecruiterGateApprovalSummary,
    buildRecruiterGateImpactScope,
    buildRecruiterGateRiskReason,
} from './human-gate-requests.js';
import type { RecruiterGateInput } from './human-gate-requests.js';

import { initiateBgcWorkflow, buildAdverseAction } from './background-check.js';
import type { BgcInitiateInput, AdverseActionInput, BgcPackage, BgcProvider } from './background-check.js';

import { composeRejection } from './rejection-composer.js';
import type { RejectionInput, RejectionStage, RejectionTone } from './rejection-composer.js';

import {
    buildVerbalOfferScript,
    modelTotalComp,
    evaluateCounterOffer,
    buildDeclineSaveScript,
} from './offer-negotiation.js';
import type { VerbalOfferInput, CounterOfferInput, TotalCompInput } from './offer-negotiation.js';

import { scanJobDescriptionForBias, buildDeiFunnelReport } from './jd-bias-scanner.js';
import type { JdBiasScanInput, DeiFunnelInput } from './jd-bias-scanner.js';

import { validateCredentials, detectRequiredCredentials } from './credential-validator.js';

import {
    buildReferenceCheckPackage,
    buildReferenceQuestionnaire,
    summariseReferenceDebriefs,
} from './reference-check.js';
import type {
    ReferenceRequestInput,
    ReferenceQuestionnaireInput,
    ReferenceSummaryInput,
    ReferenceDebriefInput,
    ReferenceProvider,
    JobDomain,
} from './reference-check.js';

import {
    addToTalentPool,
    searchTalentPool,
    buildNurtureSequence,
    buildTalentPoolAnalytics,
} from './talent-pool.js';
import type {
    TalentPoolCandidate,
    TalentPoolSearchCriteria,
    NurtureSequenceInput,
    TalentPoolAnalyticsInput,
    TalentPoolSource,
    TalentPoolStatus,
    ReEngagementTrigger,
} from './talent-pool.js';

import { buildRequisitionSummary } from './requisition-approver.js';
import type { RequisitionInput, RequisitionType } from './requisition-approver.js';

import { buildOnboardingHandoff } from './onboarding-handoff.js';
import type { NewHireInput, Department } from './onboarding-handoff.js';

import { buildAssessmentBrief } from './candidate-assessment.js';
import type { AssessmentBriefInput, AssessmentType, AssessmentDomain } from './candidate-assessment.js';

import { buildJdComplianceBlock } from './jd-compliance-advisor.js';
import type { ComplianceAdvisoryInput, ComplianceIndustry, ComplianceRegion } from './jd-compliance-advisor.js';

import {
    assessRightToWork,
    assessIr35Status,
    buildGdprRecruitmentWorkflow,
    getMarketAdaptation,
} from './international-recruiting.js';
import type {
    RightToWorkInput,
    Ir35Input,
    GdprRecruitmentInput,
    MarketAdaptationInput,
    HiringCountry,
    CandidateStatus as IntlCandidateStatus,
    EngagementType,
} from './international-recruiting.js';

import {
    buildCareerFairPackage,
    bulkScreenCandidates,
    buildInternCohortReport,
    buildSeasonalBatchPlan,
    buildDefaultInternMilestones,
} from './campus-recruiting.js';
import type {
    CareerFairInput,
    FairType,
    InternOrFullTime,
    BulkCandidateInput,
    BulkScreenInput,
    InternCohortInput,
    InternSeason,
    Intern,
    InternMilestone,
    SeasonalBatchInput,
    HiringSeason,
    SeasonalIndustry,
    SeasonalRole,
} from './campus-recruiting.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecruiterActionType =
    | 'workspace_rec_build_jd'
    | 'workspace_rec_post_job'
    | 'workspace_rec_source_candidates'
    | 'workspace_rec_screen_resume'
    | 'workspace_rec_send_outreach'
    | 'workspace_rec_schedule_interview'
    | 'workspace_rec_conduct_phone_screen'
    | 'workspace_rec_gather_feedback'
    | 'workspace_rec_manage_pipeline'
    | 'workspace_rec_generate_offer'
    | 'workspace_rec_market_intelligence'
    | 'workspace_rec_request_human_gate'
    | 'workspace_rec_check_bgc'
    | 'workspace_rec_compose_rejection'
    | 'workspace_rec_negotiate_offer'
    | 'workspace_rec_scan_jd_bias'
    | 'workspace_rec_validate_credentials'
    | 'workspace_rec_run_reference_check'
    | 'workspace_rec_manage_talent_pool'
    | 'workspace_rec_approve_requisition'
    | 'workspace_rec_onboarding_handoff'
    | 'workspace_rec_run_assessment'
    | 'workspace_rec_advise_jd_compliance'
    | 'workspace_rec_international'
    | 'workspace_rec_campus_recruiting';

export function isRecruiterActionType(t: string): t is RecruiterActionType {
    return (
        t === 'workspace_rec_build_jd' ||
        t === 'workspace_rec_post_job' ||
        t === 'workspace_rec_source_candidates' ||
        t === 'workspace_rec_screen_resume' ||
        t === 'workspace_rec_send_outreach' ||
        t === 'workspace_rec_schedule_interview' ||
        t === 'workspace_rec_conduct_phone_screen' ||
        t === 'workspace_rec_gather_feedback' ||
        t === 'workspace_rec_manage_pipeline' ||
        t === 'workspace_rec_generate_offer' ||
        t === 'workspace_rec_market_intelligence' ||
        t === 'workspace_rec_request_human_gate' ||
        t === 'workspace_rec_check_bgc' ||
        t === 'workspace_rec_compose_rejection' ||
        t === 'workspace_rec_negotiate_offer' ||
        t === 'workspace_rec_scan_jd_bias' ||
        t === 'workspace_rec_validate_credentials' ||
        t === 'workspace_rec_run_reference_check' ||
        t === 'workspace_rec_manage_talent_pool' ||
        t === 'workspace_rec_approve_requisition' ||
        t === 'workspace_rec_onboarding_handoff' ||
        t === 'workspace_rec_run_assessment' ||
        t === 'workspace_rec_advise_jd_compliance' ||
        t === 'workspace_rec_international' ||
        t === 'workspace_rec_campus_recruiting'
    );
}

export interface RecruiterActionInput {
    actionType: RecruiterActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    workspaceDir: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function ok(output: string): LocalWorkspaceResult { return { ok: true, output }; }
function fail(msg: string): LocalWorkspaceResult { return { ok: false, output: msg }; }
function jsonOut(v: unknown): LocalWorkspaceResult { return ok(JSON.stringify(v, null, 2)); }
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback; }
function num(v: unknown, fallback: number): number { return typeof v === 'number' ? v : fallback; }
function strArr(v: unknown): string[] {
    return Array.isArray(v) ? v.map(x => String(x)) : typeof v === 'string' ? [v] : [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleRecruiterAction(
    input: RecruiterActionInput,
): Promise<LocalWorkspaceResult> {
    const { actionType, payload } = input;

    switch (actionType) {

        // ----------------------------------------------------------------
        // workspace_rec_build_jd
        // payload: RoleBrief fields
        // ----------------------------------------------------------------
        case 'workspace_rec_build_jd': {
            const title = str(payload['title']);
            const department = str(payload['department']);
            const location = str(payload['location']);
            const companyName = str(payload['companyName']);
            const responsibilities = strArr(payload['responsibilities']);
            const requiredQualifications = strArr(payload['requiredQualifications']);

            if (!title) return fail('payload.title is required');
            if (!department) return fail('payload.department is required');
            if (!location) return fail('payload.location is required');
            if (!companyName) return fail('payload.companyName is required');
            if (responsibilities.length === 0) return fail('payload.responsibilities array is required');
            if (requiredQualifications.length === 0) return fail('payload.requiredQualifications array is required');

            const brief: RoleBrief = {
                title,
                department,
                location,
                companyName,
                workArrangement: str(payload['workArrangement'], 'hybrid') as WorkArrangement,
                employmentType: str(payload['employmentType'], 'full_time') as EmploymentType,
                experienceLevel: str(payload['experienceLevel'], 'mid') as ExperienceLevel,
                responsibilities,
                requiredQualifications,
                hiringManagerName: typeof payload['hiringManagerName'] === 'string' ? payload['hiringManagerName'] : undefined,
                companyMission: typeof payload['companyMission'] === 'string' ? payload['companyMission'] : undefined,
                teamContext: typeof payload['teamContext'] === 'string' ? payload['teamContext'] : undefined,
                niceToHaveQualifications: Array.isArray(payload['niceToHaveQualifications']) ? strArr(payload['niceToHaveQualifications']) : undefined,
                salaryMin: typeof payload['salaryMin'] === 'number' ? payload['salaryMin'] : undefined,
                salaryMax: typeof payload['salaryMax'] === 'number' ? payload['salaryMax'] : undefined,
                salaryCurrency: typeof payload['salaryCurrency'] === 'string' ? payload['salaryCurrency'] : undefined,
                benefits: Array.isArray(payload['benefits']) ? strArr(payload['benefits']) : undefined,
                includeEeoStatement: typeof payload['includeEeoStatement'] === 'boolean' ? payload['includeEeoStatement'] : true,
            };

            return jsonOut(buildJobDescription(brief));
        }

        // ----------------------------------------------------------------
        // workspace_rec_post_job
        // HIGH-RISK — routes through human gate before publishing
        // payload: { jobTitle, targetPlatform, detail?, jdText? }
        // ----------------------------------------------------------------
        case 'workspace_rec_post_job': {
            const jobTitle = str(payload['jobTitle']);
            const targetPlatform = str(payload['targetPlatform'], 'LinkedIn / Indeed');
            if (!jobTitle) return fail('payload.jobTitle is required');

            const gateInput: RecruiterGateInput = {
                gateType: 'post_job_externally',
                jobTitle,
                targetPlatform,
                detail: typeof payload['detail'] === 'string' ? payload['detail'] : undefined,
            };
            const gate = buildRecruiterGateRecord(gateInput);
            return jsonOut({
                gateType: gate.gateType,
                riskLevel: gate.riskLevel,
                label: gate.label,
                question: gate.question,
                requiresApproverRole: gate.requiresApproverRole,
                approval_summary: buildRecruiterGateApprovalSummary(gate),
                impacted_scope: buildRecruiterGateImpactScope(gate),
                risk_reason: buildRecruiterGateRiskReason(gate),
                status: 'AWAITING_APPROVAL',
                instruction: 'Obtain approval from the required approver before posting. Once approved, use workspace_web_fill_form to submit the JD to the job board.',
            });
        }

        // ----------------------------------------------------------------
        // workspace_rec_source_candidates
        // payload: SourcingCriteria fields
        // ----------------------------------------------------------------
        case 'workspace_rec_source_candidates': {
            const jobTitle = str(payload['jobTitle']);
            const requiredSkills = strArr(payload['requiredSkills']);
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (requiredSkills.length === 0) return fail('payload.requiredSkills array is required');

            const criteria: SourcingCriteria = {
                jobTitle,
                department: str(payload['department'], 'General'),
                requiredSkills,
                niceToHaveSkills: Array.isArray(payload['niceToHaveSkills']) ? strArr(payload['niceToHaveSkills']) : undefined,
                minYearsExperience: typeof payload['minYearsExperience'] === 'number' ? payload['minYearsExperience'] : undefined,
                maxYearsExperience: typeof payload['maxYearsExperience'] === 'number' ? payload['maxYearsExperience'] : undefined,
                location: typeof payload['location'] === 'string' ? payload['location'] : undefined,
                remoteOk: typeof payload['remoteOk'] === 'boolean' ? payload['remoteOk'] : true,
                industries: Array.isArray(payload['industries']) ? strArr(payload['industries']) : undefined,
                excludeCompanies: Array.isArray(payload['excludeCompanies']) ? strArr(payload['excludeCompanies']) : undefined,
                limit: typeof payload['limit'] === 'number' ? payload['limit'] : 10,
                apolloApiKey: typeof payload['apolloApiKey'] === 'string' ? payload['apolloApiKey'] : undefined,
                hunterApiKey: typeof payload['hunterApiKey'] === 'string' ? payload['hunterApiKey'] : undefined,
                linkedInAccessToken: typeof payload['linkedInAccessToken'] === 'string' ? payload['linkedInAccessToken'] : undefined,
            };

            const result = await sourceCandidates(criteria);
            return result.ok ? jsonOut(result) : fail(result.errorMessage ?? 'Sourcing failed');
        }

        // ----------------------------------------------------------------
        // workspace_rec_screen_resume
        // payload: ResumeScreenInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_screen_resume': {
            const candidateName = str(payload['candidateName']);
            const resumeText = str(payload['resumeText']);
            const jobTitle = str(payload['jobTitle']);
            const requiredQualifications = strArr(payload['requiredQualifications']);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!resumeText) return fail('payload.resumeText is required (paste full resume text)');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (requiredQualifications.length === 0) return fail('payload.requiredQualifications array is required');

            const screenInput: ResumeScreenInput = {
                candidateName,
                resumeText,
                jobTitle,
                requiredQualifications,
                niceToHaveQualifications: Array.isArray(payload['niceToHaveQualifications']) ? strArr(payload['niceToHaveQualifications']) : undefined,
                minYearsExperience: typeof payload['minYearsExperience'] === 'number' ? payload['minYearsExperience'] : undefined,
                salaryExpectation: typeof payload['salaryExpectation'] === 'number' ? payload['salaryExpectation'] : undefined,
                salaryBudgetMax: typeof payload['salaryBudgetMax'] === 'number' ? payload['salaryBudgetMax'] : undefined,
                dealBreakerKeywords: Array.isArray(payload['dealBreakerKeywords']) ? strArr(payload['dealBreakerKeywords']) : undefined,
            };

            return jsonOut(screenResume(screenInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_send_outreach
        // payload: OutreachSpec fields + optional buildSequence flag
        // ----------------------------------------------------------------
        case 'workspace_rec_send_outreach': {
            const candidateName = str(payload['candidateName']);
            const recruiterName = str(payload['recruiterName']);
            const companyName = str(payload['companyName']);
            const roleTitle = str(payload['roleTitle']);
            const keyValueProp = str(payload['keyValueProp']);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!recruiterName) return fail('payload.recruiterName is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!roleTitle) return fail('payload.roleTitle is required');
            if (!keyValueProp) return fail('payload.keyValueProp is required (e.g. "building the AI-first data platform")');

            const spec: OutreachSpec = {
                candidateName,
                candidateCurrentTitle: str(payload['candidateCurrentTitle'], 'Professional'),
                candidateCurrentCompany: str(payload['candidateCurrentCompany'], 'their current company'),
                recruiterName,
                companyName,
                roleTitle,
                roleSeniority: str(payload['roleSeniority'], 'senior') as OutreachSpec['roleSeniority'],
                keyValueProp,
                workArrangement: str(payload['workArrangement'], 'hybrid') as OutreachSpec['workArrangement'],
                location: typeof payload['location'] === 'string' ? payload['location'] : undefined,
                candidateStatus: str(payload['candidateStatus'], 'passive') as CandidateStatus,
                channel: str(payload['channel'], 'email') as OutreachChannel,
                followUpStep: typeof payload['followUpStep'] === 'number' ? payload['followUpStep'] as OutreachSpec['followUpStep'] : undefined,
                specificHook: typeof payload['specificHook'] === 'string' ? payload['specificHook'] : undefined,
                calendarLink: typeof payload['calendarLink'] === 'string' ? payload['calendarLink'] : undefined,
            };

            const buildSequence = payload['buildSequence'] === true;
            return buildSequence
                ? jsonOut(buildOutreachSequence(spec))
                : jsonOut(composeOutreach(spec));
        }

        // ----------------------------------------------------------------
        // workspace_rec_schedule_interview
        // payload: ScheduleInterviewInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_schedule_interview': {
            const candidateName = str(payload['candidateName']);
            const candidateEmail = str(payload['candidateEmail']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const recruiterEmail = str(payload['recruiterEmail']);
            const interviewers = payload['interviewers'] as Interviewer[] | undefined;
            const proposedSlots = payload['proposedSlots'] as InterviewSlot[] | undefined;

            if (!candidateName) return fail('payload.candidateName is required');
            if (!candidateEmail) return fail('payload.candidateEmail is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!recruiterName) return fail('payload.recruiterName is required');
            if (!recruiterEmail) return fail('payload.recruiterEmail is required');
            if (!interviewers || interviewers.length === 0) return fail('payload.interviewers array is required');
            if (!proposedSlots || proposedSlots.length === 0) return fail('payload.proposedSlots array is required (each with date, startTime, endTime, timezone)');

            const schedInput: ScheduleInterviewInput = {
                candidateName,
                candidateEmail,
                jobTitle,
                companyName,
                recruiterName,
                recruiterEmail,
                interviewers,
                proposedSlots,
                stage: str(payload['stage'], 'phone_screen') as InterviewStage,
                format: str(payload['format'], 'video_call') as InterviewFormat,
                durationMinutes: num(payload['durationMinutes'], 30),
                videoLink: typeof payload['videoLink'] === 'string' ? payload['videoLink'] : undefined,
                officeAddress: typeof payload['officeAddress'] === 'string' ? payload['officeAddress'] : undefined,
                calendarLink: typeof payload['calendarLink'] === 'string' ? payload['calendarLink'] : undefined,
                jobDescriptionUrl: typeof payload['jobDescriptionUrl'] === 'string' ? payload['jobDescriptionUrl'] : undefined,
                companyValuesUrl: typeof payload['companyValuesUrl'] === 'string' ? payload['companyValuesUrl'] : undefined,
            };

            return jsonOut(scheduleInterview(schedInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_conduct_phone_screen
        // payload: PhoneScreenInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_conduct_phone_screen': {
            const candidateName = str(payload['candidateName']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const requiredSkills = strArr(payload['requiredSkills']);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!recruiterName) return fail('payload.recruiterName is required');
            if (requiredSkills.length === 0) return fail('payload.requiredSkills array is required');

            const screenInput: PhoneScreenInput = {
                candidateName,
                jobTitle,
                companyName,
                recruiterName,
                requiredSkills,
                salaryBudget: typeof payload['salaryBudgetMin'] === 'number' && typeof payload['salaryBudgetMax'] === 'number'
                    ? { min: payload['salaryBudgetMin'], max: payload['salaryBudgetMax'], currency: str(payload['currency'], 'USD') }
                    : undefined,
                dealBreakerChecks: Array.isArray(payload['dealBreakerChecks']) ? strArr(payload['dealBreakerChecks']) : undefined,
                durationMinutes: typeof payload['durationMinutes'] === 'number' ? payload['durationMinutes'] : 20,
                nextInterviewStage: typeof payload['nextInterviewStage'] === 'string' ? payload['nextInterviewStage'] : undefined,
                interviewerNames: Array.isArray(payload['interviewerNames']) ? strArr(payload['interviewerNames']) : undefined,
            };

            return jsonOut(buildPhoneScreenGuide(screenInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_gather_feedback
        // payload: FeedbackCollectorInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_gather_feedback': {
            const candidateName = str(payload['candidateName']);
            const jobTitle = str(payload['jobTitle']);
            const feedbacks = payload['feedbacks'] as InterviewerFeedback[] | undefined;

            if (!candidateName) return fail('payload.candidateName is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!feedbacks) return fail('payload.feedbacks array is required (can be empty to get a chase-up report)');

            const collectorInput: FeedbackCollectorInput = {
                candidateName,
                jobTitle,
                feedbacks: feedbacks.map(f => ({
                    interviewerName: str(f.interviewerName),
                    interviewerTitle: str(f.interviewerTitle, 'Interviewer'),
                    interviewStage: str(f.interviewStage, 'interview'),
                    rating: (f.rating ?? 'neutral') as FeedbackRating,
                    competencyScores: f.competencyScores,
                    strengths: Array.isArray(f.strengths) ? f.strengths.map(String) : [],
                    concerns: Array.isArray(f.concerns) ? f.concerns.map(String) : [],
                    additionalNotes: typeof f.additionalNotes === 'string' ? f.additionalNotes : undefined,
                    submittedAt: typeof f.submittedAt === 'string' ? f.submittedAt : undefined,
                })),
                hiringManagerName: typeof payload['hiringManagerName'] === 'string' ? payload['hiringManagerName'] : undefined,
                salaryExpectation: typeof payload['salaryExpectation'] === 'number' ? payload['salaryExpectation'] : undefined,
                salaryBudgetMax: typeof payload['salaryBudgetMax'] === 'number' ? payload['salaryBudgetMax'] : undefined,
                targetStartDate: typeof payload['targetStartDate'] === 'string' ? payload['targetStartDate'] : undefined,
            };

            return jsonOut(collectAndSummariseFeedback(collectorInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_manage_pipeline
        // payload: PipelineReportInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_manage_pipeline': {
            const jobTitle = str(payload['jobTitle']);
            const recruiterName = str(payload['recruiterName']);
            const candidates = payload['candidates'] as PipelineCandidate[] | undefined;

            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!recruiterName) return fail('payload.recruiterName is required');
            if (!candidates) return fail('payload.candidates array is required');

            const pipelineInput: PipelineReportInput = {
                jobTitle,
                recruiterName,
                candidates: candidates.map(c => ({
                    id: str(c.id, `cand-${Math.random().toString(36).slice(2, 6)}`),
                    fullName: str(c.fullName, 'Unknown'),
                    currentStage: (c.currentStage ?? 'sourced') as PipelineStage,
                    jobTitle: str(c.jobTitle ?? jobTitle),
                    lastActivityDate: str(c.lastActivityDate, new Date().toISOString().split('T')[0] ?? ''),
                    nextAction: typeof c.nextAction === 'string' ? c.nextAction : undefined,
                    nextActionDueDate: typeof c.nextActionDueDate === 'string' ? c.nextActionDueDate : undefined,
                    salaryExpectation: typeof c.salaryExpectation === 'number' ? c.salaryExpectation : undefined,
                    notes: typeof c.notes === 'string' ? c.notes : undefined,
                })),
                jobId: typeof payload['jobId'] === 'string' ? payload['jobId'] : undefined,
                hiringManagerName: typeof payload['hiringManagerName'] === 'string' ? payload['hiringManagerName'] : undefined,
                targetStartDate: typeof payload['targetStartDate'] === 'string' ? payload['targetStartDate'] : undefined,
                targetHireDate: typeof payload['targetHireDate'] === 'string' ? payload['targetHireDate'] : undefined,
                openSince: typeof payload['openSince'] === 'string' ? payload['openSince'] : undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
            };

            return jsonOut(buildPipelineReport(pipelineInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_generate_offer
        // HIGH-RISK — routes through human gate before sending
        // payload: OfferInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_generate_offer': {
            const candidateName = str(payload['candidateName']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const hiringManagerName = str(payload['hiringManagerName']);
            const department = str(payload['department']);
            const startDate = str(payload['startDate']);
            const compensationRaw = payload['compensation'] as Partial<CompensationPackage> | undefined;

            if (!candidateName) return fail('payload.candidateName is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!hiringManagerName) return fail('payload.hiringManagerName is required');
            if (!department) return fail('payload.department is required');
            if (!startDate) return fail('payload.startDate is required (YYYY-MM-DD)');
            if (!compensationRaw?.baseSalary) return fail('payload.compensation.baseSalary is required');

            const compensation: CompensationPackage = {
                baseSalary: compensationRaw.baseSalary,
                currency: compensationRaw.currency ?? 'USD',
                payFrequency: (compensationRaw.payFrequency ?? 'annual') as PayFrequency,
                signingBonus: compensationRaw.signingBonus,
                targetBonus: compensationRaw.targetBonus,
                equityGrant: compensationRaw.equityGrant,
                probationPeriod: compensationRaw.probationPeriod,
            };

            const offerInput: OfferInput = {
                candidateName,
                jobTitle,
                companyName,
                hiringManagerName,
                department,
                startDate,
                compensation,
                offerType: str(payload['offerType'], 'full_time') as OfferType,
                workArrangement: str(payload['workArrangement'], 'hybrid') as OfferInput['workArrangement'],
                officeLocation: typeof payload['officeLocation'] === 'string' ? payload['officeLocation'] : undefined,
                companyAddress: typeof payload['companyAddress'] === 'string' ? payload['companyAddress'] : undefined,
                reportingTo: typeof payload['reportingTo'] === 'string' ? payload['reportingTo'] : undefined,
                benefits: Array.isArray(payload['benefits']) ? strArr(payload['benefits']) : undefined,
                conditions: Array.isArray(payload['conditions']) ? strArr(payload['conditions']) : undefined,
                offerExpiryDate: typeof payload['offerExpiryDate'] === 'string' ? payload['offerExpiryDate'] : undefined,
                hrSignatoryName: typeof payload['hrSignatoryName'] === 'string' ? payload['hrSignatoryName'] : undefined,
                hrSignatoryTitle: typeof payload['hrSignatoryTitle'] === 'string' ? payload['hrSignatoryTitle'] : undefined,
                approvedBudgetMax: typeof payload['approvedBudgetMax'] === 'number' ? payload['approvedBudgetMax'] : undefined,
            };

            const offerResult = generateOffer(offerInput);

            // If over budget, wrap in a human gate before returning
            if (!offerResult.validation.withinBudget) {
                const gateInput: RecruiterGateInput = {
                    gateType: 'extend_offer_above_budget',
                    jobTitle,
                    candidateName,
                    offerAmount: compensation.baseSalary,
                    currency: compensation.currency,
                    approvedBudgetMax: offerInput.approvedBudgetMax,
                };
                const gate = buildRecruiterGateRecord(gateInput);
                return jsonOut({
                    status: 'BLOCKED_PENDING_APPROVAL',
                    gate: {
                        gateType: gate.gateType,
                        riskLevel: gate.riskLevel,
                        question: gate.question,
                        requiresApproverRole: gate.requiresApproverRole,
                        approval_summary: buildRecruiterGateApprovalSummary(gate),
                        impacted_scope: buildRecruiterGateImpactScope(gate),
                        risk_reason: buildRecruiterGateRiskReason(gate),
                    },
                    offerDraft: offerResult,
                });
            }

            return jsonOut(offerResult);
        }

        // ----------------------------------------------------------------
        // workspace_rec_market_intelligence
        // payload: MarketIntelInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_market_intelligence': {
            const jobTitle = str(payload['jobTitle']);
            const location = str(payload['location']);
            const department = str(payload['department'], 'General');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!location) return fail('payload.location is required');

            const miInput: MarketIntelInput = {
                jobTitle,
                location,
                department,
                seniorityBand: str(payload['seniorityBand'], 'mid') as SeniorityBand,
                remoteOk: typeof payload['remoteOk'] === 'boolean' ? payload['remoteOk'] : false,
                industry: typeof payload['industry'] === 'string' ? payload['industry'] : undefined,
                companySize: typeof payload['companySize'] === 'string'
                    ? payload['companySize'] as MarketIntelInput['companySize']
                    : undefined,
                skills: Array.isArray(payload['skills']) ? strArr(payload['skills']) : undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
                competitorCompanies: Array.isArray(payload['competitorCompanies']) ? strArr(payload['competitorCompanies']) : undefined,
            };

            return jsonOut(generateMarketIntelReport(miInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_request_human_gate
        // payload: RecruiterGateInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_request_human_gate': {
            const rawGateType = str(payload['gateType']);
            const jobTitle = str(payload['jobTitle']);
            if (!rawGateType) return fail('payload.gateType is required');
            if (!isRecruiterGateType(rawGateType)) return fail(`Unknown recruiter gate type: ${rawGateType}`);
            if (!jobTitle) return fail('payload.jobTitle is required');

            const gateInput: RecruiterGateInput = {
                gateType: rawGateType,
                jobTitle,
                candidateName: typeof payload['candidateName'] === 'string' ? payload['candidateName'] : undefined,
                detail: typeof payload['detail'] === 'string' ? payload['detail'] : undefined,
                offerAmount: typeof payload['offerAmount'] === 'number' ? payload['offerAmount'] : undefined,
                currency: typeof payload['currency'] === 'string' ? payload['currency'] : undefined,
                approvedBudgetMax: typeof payload['approvedBudgetMax'] === 'number' ? payload['approvedBudgetMax'] : undefined,
                candidateCount: typeof payload['candidateCount'] === 'number' ? payload['candidateCount'] : undefined,
                targetPlatform: typeof payload['targetPlatform'] === 'string' ? payload['targetPlatform'] : undefined,
            };

            const gate = buildRecruiterGateRecord(gateInput);
            return jsonOut({
                gateType: gate.gateType,
                riskLevel: gate.riskLevel,
                label: gate.label,
                question: gate.question,
                requiresApproverRole: gate.requiresApproverRole,
                approval_summary: buildRecruiterGateApprovalSummary(gate),
                impacted_scope: buildRecruiterGateImpactScope(gate),
                risk_reason: buildRecruiterGateRiskReason(gate),
            });
        }

        // ----------------------------------------------------------------
        // workspace_rec_check_bgc
        // HIGH-RISK — FCRA-regulated action
        // payload: BgcWorkflowInput fields | { mode: 'adverse_action', ... }
        // ----------------------------------------------------------------
        case 'workspace_rec_check_bgc': {
            const mode = str(payload['mode'], 'initiate');

            if (mode === 'adverse_action') {
                const candidateName = str(payload['candidateName']);
                const jobTitle = str(payload['jobTitle']);
                const companyName = str(payload['companyName']);
                const recruiterName = str(payload['recruiterName']);
                const recruiterEmail = str(payload['recruiterEmail']);
                const adverseFindings = strArr(payload['adverseFindings']);

                if (!candidateName) return fail('payload.candidateName is required');
                if (!jobTitle) return fail('payload.jobTitle is required');
                if (!companyName) return fail('payload.companyName is required');
                if (adverseFindings.length === 0) return fail('payload.adverseFindings array is required');

                const aaInput: AdverseActionInput = {
                    candidateName,
                    jobTitle,
                    companyName,
                    candidateAddress: typeof payload['candidateAddress'] === 'string' ? payload['candidateAddress'] : undefined,
                    hrSignatoryName: typeof payload['hrSignatoryName'] === 'string' ? payload['hrSignatoryName'] : undefined,
                    adverseFindings,
                    actionType: str(payload['actionType'], 'pre_adverse') as AdverseActionInput['actionType'],
                    bgcProviderName: str(payload['bgcProviderName'], '[BGC Provider Name]'),
                    bgcProviderContact: str(payload['bgcProviderContact'], '[BGC Provider Contact]'),
                    preAdverseDate: typeof payload['preAdverseDate'] === 'string' ? payload['preAdverseDate'] : undefined,
                };
                return jsonOut(buildAdverseAction(aaInput));
            }

            // Default: initiate BGC workflow
            const candidateName = str(payload['candidateName']);
            const candidateEmail = str(payload['candidateEmail']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const recruiterEmail = str(payload['recruiterEmail']);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!candidateEmail) return fail('payload.candidateEmail is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!companyName) return fail('payload.companyName is required');

            const bgcInput: BgcInitiateInput = {
                candidateName,
                candidateEmail,
                jobTitle,
                companyName,
                recruiterName: recruiterName ?? '',
                recruiterEmail: recruiterEmail ?? '',
                bgcPackage: str(payload['bgcPackage'] ?? payload['packageId'], 'standard') as BgcPackage,
                bgcProvider: typeof payload['bgcProvider'] === 'string' ? payload['bgcProvider'] as BgcProvider : undefined,
                stateOfHire: typeof payload['stateOfHire'] === 'string' ? payload['stateOfHire'] : undefined,
                countryOfHire: typeof payload['countryOfHire'] === 'string' ? payload['countryOfHire'] : undefined,
            };
            return jsonOut(initiateBgcWorkflow(bgcInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_compose_rejection
        // payload: RejectionInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_compose_rejection': {
            const candidateName = str(payload['candidateName']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const stage = str(payload['stage']) as RejectionStage;

            if (!candidateName) return fail('payload.candidateName is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!recruiterName) return fail('payload.recruiterName is required');
            if (!stage) return fail('payload.stage is required (application_ack | post_screen_reject | post_interview_reject | final_round_reject | offer_declined_response | talent_pool_add)');

            const rejInput: RejectionInput = {
                candidateName,
                jobTitle,
                companyName,
                recruiterName,
                stage,
                recruiterEmail: typeof payload['recruiterEmail'] === 'string' ? payload['recruiterEmail'] : undefined,
                tone: typeof payload['tone'] === 'string' ? payload['tone'] as RejectionTone : undefined,
                specificFeedback: typeof payload['specificFeedback'] === 'string' ? payload['specificFeedback'] : undefined,
                talentPoolInvite: typeof payload['talentPoolInvite'] === 'boolean' ? payload['talentPoolInvite'] : undefined,
                futureRoleHint: typeof payload['futureRoleHint'] === 'string' ? payload['futureRoleHint'] : undefined,
                interviewerNames: Array.isArray(payload['interviewerNames']) ? strArr(payload['interviewerNames']) : undefined,
                alternativeRoleUrl: typeof payload['alternativeRoleUrl'] === 'string' ? payload['alternativeRoleUrl'] : undefined,
                companyCareerPageUrl: typeof payload['companyCareerPageUrl'] === 'string' ? payload['companyCareerPageUrl'] : undefined,
            };

            return jsonOut(composeRejection(rejInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_negotiate_offer
        // payload: { mode: 'verbal_script'|'total_comp'|'counter_eval'|'decline_save', ...fields }
        // ----------------------------------------------------------------
        case 'workspace_rec_negotiate_offer': {
            const mode = str(payload['mode'], 'counter_eval');

            if (mode === 'verbal_script') {
                const candidateName = str(payload['candidateName']);
                const jobTitle = str(payload['jobTitle']);
                const companyName = str(payload['companyName']);
                const recruiterName = str(payload['recruiterName']);
                const baseSalary = num(payload['baseSalary'], 0);
                const currency = str(payload['currency'], 'USD');
                const startDate = str(payload['startDate']);

                if (!candidateName) return fail('payload.candidateName is required');
                if (!baseSalary) return fail('payload.baseSalary is required');
                if (!startDate) return fail('payload.startDate is required');

                const voInput: VerbalOfferInput = {
                    candidateName,
                    jobTitle: jobTitle || 'the role',
                    companyName: companyName || 'the company',
                    recruiterName: recruiterName || 'the recruiter',
                    baseSalary,
                    currency,
                    startDate,
                    workArrangement: str(payload['workArrangement'], 'hybrid') as VerbalOfferInput['workArrangement'],
                    targetBonus: typeof payload['targetBonus'] === 'number' ? payload['targetBonus'] : undefined,
                    signingBonus: typeof payload['signingBonus'] === 'number' ? payload['signingBonus'] : undefined,
                    equitySummary: typeof payload['equitySummary'] === 'string' ? payload['equitySummary'] : undefined,
                    offerExpiryDate: typeof payload['offerExpiryDate'] === 'string' ? payload['offerExpiryDate'] : undefined,
                    keyBenefits: Array.isArray(payload['keyBenefits']) ? strArr(payload['keyBenefits']) : undefined,
                };
                return ok(buildVerbalOfferScript(voInput));
            }

            if (mode === 'total_comp') {
                const baseSalary = num(payload['baseSalary'], 0);
                if (!baseSalary) return fail('payload.baseSalary is required');
                const tcInput: TotalCompInput = {
                    baseSalary,
                    currency: str(payload['currency'], 'USD'),
                    employerLabel: str(payload['employerLabel'], 'Company'),
                    targetBonusPct: typeof payload['targetBonusPct'] === 'number' ? payload['targetBonusPct'] : undefined,
                    signingBonus: typeof payload['signingBonus'] === 'number' ? payload['signingBonus'] : undefined,
                    equityValue: typeof payload['equityValue'] === 'number' ? payload['equityValue'] : undefined,
                    equityVestingYears: typeof payload['equityVestingYears'] === 'number' ? payload['equityVestingYears'] : undefined,
                    annualBenefitsValue: typeof payload['annualBenefitsValue'] === 'number' ? payload['annualBenefitsValue'] : undefined,
                    ptoWeeks: typeof payload['ptoWeeks'] === 'number' ? payload['ptoWeeks'] : undefined,
                };
                return jsonOut(modelTotalComp(tcInput));
            }

            if (mode === 'decline_save') {
                const candidateName = str(payload['candidateName']);
                const jobTitle = str(payload['jobTitle']);
                if (!candidateName) return fail('payload.candidateName is required');
                return ok(buildDeclineSaveScript(
                    candidateName,
                    jobTitle || 'the role',
                    typeof payload['declineReason'] === 'string' ? payload['declineReason'] : undefined,
                ));
            }

            // Default: counter_eval
            const candidateName = str(payload['candidateName']);
            const currentOfferBase = num(payload['currentOfferBase'], 0);
            const candidateCounterBase = num(payload['candidateCounterBase'], 0);
            const approvedBudgetMax = num(payload['approvedBudgetMax'], 0);
            const currentBandMax = num(payload['currentBandMax'], 0);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!currentOfferBase) return fail('payload.currentOfferBase is required');
            if (!candidateCounterBase) return fail('payload.candidateCounterBase is required');
            if (!approvedBudgetMax) return fail('payload.approvedBudgetMax is required');
            if (!currentBandMax) return fail('payload.currentBandMax is required');

            const coInput: CounterOfferInput = {
                candidateName,
                jobTitle: str(payload['jobTitle'], 'the role'),
                companyName: str(payload['companyName'], 'the company'),
                currentOfferBase,
                candidateCounterBase,
                currency: str(payload['currency'], 'USD'),
                approvedBudgetMax,
                currentBandMax,
                peersAtSameLevel: typeof payload['peersAtSameLevel'] === 'number' ? payload['peersAtSameLevel'] : undefined,
                currentBonusTarget: typeof payload['currentBonusTarget'] === 'number' ? payload['currentBonusTarget'] : undefined,
                currentSigningBonus: typeof payload['currentSigningBonus'] === 'number' ? payload['currentSigningBonus'] : undefined,
                canIncreaseSigningBonus: typeof payload['canIncreaseSigningBonus'] === 'boolean' ? payload['canIncreaseSigningBonus'] : undefined,
                signingBonusHeadroom: typeof payload['signingBonusHeadroom'] === 'number' ? payload['signingBonusHeadroom'] : undefined,
                canIncreaseBonus: typeof payload['canIncreaseBonus'] === 'boolean' ? payload['canIncreaseBonus'] : undefined,
                bonusTargetHeadroom: typeof payload['bonusTargetHeadroom'] === 'number' ? payload['bonusTargetHeadroom'] : undefined,
            };
            return jsonOut(evaluateCounterOffer(coInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_scan_jd_bias
        // payload: { mode: 'scan'|'funnel', jdText?, ...JdBiasScanInput|DeiFunnelInput }
        // ----------------------------------------------------------------
        case 'workspace_rec_scan_jd_bias': {
            const mode = str(payload['mode'], 'scan');

            if (mode === 'funnel') {
                const jobTitle = str(payload['jobTitle']);
                const stagesRaw = payload['stages'];
                if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
                    return fail('payload.stages array is required for funnel mode (each with stageName and candidateCount)');
                }
                const funnelInput: DeiFunnelInput = {
                    jobTitle: jobTitle || 'the role',
                    stages: stagesRaw.map((s: Record<string, unknown>) => ({
                        stageName: str(s['stageName'], 'Stage'),
                        totalCandidates: num(s['totalCandidates'] ?? s['candidateCount'], 0),
                        diversityCandidates: num(
                            s['diversityCandidates'] ?? s['femaleCount'] ?? s['nonWhiteCount'] ?? s['underrepresentedCount'],
                            0,
                        ),
                        diversityCategory: typeof s['diversityCategory'] === 'string' ? s['diversityCategory']
                            : s['femaleCount'] != null ? 'women'
                            : s['nonWhiteCount'] != null ? 'non-white'
                            : s['underrepresentedCount'] != null ? 'underrepresented'
                            : undefined,
                    })),
                    industryBenchmark: typeof payload['industryBenchmark'] === 'object' && payload['industryBenchmark'] !== null
                        ? payload['industryBenchmark'] as Record<string, number>
                        : undefined,
                };
                return jsonOut(buildDeiFunnelReport(funnelInput));
            }

            // Default: JD bias scan
            const jdText = str(payload['jdText'] ?? payload['jobDescriptionText']);
            if (!jdText) return fail('payload.jdText (job description text) is required');

            const scanInput: JdBiasScanInput = {
                jobDescriptionText: jdText,
                jobTitle: typeof payload['jobTitle'] === 'string' ? payload['jobTitle'] : undefined,
                targetInclusionScore: typeof payload['targetInclusionScore'] === 'number' ? payload['targetInclusionScore'] : undefined,
            };
            return jsonOut(scanJobDescriptionForBias(scanInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_validate_credentials
        // payload: { resumeText, jobTitle, industry?, bonusCredentialIds? }
        // ----------------------------------------------------------------
        case 'workspace_rec_validate_credentials': {
            const resumeText = str(payload['resumeText']);
            const jobTitle = str(payload['jobTitle']);
            if (!resumeText) return fail('payload.resumeText is required');
            if (!jobTitle) return fail('payload.jobTitle is required');

            const industry = str(payload['industry'], '');
            const requiredIds = detectRequiredCredentials(jobTitle, industry);
            const bonusIds = Array.isArray(payload['bonusCredentialIds']) ? strArr(payload['bonusCredentialIds']) : undefined;
            const result = validateCredentials(resumeText, requiredIds, bonusIds);
            return jsonOut({ detectedRequiredIds: requiredIds, ...result });
        }

        // ----------------------------------------------------------------
        // workspace_rec_run_reference_check
        // payload: { mode: 'package'|'questionnaire'|'summary', ...fields }
        // ----------------------------------------------------------------
        case 'workspace_rec_run_reference_check': {
            const mode = str(payload['mode'], 'package');

            if (mode === 'questionnaire') {
                const candidateName = str(payload['candidateName']);
                const jobTitle = str(payload['jobTitle']);
                if (!candidateName) return fail('payload.candidateName is required');
                if (!jobTitle) return fail('payload.jobTitle is required');

                const refProvider = payload['referenceProvider'] as ReferenceProvider | undefined;
                if (!refProvider) return fail('payload.referenceProvider is required');

                const qInput: ReferenceQuestionnaireInput = {
                    candidateName,
                    jobTitle,
                    companyName: str(payload['companyName'], 'the company'),
                    jobDomain: str(payload['jobDomain'], 'general') as JobDomain,
                    referenceProvider: refProvider,
                    specificAreasToProbe: Array.isArray(payload['specificAreasToProbe']) ? strArr(payload['specificAreasToProbe']) : undefined,
                };
                return jsonOut(buildReferenceQuestionnaire(qInput));
            }

            if (mode === 'summary') {
                const candidateName = str(payload['candidateName']);
                const jobTitle = str(payload['jobTitle']);
                const debriefs = payload['debriefs'] as ReferenceDebriefInput[] | undefined;
                if (!candidateName) return fail('payload.candidateName is required');
                if (!debriefs || debriefs.length === 0) return fail('payload.debriefs array is required');

                const sumInput: ReferenceSummaryInput = { candidateName, jobTitle, debriefs };
                return ok(summariseReferenceDebriefs(sumInput));
            }

            // Default: full reference package
            const candidateName = str(payload['candidateName']);
            const jobTitle = str(payload['jobTitle']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const recruiterEmail = str(payload['recruiterEmail']);
            const references = payload['references'] as ReferenceProvider[] | undefined;

            if (!candidateName) return fail('payload.candidateName is required');
            if (!companyName) return fail('payload.companyName is required');
            if (!recruiterEmail) return fail('payload.recruiterEmail is required');
            if (!references || references.length === 0) return fail('payload.references array is required');

            const refInput: ReferenceRequestInput = {
                candidateName,
                jobTitle: jobTitle || 'the role',
                companyName,
                recruiterName: recruiterName || 'the recruiter',
                recruiterEmail,
                references,
                referenceDeadline: typeof payload['referenceDeadline'] === 'string' ? payload['referenceDeadline'] : undefined,
                calendarLink: typeof payload['calendarLink'] === 'string' ? payload['calendarLink'] : undefined,
            };
            return jsonOut(buildReferenceCheckPackage(refInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_manage_talent_pool
        // payload: { mode: 'add'|'search'|'nurture'|'analytics', ...fields }
        // ----------------------------------------------------------------
        case 'workspace_rec_manage_talent_pool': {
            const mode = str(payload['mode'], 'search');

            if (mode === 'add') {
                const candidate = payload['candidate'] as Omit<TalentPoolCandidate, 'id' | 'addedDate'> | undefined;
                if (!candidate) return fail('payload.candidate object is required');
                return jsonOut(addToTalentPool(candidate));
            }

            if (mode === 'nurture') {
                const candidate = payload['candidate'] as TalentPoolCandidate | undefined;
                if (!candidate) return fail('payload.candidate object is required');
                const nInput: NurtureSequenceInput = {
                    candidate,
                    recruiterName: str(payload['recruiterName'], 'the recruiter'),
                    companyName: str(payload['companyName'], 'the company'),
                    triggerType: str(payload['triggerType'], 'scheduled_nurture') as ReEngagementTrigger,
                    openRoleTitle: typeof payload['openRoleTitle'] === 'string' ? payload['openRoleTitle'] : undefined,
                    openRoleUrl: typeof payload['openRoleUrl'] === 'string' ? payload['openRoleUrl'] : undefined,
                    contentShareUrl: typeof payload['contentShareUrl'] === 'string' ? payload['contentShareUrl'] : undefined,
                    contentShareTitle: typeof payload['contentShareTitle'] === 'string' ? payload['contentShareTitle'] : undefined,
                    referralRoleTitle: typeof payload['referralRoleTitle'] === 'string' ? payload['referralRoleTitle'] : undefined,
                    marketEventContext: typeof payload['marketEventContext'] === 'string' ? payload['marketEventContext'] : undefined,
                };
                return jsonOut(buildNurtureSequence(nInput));
            }

            if (mode === 'analytics') {
                const pool = payload['pool'] as TalentPoolCandidate[] | undefined;
                if (!pool) return fail('payload.pool array is required');
                const analyticsInput: TalentPoolAnalyticsInput = {
                    pool,
                    companyName: str(payload['companyName'], 'the company'),
                    openRequisitionCount: typeof payload['openRequisitionCount'] === 'number' ? payload['openRequisitionCount'] : undefined,
                };
                return jsonOut(buildTalentPoolAnalytics(analyticsInput));
            }

            // Default: search
            const pool = payload['pool'] as TalentPoolCandidate[] | undefined;
            const criteria = payload['criteria'] as TalentPoolSearchCriteria | undefined;
            if (!pool) return fail('payload.pool array is required');
            if (!criteria) return fail('payload.criteria object is required');
            return jsonOut(searchTalentPool(pool, criteria));
        }

        // ----------------------------------------------------------------
        // workspace_rec_approve_requisition
        // HIGH-RISK — triggers multi-level spend approval
        // payload: RequisitionInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_approve_requisition': {
            const jobTitle = str(payload['jobTitle']);
            const department = str(payload['department']);
            const hiringManagerName = str(payload['hiringManagerName']);
            const hiringManagerEmail = str(payload['hiringManagerEmail']);
            const baseSalaryBudget = num(payload['baseSalaryBudget'], 0);
            const businessJustification = str(payload['businessJustification']);

            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!department) return fail('payload.department is required');
            if (!hiringManagerName) return fail('payload.hiringManagerName is required');
            if (!hiringManagerEmail) return fail('payload.hiringManagerEmail is required');
            if (!baseSalaryBudget) return fail('payload.baseSalaryBudget is required');
            if (!businessJustification) return fail('payload.businessJustification is required (min 20 chars)');

            const reqInput: RequisitionInput = {
                jobTitle,
                department,
                hiringManagerName,
                hiringManagerEmail,
                baseSalaryBudget,
                businessJustification,
                requisitionType: str(payload['requisitionType'], 'new_headcount') as RequisitionType,
                headcountPlanApproved: typeof payload['headcountPlanApproved'] === 'boolean' ? payload['headcountPlanApproved'] : false,
                targetStartDate: str(payload['targetStartDate'], new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]!),
                employmentType: str(payload['employmentType'], 'full_time') as RequisitionInput['employmentType'],
                workArrangement: str(payload['workArrangement'], 'hybrid') as RequisitionInput['workArrangement'],
                seniorityLevel: str(payload['seniorityLevel'], 'mid') as RequisitionInput['seniorityLevel'],
                currency: str(payload['currency'], 'USD'),
                headcount: num(payload['headcount'], 1),
                urgencyLevel: str(payload['urgencyLevel'], 'standard') as RequisitionInput['urgencyLevel'],
                companyName: str(payload['companyName'], 'the company'),
                recruiterName: str(payload['recruiterName'], 'the recruiter'),
                recruiterEmail: str(payload['recruiterEmail'], ''),
                totalCompBudget: typeof payload['totalCompBudget'] === 'number' ? payload['totalCompBudget'] : undefined,
                backfillForEmployee: typeof payload['backfillForEmployee'] === 'string' ? payload['backfillForEmployee'] : undefined,
                hrBpName: typeof payload['hrBpName'] === 'string' ? payload['hrBpName'] : undefined,
                financeBpName: typeof payload['financeBpName'] === 'string' ? payload['financeBpName'] : undefined,
                chroName: typeof payload['chroName'] === 'string' ? payload['chroName'] : undefined,
                ceoName: typeof payload['ceoName'] === 'string' ? payload['ceoName'] : undefined,
            };

            return jsonOut(buildRequisitionSummary(reqInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_onboarding_handoff
        // payload: NewHireInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_onboarding_handoff': {
            const candidateName = str(payload['candidateName']);
            const candidateEmail = str(payload['candidateEmail']);
            const jobTitle = str(payload['jobTitle']);
            const hiringManagerName = str(payload['hiringManagerName']);
            const hiringManagerEmail = str(payload['hiringManagerEmail']);
            const startDate = str(payload['startDate']);
            const companyName = str(payload['companyName']);
            const recruiterName = str(payload['recruiterName']);
            const recruiterEmail = str(payload['recruiterEmail']);

            if (!candidateName) return fail('payload.candidateName is required');
            if (!candidateEmail) return fail('payload.candidateEmail is required');
            if (!jobTitle) return fail('payload.jobTitle is required');
            if (!hiringManagerName) return fail('payload.hiringManagerName is required');
            if (!hiringManagerEmail) return fail('payload.hiringManagerEmail is required');
            if (!startDate) return fail('payload.startDate is required (YYYY-MM-DD)');
            if (!companyName) return fail('payload.companyName is required');

            const onboardInput: NewHireInput = {
                candidateName,
                candidateEmail,
                jobTitle,
                hiringManagerName,
                hiringManagerEmail,
                startDate,
                companyName,
                recruiterName: recruiterName || 'the recruiter',
                recruiterEmail: recruiterEmail || '',
                department: str(payload['department'], 'other') as Department,
                workArrangement: str(payload['workArrangement'], 'hybrid') as NewHireInput['workArrangement'],
                employmentType: str(payload['employmentType'], 'full_time') as NewHireInput['employmentType'],
                seniorityLevel: str(payload['seniorityLevel'], 'mid') as NewHireInput['seniorityLevel'],
                officeLocation: typeof payload['officeLocation'] === 'string' ? payload['officeLocation'] : undefined,
                hrOpsName: typeof payload['hrOpsName'] === 'string' ? payload['hrOpsName'] : undefined,
                hrOpsEmail: typeof payload['hrOpsEmail'] === 'string' ? payload['hrOpsEmail'] : undefined,
                buddyName: typeof payload['buddyName'] === 'string' ? payload['buddyName'] : undefined,
                buddyTitle: typeof payload['buddyTitle'] === 'string' ? payload['buddyTitle'] : undefined,
                probationPeriodWeeks: typeof payload['probationPeriodWeeks'] === 'number' ? payload['probationPeriodWeeks'] : undefined,
                requiresSecurityClearance: typeof payload['requiresSecurityClearance'] === 'boolean' ? payload['requiresSecurityClearance'] : undefined,
                requiresLicenseVerification: typeof payload['requiresLicenseVerification'] === 'boolean' ? payload['requiresLicenseVerification'] : undefined,
                requiresBackgroundCheckCompletion: typeof payload['requiresBackgroundCheckCompletion'] === 'boolean' ? payload['requiresBackgroundCheckCompletion'] : undefined,
                laptopShipmentAddress: typeof payload['laptopShipmentAddress'] === 'string' ? payload['laptopShipmentAddress'] : undefined,
                specialEquipmentNeeded: typeof payload['specialEquipmentNeeded'] === 'string' ? payload['specialEquipmentNeeded'] : undefined,
                teamSlackChannel: typeof payload['teamSlackChannel'] === 'string' ? payload['teamSlackChannel'] : undefined,
                onboardingPortalUrl: typeof payload['onboardingPortalUrl'] === 'string' ? payload['onboardingPortalUrl'] : undefined,
                hrisUrl: typeof payload['hrisUrl'] === 'string' ? payload['hrisUrl'] : undefined,
                itTicketSystemUrl: typeof payload['itTicketSystemUrl'] === 'string' ? payload['itTicketSystemUrl'] : undefined,
            };

            return jsonOut(buildOnboardingHandoff(onboardInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_run_assessment
        // payload: AssessmentBriefInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_run_assessment': {
            const candidateName  = str(payload['candidateName']);
            const candidateEmail = str(payload['candidateEmail']);
            const jobTitle       = str(payload['jobTitle']);
            const companyName    = str(payload['companyName']);
            const recruiterName  = str(payload['recruiterName']);
            const recruiterEmail = str(payload['recruiterEmail']);

            if (!candidateName)  return fail('payload.candidateName is required');
            if (!candidateEmail) return fail('payload.candidateEmail is required');
            if (!jobTitle)       return fail('payload.jobTitle is required');
            if (!companyName)    return fail('payload.companyName is required');

            const assessInput: AssessmentBriefInput = {
                candidateName,
                candidateEmail,
                jobTitle,
                companyName,
                recruiterName: recruiterName ?? 'the recruiter',
                recruiterEmail: recruiterEmail ?? '',
                domain:         str(payload['domain'], 'general') as AssessmentDomain,
                assessmentType: str(payload['assessmentType'], 'take_home_case_study') as AssessmentType,
                durationHours:         num(payload['durationHours'], 3),
                submissionDeadlineDays: num(payload['submissionDeadlineDays'], 5),
                platformLink:    typeof payload['platformLink']    === 'string' ? payload['platformLink']    : undefined,
                problemStatement: typeof payload['problemStatement'] === 'string' ? payload['problemStatement'] : undefined,
                evaluators:      Array.isArray(payload['evaluators']) ? (payload['evaluators'] as string[]) : undefined,
                compensated:     typeof payload['compensated']    === 'boolean' ? payload['compensated']    : undefined,
                nda:             typeof payload['nda']            === 'boolean' ? payload['nda']            : undefined,
            };

            return jsonOut(buildAssessmentBrief(assessInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_advise_jd_compliance
        // payload: ComplianceAdvisoryInput fields
        // ----------------------------------------------------------------
        case 'workspace_rec_advise_jd_compliance': {
            const jobTitle = str(payload['jobTitle']);
            if (!jobTitle) return fail('payload.jobTitle is required');

            const compInput: ComplianceAdvisoryInput = {
                jobTitle,
                industry:  str(payload['industry'], 'general') as ComplianceIndustry,
                region:    str(payload['region'], 'us') as ComplianceRegion,
                employmentClassification: typeof payload['employmentClassification'] === 'string'
                    ? payload['employmentClassification'] as ComplianceAdvisoryInput['employmentClassification']
                    : undefined,
                requiresSecurityClearance:           typeof payload['requiresSecurityClearance'] === 'boolean' ? payload['requiresSecurityClearance'] : undefined,
                clearanceLevel:                      typeof payload['clearanceLevel'] === 'string' ? payload['clearanceLevel'] as ComplianceAdvisoryInput['clearanceLevel'] : undefined,
                requiresChildOrVulnerableAdultContact: typeof payload['requiresChildOrVulnerableAdultContact'] === 'boolean' ? payload['requiresChildOrVulnerableAdultContact'] : undefined,
                requiresFinancialFiduciary:          typeof payload['requiresFinancialFiduciary'] === 'boolean' ? payload['requiresFinancialFiduciary'] : undefined,
                finraRegistrations:                  Array.isArray(payload['finraRegistrations']) ? (payload['finraRegistrations'] as string[]) : undefined,
                requiresDriving:                     typeof payload['requiresDriving'] === 'boolean' ? payload['requiresDriving'] : undefined,
                requiresPhysicalDemands:             typeof payload['requiresPhysicalDemands'] === 'boolean' ? payload['requiresPhysicalDemands'] : undefined,
                requiresGmpEnvironment:              typeof payload['requiresGmpEnvironment'] === 'boolean' ? payload['requiresGmpEnvironment'] : undefined,
                requiresExportControlledWork:        typeof payload['requiresExportControlledWork'] === 'boolean' ? payload['requiresExportControlledWork'] : undefined,
                requiresLicensedPractitioner:        typeof payload['requiresLicensedPractitioner'] === 'boolean' ? payload['requiresLicensedPractitioner'] : undefined,
                stateOrCountry:                      typeof payload['stateOrCountry'] === 'string' ? payload['stateOrCountry'] : undefined,
            };

            return jsonOut(buildJdComplianceBlock(compInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_international
        // payload: { mode: 'rtw'|'ir35'|'gdpr'|'market', ...fields }
        // ----------------------------------------------------------------
        case 'workspace_rec_international': {
            const mode = str(payload['mode'], 'rtw');

            if (mode === 'ir35') {
                const roleTitle = str(payload['roleTitle']);
                if (!roleTitle) return fail('payload.roleTitle is required for IR35 mode');

                const ir35Input: Ir35Input = {
                    roleTitle,
                    engagerName:                 typeof payload['engagerName'] === 'string' ? payload['engagerName'] : undefined,
                    workerControlledByEngager:   typeof payload['workerControlledByEngager'] === 'boolean'   ? payload['workerControlledByEngager']   : null,
                    substitutionAllowed:         typeof payload['substitutionAllowed'] === 'boolean'         ? payload['substitutionAllowed']         : null,
                    mutualityOfObligation:       typeof payload['mutualityOfObligation'] === 'boolean'       ? payload['mutualityOfObligation']       : null,
                    workerProvidesOwnEquipment:  typeof payload['workerProvidesOwnEquipment'] === 'boolean'  ? payload['workerProvidesOwnEquipment']  : null,
                    workerBearesFinancialRisk:   typeof payload['workerBearesFinancialRisk'] === 'boolean'   ? payload['workerBearesFinancialRisk']   : null,
                    workerHasMultipleClients:    typeof payload['workerHasMultipleClients'] === 'boolean'    ? payload['workerHasMultipleClients']    : null,
                    integrationIntoOrganisation: typeof payload['integrationIntoOrganisation'] === 'boolean' ? payload['integrationIntoOrganisation'] : null,
                    engagementLengthMonths:      num(payload['engagementLengthMonths'], 6),
                    hasPscOrLimitedCompany:      typeof payload['hasPscOrLimitedCompany'] === 'boolean' ? payload['hasPscOrLimitedCompany'] : true,
                };
                return jsonOut(assessIr35Status(ir35Input));
            }

            if (mode === 'gdpr') {
                const companyName = str(payload['companyName']);
                if (!companyName) return fail('payload.companyName is required for GDPR mode');

                const gdprInput: GdprRecruitmentInput = {
                    companyName,
                    companyCountry:    str(payload['companyCountry'], 'us') as HiringCountry,
                    candidateCountry:  str(payload['candidateCountry'], 'us') as HiringCountry,
                    processingPurpose: str(payload['processingPurpose'], 'active_application') as GdprRecruitmentInput['processingPurpose'],
                    thirdPartySharing: Array.isArray(payload['thirdPartySharing']) ? (payload['thirdPartySharing'] as string[]) : undefined,
                    retentionMonths:   typeof payload['retentionMonths'] === 'number' ? payload['retentionMonths'] : undefined,
                };
                return jsonOut(buildGdprRecruitmentWorkflow(gdprInput));
            }

            if (mode === 'market') {
                const country = str(payload['country'], 'us') as HiringCountry;
                const marketInput: MarketAdaptationInput = {
                    country,
                    jobTitle:       typeof payload['jobTitle'] === 'string' ? payload['jobTitle'] : undefined,
                    salaryMin:      typeof payload['salaryMin'] === 'number' ? payload['salaryMin'] : undefined,
                    salaryMax:      typeof payload['salaryMax'] === 'number' ? payload['salaryMax'] : undefined,
                    sourceCurrency: typeof payload['sourceCurrency'] === 'string' ? payload['sourceCurrency'] : undefined,
                };
                return jsonOut(getMarketAdaptation(marketInput));
            }

            // Default: right-to-work
            const country         = str(payload['country'], 'us') as HiringCountry;
            const candidateStatus = str(payload['candidateStatus'], 'unknown') as IntlCandidateStatus;

            const rtwInput: RightToWorkInput = {
                country,
                candidateStatus,
                visaType:             typeof payload['visaType'] === 'string' ? payload['visaType'] : undefined,
                visaExpiryDate:       typeof payload['visaExpiryDate'] === 'string' ? payload['visaExpiryDate'] : undefined,
                sponsorshipAvailable: typeof payload['sponsorshipAvailable'] === 'boolean' ? payload['sponsorshipAvailable'] : undefined,
                engagementType:       typeof payload['engagementType'] === 'string' ? payload['engagementType'] as EngagementType : undefined,
                roleIsSpecialty:      typeof payload['roleIsSpecialty'] === 'boolean' ? payload['roleIsSpecialty'] : undefined,
                salaryAboveThreshold: typeof payload['salaryAboveThreshold'] === 'boolean' ? payload['salaryAboveThreshold'] : undefined,
            };
            return jsonOut(assessRightToWork(rtwInput));
        }

        // ----------------------------------------------------------------
        // workspace_rec_campus_recruiting
        // payload: { mode: 'career_fair'|'bulk_screen'|'intern_tracker'|'seasonal_batch', ...fields }
        // ----------------------------------------------------------------
        case 'workspace_rec_campus_recruiting': {
            const mode = str(payload['mode'], 'career_fair');

            // ── Career Fair ──────────────────────────────────────────────
            if (mode === 'career_fair') {
                const fairName = str(payload['fairName']);
                const organizer = str(payload['organizer']);
                const targetRoles = strArr(payload['targetRoles']);
                const attendees = strArr(payload['attendees']);
                const companyName = str(payload['companyName']);
                const recruiterName = str(payload['recruiterName']);
                const recruiterEmail = str(payload['recruiterEmail']);
                const headcountTarget = num(payload['headcountTarget'], 1);
                const date = str(payload['date']);

                if (!fairName) return fail('payload.fairName is required');
                if (!organizer) return fail('payload.organizer is required');
                if (!date) return fail('payload.date is required (ISO date)');
                if (targetRoles.length === 0) return fail('payload.targetRoles array is required');
                if (attendees.length === 0) return fail('payload.attendees array is required');
                if (!companyName) return fail('payload.companyName is required');
                if (!recruiterName) return fail('payload.recruiterName is required');
                if (!recruiterEmail) return fail('payload.recruiterEmail is required');

                const fairInput: CareerFairInput = {
                    fairName,
                    organizer,
                    fairType: str(payload['fairType'], 'university') as FairType,
                    date,
                    location: typeof payload['location'] === 'string' ? payload['location'] : undefined,
                    virtualPlatform: typeof payload['virtualPlatform'] === 'string' ? payload['virtualPlatform'] : undefined,
                    targetRoles,
                    targetDisciplines: Array.isArray(payload['targetDisciplines']) ? strArr(payload['targetDisciplines']) : undefined,
                    attendees,
                    boothNumber: typeof payload['boothNumber'] === 'string' ? payload['boothNumber'] : undefined,
                    headcountTarget,
                    companyName,
                    recruiterName,
                    recruiterEmail,
                    internOrFullTime: str(payload['internOrFullTime'], 'both') as InternOrFullTime,
                    targetStartDate: typeof payload['targetStartDate'] === 'string' ? payload['targetStartDate'] : undefined,
                    swag: Array.isArray(payload['swag']) ? strArr(payload['swag']) : undefined,
                };
                return jsonOut(buildCareerFairPackage(fairInput));
            }

            // ── Bulk Screen ──────────────────────────────────────────────
            if (mode === 'bulk_screen') {
                const jobTitle = str(payload['jobTitle']);
                const requiredQualifications = strArr(payload['requiredQualifications']);
                const candidatesRaw = payload['candidates'];

                if (!jobTitle) return fail('payload.jobTitle is required');
                if (requiredQualifications.length === 0) return fail('payload.requiredQualifications array is required');
                if (!Array.isArray(candidatesRaw) || candidatesRaw.length === 0) return fail('payload.candidates array is required');

                const candidates: BulkCandidateInput[] = (candidatesRaw as Record<string, unknown>[]).map((c, idx) => ({
                    id:           typeof c['id'] === 'string' ? c['id'] : undefined,
                    name:         str(c['name'] ?? c['candidateName'], `Candidate ${idx + 1}`),
                    email:        str(c['email'], `candidate${idx + 1}@unknown.invalid`),
                    resumeText:   str(c['resumeText'], ''),
                    source:       typeof c['source'] === 'string' ? c['source'] : undefined,
                    university:   typeof c['university'] === 'string' ? c['university'] : undefined,
                    gpa:          typeof c['gpa'] === 'number' ? c['gpa'] : undefined,
                    graduationDate: typeof c['graduationDate'] === 'string' ? c['graduationDate'] : undefined,
                    salaryExpectation: typeof c['salaryExpectation'] === 'number' ? c['salaryExpectation'] : undefined,
                }));

                const bulkInput: BulkScreenInput = {
                    jobTitle,
                    requiredQualifications,
                    candidates,
                    industry: typeof payload['industry'] === 'string' ? payload['industry'] : undefined,
                    niceToHaveQualifications: Array.isArray(payload['niceToHaveQualifications']) ? strArr(payload['niceToHaveQualifications']) : undefined,
                    minYearsExperience: typeof payload['minYearsExperience'] === 'number' ? payload['minYearsExperience'] : undefined,
                    salaryBudgetMax: typeof payload['salaryBudgetMax'] === 'number' ? payload['salaryBudgetMax'] : undefined,
                    dealBreakerKeywords: Array.isArray(payload['dealBreakerKeywords']) ? strArr(payload['dealBreakerKeywords']) : undefined,
                    autoRejectThreshold: typeof payload['autoRejectThreshold'] === 'number' ? payload['autoRejectThreshold'] : undefined,
                    maxShortlist: typeof payload['maxShortlist'] === 'number' ? payload['maxShortlist'] : undefined,
                    blindScreen: typeof payload['blindScreen'] === 'boolean' ? payload['blindScreen'] : undefined,
                };
                return jsonOut(bulkScreenCandidates(bulkInput));
            }

            // ── Intern Tracker ───────────────────────────────────────────
            if (mode === 'intern_tracker') {
                const companyName = str(payload['companyName']);
                const internsRaw = payload['interns'];

                if (!companyName) return fail('payload.companyName is required');
                if (!Array.isArray(internsRaw)) return fail('payload.interns array is required');

                const todayIso = new Date().toISOString().split('T')[0]!;
                const interns: Intern[] = (internsRaw as Record<string, unknown>[]).map((i, idx) => {
                    const startDate = str(i['startDate'], todayIso);
                    return {
                        id:             str(i['id'], `intern-${idx + 1}`),
                        name:           str(i['name'], `Intern ${idx + 1}`),
                        email:          str(i['email'], `intern${idx + 1}@unknown.invalid`),
                        university:     str(i['university'], 'Unknown University'),
                        major:          str(i['major'], 'Undeclared'),
                        graduationYear: num(i['graduationYear'] ?? i['gradYear'], new Date().getFullYear() + 1),
                        team:           str(i['team'], 'General'),
                        managerName:    str(i['managerName'] ?? i['manager'], 'Manager TBD'),
                        status:         str(i['status'], 'active') as Intern['status'],
                        startDate,
                        endDate:        str(i['endDate'], ''),
                        milestones:     Array.isArray(i['milestones'])
                            ? i['milestones'] as InternMilestone[]
                            : buildDefaultInternMilestones(startDate),
                        midtermRating:       typeof i['midtermRating'] === 'number' ? i['midtermRating'] : undefined,
                        finalRating:         typeof i['finalRating'] === 'number' ? i['finalRating'] : undefined,
                        returnOfferExtended: typeof i['returnOfferExtended'] === 'boolean' ? i['returnOfferExtended'] : undefined,
                        returnOfferAccepted: typeof i['returnOfferAccepted'] === 'boolean' ? i['returnOfferAccepted'] : undefined,
                        returnOfferRole:     typeof i['returnOfferRole'] === 'string' ? i['returnOfferRole'] : undefined,
                        returnOfferStartDate: typeof i['returnOfferStartDate'] === 'string' ? i['returnOfferStartDate'] : undefined,
                        notes:               typeof i['notes'] === 'string' ? i['notes'] : undefined,
                    };
                });

                const cohortInput: InternCohortInput = {
                    companyName,
                    season: str(payload['season'], 'summer') as InternSeason,
                    year: num(payload['year'], new Date().getFullYear()),
                    programName: typeof payload['programName'] === 'string' ? payload['programName'] : undefined,
                    programmeManagerName: typeof payload['programmeManagerName'] === 'string' ? payload['programmeManagerName'] : undefined,
                    interns,
                    returnOfferTargetPct: typeof payload['returnOfferTargetPct'] === 'number' ? payload['returnOfferTargetPct'] : undefined,
                    currentDate: typeof payload['currentDate'] === 'string' ? payload['currentDate'] : undefined,
                };
                return jsonOut(buildInternCohortReport(cohortInput));
            }

            // ── Seasonal Batch ───────────────────────────────────────────
            {
                const companyName     = str(payload['companyName']);
                const hiringManagerName = str(payload['hiringManagerName']);
                const recruiterName   = str(payload['recruiterName']);
                const recruiterEmail  = str(payload['recruiterEmail']);
                const targetStartDate = str(payload['targetStartDate'] ?? payload['startDate']);
                const rolesRaw = payload['rolesToFill'] ?? payload['roles'];

                if (!companyName) return fail('payload.companyName is required');
                if (!targetStartDate) return fail('payload.targetStartDate is required (ISO date)');
                if (!hiringManagerName) return fail('payload.hiringManagerName is required');
                if (!recruiterName) return fail('payload.recruiterName is required');
                if (!recruiterEmail) return fail('payload.recruiterEmail is required');
                if (!Array.isArray(rolesRaw) || rolesRaw.length === 0) return fail('payload.rolesToFill array is required');

                const rolesToFill: SeasonalRole[] = (rolesRaw as Record<string, unknown>[]).map(r => ({
                    title:          str(r['title'], 'Seasonal Associate'),
                    headcount:      num(r['headcount'], 1),
                    location:       str(r['location'], 'TBC'),
                    minAge:         typeof r['minAge'] === 'number' ? r['minAge'] : undefined,
                    payRate:        typeof r['payRate'] === 'number' ? r['payRate'] : undefined,
                    payCurrency:    typeof r['payCurrency'] === 'string' ? r['payCurrency'] : undefined,
                    payFrequency:   typeof r['payFrequency'] === 'string' ? r['payFrequency'] as SeasonalRole['payFrequency'] : undefined,
                    shiftPattern:   typeof r['shiftPattern'] === 'string' ? r['shiftPattern'] : undefined,
                    fixedTermWeeks: typeof r['fixedTermWeeks'] === 'number' ? r['fixedTermWeeks'] : undefined,
                }));

                const seasonalInput: SeasonalBatchInput = {
                    companyName,
                    season:           str(payload['season'], 'holiday') as HiringSeason,
                    industry:         str(payload['industry'], 'retail') as SeasonalIndustry,
                    rolesToFill,
                    targetStartDate,
                    targetEndDate:        typeof payload['targetEndDate'] === 'string' ? payload['targetEndDate'] : undefined,
                    hiringManagerName,
                    recruiterName,
                    recruiterEmail,
                    screeningCriteria:    Array.isArray(payload['screeningCriteria']) ? strArr(payload['screeningCriteria']) : undefined,
                    prevYearHireCount:    typeof payload['prevYearHireCount'] === 'number' ? payload['prevYearHireCount'] : undefined,
                    prevYearAttrition:    typeof payload['prevYearAttrition'] === 'number' ? payload['prevYearAttrition'] : undefined,
                    useAgencyStaffing:    typeof payload['useAgencyStaffing'] === 'boolean' ? payload['useAgencyStaffing'] : undefined,
                };
                return jsonOut(buildSeasonalBatchPlan(seasonalInput));
            }
        }

        default: {
            const exhaustive: never = actionType;
            return fail(`Unknown recruiter action type: ${String(exhaustive)}`);
        }
    }
}
