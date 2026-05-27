/**
 * Resume Screener
 *
 * Parses a resume text/URL and scores it against a job description's
 * required qualifications. Produces a structured screening verdict with
 * strengths, gaps, and a recommended next step.
 *
 * Integrates credential-validator.ts for domain-aware credential checking:
 * clinical licenses (RN, MD, NP), legal credentials (JD, Bar), finance
 * licences (Series 7, CPA, CFA), engineering (PE), and 40+ others.
 * Pure logic — no external API calls.
 */

import {
    validateCredentials,
    detectRequiredCredentials,
    type CredentialValidationResult,
} from './credential-validator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreeningVerdict = 'strong_yes' | 'yes' | 'maybe' | 'no' | 'hard_no';

export interface ResumeScreenInput {
    candidateName: string;
    resumeText: string;
    jobTitle: string;
    industry?: string;                // Optional: auto-detected if not provided
    requiredQualifications: string[];
    niceToHaveQualifications?: string[];
    minYearsExperience?: number;
    salaryExpectation?: number;
    salaryBudgetMax?: number;
    dealBreakerKeywords?: string[];   // e.g. ['no right to work', 'requires visa sponsorship']
    bonusCredentialIds?: string[];    // Extra credential IDs to check as nice-to-haves
}

export interface QualificationMatch {
    qualification: string;
    met: boolean;
    evidence: string;
}

export interface ResumeScreenResult {
    candidateName: string;
    jobTitle: string;
    overallScore: number;           // 0–100
    verdict: ScreeningVerdict;
    requiredMatches: QualificationMatch[];
    niceToHaveMatches: QualificationMatch[];
    credentialValidation: CredentialValidationResult;
    strengths: string[];
    gaps: string[];
    credentialGaps: string[];       // Missing required licenses/certifications
    salaryFit: 'within_budget' | 'over_budget' | 'unknown';
    recommendedAction: string;
    phoneScreenQuestions: string[];
    screenerNotes: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictFromScore(score: number): ScreeningVerdict {
    if (score >= 85) return 'strong_yes';
    if (score >= 68) return 'yes';
    if (score >= 50) return 'maybe';
    if (score >= 30) return 'no';
    return 'hard_no';
}

function extractYearsExperience(resumeText: string): number {
    // Look for patterns like "8 years", "3+ years", "10 yrs"
    const matches = resumeText.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?experience/gi);
    if (matches && matches.length > 0) {
        const nums = matches.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10)).filter(n => !isNaN(n));
        return nums.length > 0 ? Math.max(...nums) : 0;
    }
    // Fallback: count year ranges like "2018 – 2024"
    const yearRanges = resumeText.matchAll(/20(\d{2})\s*[–\-–to]+\s*(20(\d{2})|present|current)/gi);
    let totalMonths = 0;
    const now = new Date().getFullYear();
    for (const m of yearRanges) {
        const start = 2000 + parseInt(m[1] ?? '0', 10);
        const end = m[3] ? 2000 + parseInt(m[3], 10) : now;
        totalMonths += (end - start) * 12;
    }
    return Math.round(totalMonths / 12);
}

function checkQualification(qual: string, resumeText: string): QualificationMatch {
    const lower = resumeText.toLowerCase();
    const words = qual.toLowerCase().split(/\s+/);
    // Keyword matching — a qual is "met" if majority of its distinct keywords appear in resume
    const significantWords = words.filter(w => w.length > 3 && !['with', 'and', 'the', 'for', 'in', 'of', 'or', 'to'].includes(w));
    if (significantWords.length === 0) {
        return { qualification: qual, met: false, evidence: 'No significant keywords to match' };
    }
    const matched = significantWords.filter(w => lower.includes(w));
    const pct = matched.length / significantWords.length;
    const met = pct >= 0.6;
    const evidence = met
        ? `Found: ${matched.join(', ')}`
        : `Missing: ${significantWords.filter(w => !lower.includes(w)).join(', ')}`;
    return { qualification: qual, met, evidence };
}

function buildPhoneScreenQuestions(gaps: string[], jobTitle: string): string[] {
    const base = [
        `Walk me through your experience most relevant to a ${jobTitle} role.`,
        'What attracted you to this opportunity?',
        'What are your salary expectations?',
        'What is your notice period / earliest start date?',
        'Are you currently interviewing elsewhere?',
    ];
    const gapQs = gaps.slice(0, 2).map(g => `Can you tell me more about your experience with ${g}?`);
    return [...gapQs, ...base];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function screenResume(input: ResumeScreenInput): ResumeScreenResult {
    const resumeLower = input.resumeText.toLowerCase();

    // Deal-breaker check
    const hitDealBreaker = (input.dealBreakerKeywords ?? []).find(kw =>
        resumeLower.includes(kw.toLowerCase()),
    );

    // ── Credential validation (domain-aware) ────────────────────────────────
    // Auto-detect required credentials for this role/industry
    const requiredCredentialIds = detectRequiredCredentials(
        input.jobTitle,
        input.industry ?? '',
    );
    const credentialValidation = validateCredentials(
        input.resumeText,
        requiredCredentialIds,
        input.bonusCredentialIds,
    );

    if (hitDealBreaker) {
        return {
            candidateName: input.candidateName,
            jobTitle: input.jobTitle,
            overallScore: 0,
            verdict: 'hard_no',
            requiredMatches: [],
            niceToHaveMatches: [],
            credentialValidation,
            strengths: [],
            gaps: [`Deal-breaker detected: "${hitDealBreaker}"`],
            credentialGaps: credentialValidation.missingRequired.map(c => c.credentialName),
            salaryFit: 'unknown',
            recommendedAction: `Do not advance. Deal-breaker criterion met: "${hitDealBreaker}".`,
            phoneScreenQuestions: [],
            screenerNotes: `Auto-rejected: deal-breaker keyword "${hitDealBreaker}" found in resume.`,
        };
    }

    // ── Required qualifications (keyword matching) ───────────────────────────
    const requiredMatches = input.requiredQualifications.map(q => checkQualification(q, input.resumeText));
    const reqMet = requiredMatches.filter(m => m.met).length;
    const reqTotal = requiredMatches.length;

    // Score breakdown (total 100):
    //   - Required quals: 60 pts (was 70; credentails take 10)
    //   - Credentials:    10 pts
    //   - Nice-to-haves:  20 pts
    //   - Experience:     10 pts
    const reqScore = reqTotal > 0 ? Math.round((reqMet / reqTotal) * 60) : 60;
    const credScore = Math.round(credentialValidation.credentialScore / 10); // 0–10

    // ── Nice-to-have qualifications ──────────────────────────────────────────
    const niceToHaveMatches = (input.niceToHaveQualifications ?? []).map(q =>
        checkQualification(q, input.resumeText),
    );
    const niceMet = niceToHaveMatches.filter(m => m.met).length;
    const niceScore = niceToHaveMatches.length > 0
        ? Math.round((niceMet / niceToHaveMatches.length) * 20)
        : 10;

    // ── Experience score (up to 10 pts) ──────────────────────────────────────
    const yearsFound = extractYearsExperience(input.resumeText);
    const minYears = input.minYearsExperience ?? 0;
    const expScore = yearsFound >= minYears ? 10 : Math.round((yearsFound / Math.max(minYears, 1)) * 10);

    let overallScore = Math.min(reqScore + credScore + niceScore + expScore, 100);

    // Hard block: if a legally-required credential is missing, cap at 'no'
    if (credentialValidation.hardBlock) {
        overallScore = Math.min(overallScore, 29); // Forces 'no' or 'hard_no'
    }

    const verdict = verdictFromScore(overallScore);

    const strengths = requiredMatches.filter(m => m.met).map(m => m.qualification);
    const gaps = requiredMatches.filter(m => !m.met).map(m => m.qualification);
    const credentialGaps = credentialValidation.missingRequired.map(c =>
        `${c.credentialName}${c.notes ? ` (${c.notes})` : ''}`,
    );

    // ── Salary fit ───────────────────────────────────────────────────────────
    let salaryFit: ResumeScreenResult['salaryFit'] = 'unknown';
    if (input.salaryExpectation && input.salaryBudgetMax) {
        salaryFit = input.salaryExpectation <= input.salaryBudgetMax ? 'within_budget' : 'over_budget';
    }

    const actionMap: Record<ScreeningVerdict, string> = {
        strong_yes: 'Advance immediately — schedule phone screen within 24 hours.',
        yes: 'Advance — schedule phone screen this week.',
        maybe: 'Review with hiring manager before deciding; may need clarifying questions.',
        no: credentialValidation.hardBlock
            ? `Do not advance. Missing required credential(s): ${credentialGaps.join('; ')}.`
            : 'Do not advance. Send polite rejection after pipeline closes.',
        hard_no: 'Do not advance. Archive candidate profile.',
    };

    const screenerNotes = [
        `Score: ${overallScore}/100 (Req: ${reqMet}/${reqTotal}, Cred: ${credentialValidation.totalFound}/${credentialValidation.totalRequired}, Nice: ${niceMet}/${niceToHaveMatches.length}, Exp: ${yearsFound} yrs)`,
        credentialValidation.hardBlock ? `⛔ CREDENTIAL BLOCK: ${credentialGaps.join('; ')}` : '',
        credentialValidation.presentCredentials.length > 0
            ? `✓ Credentials: ${credentialValidation.presentCredentials.map(c => c.credentialName).join(', ')}`
            : '',
        salaryFit !== 'unknown' ? `Salary: ${salaryFit === 'within_budget' ? '✓ within budget' : '✗ over budget'}` : '',
    ].filter(Boolean).join(' | ');

    const allGaps = [...gaps, ...credentialGaps];

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        overallScore,
        verdict,
        requiredMatches,
        niceToHaveMatches,
        credentialValidation,
        strengths,
        gaps,
        credentialGaps,
        salaryFit,
        recommendedAction: actionMap[verdict],
        phoneScreenQuestions: buildPhoneScreenQuestions(allGaps, input.jobTitle),
        screenerNotes,
    };
}
