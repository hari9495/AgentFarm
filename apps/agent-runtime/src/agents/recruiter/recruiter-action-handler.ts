/**
 * Recruiter Action Handler (Tier 47)
 *
 * Dispatches workspace_rec_* actions to domain modules:
 *
 *   workspace_rec_build_jd              — craft a branded job description from a role brief
 *   workspace_rec_post_job              — gate + generate job-board posting payload
 *   workspace_rec_source_candidates     — search LinkedIn / Apollo / boards for talent
 *   workspace_rec_screen_resume         — parse + score a resume against a JD
 *   workspace_rec_send_outreach         — compose personalised candidate outreach / sequence
 *   workspace_rec_schedule_interview    — coordinate calendars, produce invites & prep packs
 *   workspace_rec_conduct_phone_screen  — generate a structured phone-screen script + scorecard
 *   workspace_rec_gather_feedback       — aggregate interviewer feedback into a debrief report
 *   workspace_rec_manage_pipeline       — build an ATS pipeline status report with SLA warnings
 *   workspace_rec_generate_offer        — draft an employment offer letter with budget validation
 *   workspace_rec_market_intelligence   — salary benchmarking, talent availability, hiring trends
 *   workspace_rec_request_human_gate    — route high-risk action to human approval
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
    | 'workspace_rec_request_human_gate';

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
        t === 'workspace_rec_request_human_gate'
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

        default: {
            const exhaustive: never = actionType;
            return fail(`Unknown recruiter action type: ${String(exhaustive)}`);
        }
    }
}
