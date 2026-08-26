/**
 * Phone Screen Guide
 *
 * Generates a structured 15–30 minute phone-screen script for a recruiter
 * including opening, core competency questions, salary/logistics checks,
 * candidate Q&A space, and a closing that sets expectations.
 * Also produces a structured scorecard for post-call note-taking.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhoneScreenInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    salaryBudget?: { min: number; max: number; currency: string };
    requiredSkills: string[];
    dealBreakerChecks?: string[];     // e.g. ['right to work in US', 'no relocation required']
    durationMinutes?: number;         // default 20
    nextInterviewStage?: string;      // e.g. "Technical interview with the eng team"
    interviewerNames?: string[];
}

export interface ScorecardDimension {
    dimension: string;
    question: string;
    ratingScale: string;
    notesPlaceholder: string;
}

export interface PhoneScreenGuide {
    candidateName: string;
    jobTitle: string;
    durationMinutes: number;
    script: string;
    scorecard: ScorecardDimension[];
    postCallActions: string[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function buildScript(input: PhoneScreenInput): string {
    const dur = input.durationMinutes ?? 20;
    const skills = input.requiredSkills.slice(0, 4);
    const dealBreakers = input.dealBreakerChecks ?? [];
    const sal = input.salaryBudget;

    const lines: string[] = [
        `# Phone Screen Script — ${input.candidateName} for ${input.jobTitle}`,
        `**Duration:** ${dur} minutes  |  **Recruiter:** ${input.recruiterName}`,
        '',
        '---',
        '',
        `## OPENING (2 min)`,
        `"Hi ${input.candidateName}, it's ${input.recruiterName} calling from ${input.companyName}. Thanks so much for making time today. I have us down for about ${dur} minutes — does that still work for you?"`,
        '',
        `"Great. The goal of today's call is to learn a bit more about your background, tell you about the ${input.jobTitle} role, and figure out if this could be a good mutual fit. Sound good?"`,
        '',
        '---',
        '',
        `## DEAL-BREAKER CHECKS (2 min)`,
        ...(dealBreakers.length > 0
            ? dealBreakers.map(d => `- "${d}?"`)
            : [`- "Are you authorised to work in this country without sponsorship?"`,
               `- "Are you comfortable with the [${input.companyName} location / remote] work arrangement we discussed?"`]),
        '',
        `> **If any deal-breaker fails:** Politely close — "I appreciate your time — based on what you've shared, this particular role may not be the right fit, but I'll keep your profile on file for future opportunities."`,
        '',
        '---',
        '',
        `## BACKGROUND & MOTIVATION (4 min)`,
        `"Walk me through your career to date — focusing on what's most relevant to the ${input.jobTitle} role."`,
        `  → Listen for: depth of relevant experience, progression, scope of ownership`,
        '',
        `"What's prompting you to consider new opportunities right now?"`,
        `  → Listen for: push vs pull motivators; red flags (team conflict, performance issues)`,
        '',
        `"What does your ideal next role look like?"`,
        `  → Listen for: alignment with what we're offering`,
        '',
        '---',
        '',
        `## CORE COMPETENCY QUESTIONS (${dur - 14} min)`,
        ...skills.map(skill => [
            `**${skill}**`,
            `"Can you tell me about a time you worked with ${skill}? What was the context, and what was the outcome?"`,
            `  → Probe: scale, complexity, your specific contribution`,
            '',
        ]).flat(),
        '---',
        '',
        `## LOGISTICS (3 min)`,
        sal
            ? `"Our compensation range for this role is ${sal.currency} ${sal.min.toLocaleString()}–${sal.max.toLocaleString()}. Does that align with your expectations?"`
            : `"To make sure we're aligned, what are your salary expectations for your next role?"`,
        `  → Note the number. Do NOT negotiate now — that's for the offer stage.`,
        '',
        `"What's your current notice period / earliest available start date?"`,
        `"Are you actively interviewing elsewhere right now?"`,
        '',
        '---',
        '',
        `## CANDIDATE Q&A (3 min)`,
        `"I've been doing all the asking — do you have any questions for me about the role or the company?"`,
        `  → This signals how engaged and prepared they are. Take notes.`,
        '',
        '---',
        '',
        `## CLOSE (2 min)`,
        `"Thanks so much, ${input.candidateName} — this has been really helpful."`,
        '',
        input.nextInterviewStage
            ? `"The next step, if we'd like to move forward, would be a ${input.nextInterviewStage}${input.interviewerNames ? ` with ${input.interviewerNames.join(' and ')}` : ''}. I'll aim to be in touch within 2 business days with an update either way."`
            : `"I'll be reviewing feedback with the hiring team and will get back to you with an update within 2 business days."`,
        '',
        `"Is there anything else you'd like me to know?"`,
        '',
        `"Great — have a wonderful rest of your day, and talk soon!"`,
    ];

    return lines.join('\n');
}

function buildScorecard(input: PhoneScreenInput): ScorecardDimension[] {
    const skillDimensions: ScorecardDimension[] = input.requiredSkills.slice(0, 4).map(skill => ({
        dimension: skill,
        question: `Demonstrated depth of experience with ${skill}?`,
        ratingScale: '1 (None) → 2 (Basic) → 3 (Proficient) → 4 (Expert)',
        notesPlaceholder: `Key examples shared: `,
    }));

    return [
        {
            dimension: 'Communication',
            question: 'Was the candidate clear, structured, and concise in their answers?',
            ratingScale: '1 (Poor) → 2 (Average) → 3 (Good) → 4 (Excellent)',
            notesPlaceholder: '',
        },
        {
            dimension: 'Motivation & Fit',
            question: 'Does their reason for moving align with what we offer?',
            ratingScale: '1 (No alignment) → 4 (Strong alignment)',
            notesPlaceholder: 'Reason for leaving current role: ',
        },
        ...skillDimensions,
        {
            dimension: 'Salary Alignment',
            question: 'Are expectations within budget?',
            ratingScale: 'Yes / No / Negotiable',
            notesPlaceholder: `Candidate expectation: `,
        },
        {
            dimension: 'Availability',
            question: 'Notice period and start date?',
            ratingScale: 'Immediate / 2 weeks / 1 month / 1+ month',
            notesPlaceholder: '',
        },
        {
            dimension: 'Overall Recommendation',
            question: 'Based on this screen, should we advance?',
            ratingScale: 'Strong Yes / Yes / Maybe / No',
            notesPlaceholder: 'Reasoning: ',
        },
    ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildPhoneScreenGuide(input: PhoneScreenInput): PhoneScreenGuide {
    const postCallActions = [
        `Log call notes and scorecard in ATS within 1 hour`,
        `Share scorecard with hiring manager within the same business day`,
        `If advancing: send interview schedule within 2 business days`,
        `If not advancing: send personalised rejection email within 48 hours`,
        `Update candidate status in ATS (Screened → Advanced / Rejected)`,
        `Add any notable observations to the candidate's long-term profile`,
    ];

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        durationMinutes: input.durationMinutes ?? 20,
        script: buildScript(input),
        scorecard: buildScorecard(input),
        postCallActions,
    };
}

/**
 * Convert a phone-screen guide into a runnable interview protocol — the ordered
 * questions the agent will actually ask when it joins the call, driven by the
 * generic interview engine. Each scorecard dimension becomes one question.
 */
export function buildPhoneScreenProtocol(
    guide: PhoneScreenGuide,
): { opening: string; closing: string; protocol: Array<{ id: string; question: string; required: boolean }> } {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return {
        opening: `Hi ${guide.candidateName}, thanks for making the time. I'd like to walk through a few questions about the ${guide.jobTitle} role — is now still good?`,
        closing: `That's everything from my side — thank you. We'll follow up with next steps shortly.`,
        protocol: guide.scorecard.map((d, i) => ({
            id: slug(d.dimension) || `q${i + 1}`,
            question: d.question,
            // Fit-signal dimensions matter most; treat all as required by default.
            required: true,
        })),
    };
}
