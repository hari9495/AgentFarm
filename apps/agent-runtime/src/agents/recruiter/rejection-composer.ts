/**
 * Rejection Composer
 *
 * Produces EEOC-safe, brand-positive rejection communications for every
 * pipeline stage: application acknowledgement, post-screen rejection,
 * post-interview rejection (warm), offer-declined response, and
 * talent-pool nurture rejection. Tone calibrated to stage.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RejectionStage =
    | 'application_ack'        // Auto-acknowledge receipt (no decision yet)
    | 'post_screen_reject'     // After resume/phone screen — did not advance
    | 'post_interview_reject'  // After 1+ rounds of interview
    | 'final_round_reject'     // After final panel — close race
    | 'offer_declined_response'// Candidate declined our offer
    | 'talent_pool_add';       // Rejected but added to future talent pool

export type RejectionTone = 'formal' | 'warm' | 'brief';

export interface RejectionInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    recruiterEmail?: string;
    stage: RejectionStage;
    tone?: RejectionTone;
    specificFeedback?: string;      // 1–2 lines of safe, high-level feedback
    talentPoolInvite?: boolean;     // Explicitly invite to future roles
    futureRoleHint?: string;        // e.g., "a more senior opening in 6 months"
    interviewerNames?: string[];    // For final-round — who the candidate met
    alternativeRoleUrl?: string;    // Link to other open roles
    companyCareerPageUrl?: string;
}

export interface RejectionMessage {
    subject: string;
    body: string;
    stage: RejectionStage;
    tone: RejectionTone;
    eeoComplianceNotes: string[];
    tips: string[];
}

// ---------------------------------------------------------------------------
// EEOC-safe language guidelines
// ---------------------------------------------------------------------------

const EEOC_NOTES = [
    'Never reference age, gender, race, religion, national origin, disability, or pregnancy',
    'Never say "overqualified" — may be interpreted as age discrimination',
    'Never reference marital status, family plans, or childcare',
    'Do not give specific feedback that could be used in a discrimination claim',
    'Keep rejection reasons vague but professional: "we found a stronger match for this role at this time"',
    'Do not promise a future role unless you have specific, confirmed headcount',
];

// ---------------------------------------------------------------------------
// Stage builders
// ---------------------------------------------------------------------------

function buildApplicationAck(input: RejectionInput): RejectionMessage {
    return {
        subject: `We've received your application — ${input.jobTitle} at ${input.companyName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `Thank you for applying for the **${input.jobTitle}** role at ${input.companyName}. We've received your application and our team is reviewing submissions.`,
            ``,
            `If your background is a strong match for what we"re looking for, we'll be in touch to schedule next steps. Given the volume of applications, we may not be able to respond to every candidate individually, but we appreciate the time you"ve taken to apply.`,
            ``,
            input.companyCareerPageUrl
                ? `In the meantime, you're welcome to browse other open roles at ${input.companyName}: ${input.companyCareerPageUrl}`
                : '',
            ``,
            `Thank you again, and best of luck with your search.`,
            ``,
            `The ${input.companyName} Talent Team`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: input.tone ?? 'brief',
        eeoComplianceNotes: EEOC_NOTES,
        tips: [
            'Send immediately upon application receipt — sets expectations and reduces inbound inquiries',
            'Do NOT promise a timeline unless you can commit to it',
        ],
    };
}

function buildPostScreenReject(input: RejectionInput): RejectionMessage {
    const feedback = input.specificFeedback
        ? `While your background is impressive, ${input.specificFeedback}.`
        : `After careful consideration, we\'ve decided to move forward with other candidates whose backgrounds more closely match our requirements for this particular role.`;

    return {
        subject: `Your application for ${input.jobTitle} at ${input.companyName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `Thank you for taking the time to apply for the **${input.jobTitle}** role at ${input.companyName} and for your interest in joining our team.`,
            ``,
            `${feedback}`,
            ``,
            `This was not an easy decision, and we appreciate the time and effort you put into the process.`,
            ``,
            input.talentPoolInvite
                ? `We were genuinely impressed with your profile and would love to keep you in mind for ${input.futureRoleHint ?? 'future opportunities'}. With your permission, we'd like to add you to our talent network so we can reach out when a relevant role opens up.`
                : '',
            ``,
            input.alternativeRoleUrl ? `You may also find other roles at ${input.companyName} of interest: ${input.alternativeRoleUrl}` : '',
            ``,
            `We wish you all the best in your search and hope our paths cross again.`,
            ``,
            `Warm regards,`,
            `${input.recruiterName}`,
            input.recruiterEmail ? input.recruiterEmail : '',
            `${input.companyName}`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: input.tone ?? 'warm',
        eeoComplianceNotes: EEOC_NOTES,
        tips: [
            'Send within 5 business days of the decision — candidates lose trust when left in limbo',
            "Personalise the opening line so it doesn\'t feel automated",
            "Avoid the phrase 'not the right fit' — it's vague and overused",
        ],
    };
}

function buildPostInterviewReject(input: RejectionInput): RejectionMessage {
    const interviewerMention = input.interviewerNames && input.interviewerNames.length > 0
        ? ` with ${input.interviewerNames.join(' and ')}`
        : '';

    const feedback = input.specificFeedback
        ? `\n\nOn feedback: ${input.specificFeedback}`
        : '';

    return {
        subject: `Following up — ${input.jobTitle} at ${input.companyName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `Thank you so much for the time you invested in our interview process${interviewerMention} for the **${input.jobTitle}** role at ${input.companyName}.`,
            ``,
            `After thoughtful deliberation, we have decided to move forward with another candidate whose experience more closely aligns with our current priorities for this role. This was genuinely a difficult decision — the calibre of our finalists was high.${feedback}`,
            ``,
            `I want to be transparent: this decision reflects the specific needs of this role right now, not a reflection of your capabilities or potential.`,
            ``,
            input.talentPoolInvite
                ? `We'd very much like to stay connected for ${input.futureRoleHint ?? 'future opportunities'} — would it be okay if we reached out when something relevant opens up?`
                : `We'll keep your details on file should a relevant opportunity arise in the future.`,
            ``,
            `Thank you again for your time and openness throughout this process. We wish you every success in finding your next role.`,
            ``,
            `Best wishes,`,
            `${input.recruiterName}`,
            input.recruiterEmail ? input.recruiterEmail : '',
            `${input.companyName}`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: input.tone ?? 'warm',
        eeoComplianceNotes: EEOC_NOTES,
        tips: [
            'If candidate had 3+ interviews, a phone call is more appropriate than email alone',
            'Do not provide detailed interview feedback in writing — this creates legal risk',
            'Offer a brief verbal debrief call if the candidate requests one — it protects employer brand',
        ],
    };
}

function buildFinalRoundReject(input: RejectionInput): RejectionMessage {
    const interviewerMention = input.interviewerNames && input.interviewerNames.length > 0
        ? ` with the team including ${input.interviewerNames.join(', ')}`
        : '';

    return {
        subject: `${input.jobTitle} role — update from ${input.companyName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `I wanted to reach out personally following your final round of interviews${interviewerMention} for the **${input.jobTitle}** role at ${input.companyName}.`,
            ``,
            `I have some difficult news to share — after very serious consideration, we've made the decision to extend our offer to another candidate. I want to be straightforward with you: this was one of the closest decisions our hiring panel has faced. You were exceptional throughout the process and gave us a great deal to think about.`,
            ``,
            `${input.specificFeedback ? `What I can share: ${input.specificFeedback}` : `The decision ultimately came down to a very specific set of requirements for this role at this particular moment, rather than any concern about your overall calibre.`}`,
            ``,
            `I genuinely hope we"ll have the chance to work together in some capacity. I'd like to stay connected — with your permission, I"ll reach out when ${input.futureRoleHint ?? 'a relevant opportunity emerges'} here.`,
            ``,
            `If you"d find a brief call useful, I'm happy to set up time. Just reply and we"ll arrange it.`,
            ``,
            `Thank you for everything you brought to this process. I have no doubt you'll find an excellent next step — and whoever hires you will be lucky to have you.`,
            ``,
            `With respect and appreciation,`,
            `${input.recruiterName}`,
            input.recruiterEmail ? input.recruiterEmail : '',
            `${input.companyName}`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: 'warm',
        eeoComplianceNotes: EEOC_NOTES,
        tips: [
            'For final-round candidates: call first, then follow up with email. A rejection email without a call after 4+ rounds damages employer brand',
            'Offer a 15-min debrief call proactively — most candidates appreciate it and it turns detractors into advocates',
            'Add to talent pool immediately — these candidates should be first call for your next opening',
        ],
    };
}

function buildOfferDeclinedResponse(input: RejectionInput): RejectionMessage {
    return {
        subject: `Re: ${input.jobTitle} offer — thank you, ${input.candidateName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `Thank you for letting me know, and for the care and consideration you gave our offer. While we're disappointed we won't be working together at this time, I completely respect your decision.`,
            ``,
            `I'd love to stay in touch — career paths often intersect in unexpected ways, and I think very highly of you professionally. Would it be okay if I reached out in ${input.futureRoleHint ? `the context of ${input.futureRoleHint}` : `the future when relevant opportunities arise`}?`,
            ``,
            `Wishing you every success in your next role and beyond.`,
            ``,
            `Warmly,`,
            `${input.recruiterName}`,
            input.recruiterEmail ? input.recruiterEmail : '',
            `${input.companyName}`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: 'warm',
        eeoComplianceNotes: [],
        tips: [
            'Always respond graciously — declined candidates often re-engage 6–18 months later',
            'Conduct an informal exit survey: "Is there anything we could have done differently?" — invaluable for process improvement',
            'Ask if they can refer anyone else for the role',
        ],
    };
}

function buildTalentPoolAdd(input: RejectionInput): RejectionMessage {
    return {
        subject: `Staying in touch — talent network at ${input.companyName}`,
        body: [
            `Hi ${input.candidateName},`,
            ``,
            `Thank you again for the time you gave us during our recent process for the **${input.jobTitle}** role. While we've filled this particular position, we were genuinely impressed with your background and want to stay connected.`,
            ``,
            `With your permission, I'd like to add you to our talent network${input.futureRoleHint ? ` — specifically with ${input.futureRoleHint} in mind` : ''}. This means you'd be among the first to hear from us when a relevant role opens up. No spam — only meaningful outreach.`,
            ``,
            input.companyCareerPageUrl ? `You can also keep an eye on our open roles here: ${input.companyCareerPageUrl}` : '',
            ``,
            `Just reply "yes" if you"re happy for us to keep in touch, or let me know if you'd prefer we didn"t.`,
            ``,
            `Either way, thank you for considering us — and best of luck with your search.`,
            ``,
            `Warmly,`,
            `${input.recruiterName}`,
            input.recruiterEmail ? input.recruiterEmail : '',
            `${input.companyName}`,
        ].filter(l => l !== '').join('\n'),
        stage: input.stage,
        tone: 'warm',
        eeoComplianceNotes: EEOC_NOTES,
        tips: [
            'Always get explicit consent before adding to talent pool — GDPR/CCPA requirement',
            'Tag candidates with skills and role type in your ATS so you can search them later',
            'Set a reminder to re-engage in 6 months with a personalised update',
        ],
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function composeRejection(input: RejectionInput): RejectionMessage {
    switch (input.stage) {
        case 'application_ack':        return buildApplicationAck(input);
        case 'post_screen_reject':     return buildPostScreenReject(input);
        case 'post_interview_reject':  return buildPostInterviewReject(input);
        case 'final_round_reject':     return buildFinalRoundReject(input);
        case 'offer_declined_response':return buildOfferDeclinedResponse(input);
        case 'talent_pool_add':        return buildTalentPoolAdd(input);
    }
}
