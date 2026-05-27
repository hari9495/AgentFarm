/**
 * Outreach Composer
 *
 * Generates personalised candidate outreach messages (email & LinkedIn InMail)
 * calibrated to active vs passive candidates and the role's seniority level.
 * Supports multi-touch follow-up sequences.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutreachChannel = 'email' | 'linkedin_inmail' | 'sms';
export type CandidateStatus = 'passive' | 'active';
export type FollowUpStep = 1 | 2 | 3;

export interface OutreachSpec {
    candidateName: string;
    candidateCurrentTitle: string;
    candidateCurrentCompany: string;
    recruiterName: string;
    companyName: string;
    roleTitle: string;
    roleSeniority: 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
    keyValueProp: string;            // e.g. "building the next-gen ML platform"
    workArrangement: 'remote' | 'hybrid' | 'onsite';
    location?: string;
    candidateStatus: CandidateStatus;
    channel: OutreachChannel;
    followUpStep?: FollowUpStep;     // undefined = initial outreach
    specificHook?: string;           // personalisation hook, e.g. "saw your talk at React Summit"
    calendarLink?: string;
}

export interface OutreachMessage {
    subject?: string;               // email only
    body: string;
    channel: OutreachChannel;
    tone: 'formal' | 'conversational';
    wordCount: number;
    followUpStep: number;
    tips: string[];
}

export interface OutreachSequence {
    candidateName: string;
    roleTitle: string;
    messages: OutreachMessage[];
    cadence: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const ARRANGEMENT_LABEL: Record<string, string> = {
    remote: 'fully remote',
    hybrid: 'hybrid',
    onsite: 'on-site in',
};

function arrangementPhrase(spec: OutreachSpec): string {
    if (spec.workArrangement === 'onsite' && spec.location) {
        return `on-site in ${spec.location}`;
    }
    return ARRANGEMENT_LABEL[spec.workArrangement] ?? spec.workArrangement;
}

function hookSentence(spec: OutreachSpec): string {
    if (spec.specificHook) return `${spec.specificHook} — `;
    if (spec.candidateStatus === 'passive') {
        return `Your background at ${spec.candidateCurrentCompany} as ${spec.candidateCurrentTitle} caught my eye — `;
    }
    return '';
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function buildInitialEmail(spec: OutreachSpec): OutreachMessage {
    const hook = hookSentence(spec);
    const arr = arrangementPhrase(spec);
    const subject = `${spec.roleTitle} opportunity at ${spec.companyName} — thought of you`;

    const body = [
        `Hi ${spec.candidateName},`,
        '',
        `${hook}I'm ${spec.recruiterName}, a recruiter at ${spec.companyName}.`,
        '',
        `We're building something exciting — ${spec.keyValueProp} — and we're looking for a ${spec.roleTitle} to help lead this work. The role is ${arr}, and given your experience, I thought you might find it worth a look.`,
        '',
        spec.candidateStatus === 'passive'
            ? `I know you may not be actively looking, but I wanted to reach out directly because your profile genuinely stood out to us.`
            : `We'd love to connect and share more about the role and what makes ${spec.companyName} a great place to grow.`,
        '',
        spec.calendarLink
            ? `If you're open to a quick 15-minute chat, feel free to grab time here: ${spec.calendarLink}`
            : `Would you be open to a quick 15-minute chat this week or next? Happy to work around your schedule.`,
        '',
        `Best,`,
        spec.recruiterName,
        spec.companyName,
    ].join('\n');

    return {
        subject,
        body,
        channel: spec.channel,
        tone: 'conversational',
        wordCount: body.split(/\s+/).length,
        followUpStep: 0,
        tips: [
            'Personalise the hook with a specific detail from their LinkedIn (project, publication, award)',
            'Keep subject lines under 60 characters to avoid mobile truncation',
            'Send Tuesday–Thursday, 9–11 am recipient local time for best open rates',
        ],
    };
}

function buildInitialLinkedIn(spec: OutreachSpec): OutreachMessage {
    const hook = spec.specificHook ? `${spec.specificHook}. ` : '';
    const arr = arrangementPhrase(spec);

    const body = [
        `Hi ${spec.candidateName},`,
        '',
        `${hook}I'm ${spec.recruiterName} at ${spec.companyName}. We're hiring a ${spec.roleTitle} (${arr}) to ${spec.keyValueProp}.`,
        '',
        `Your background as ${spec.candidateCurrentTitle} at ${spec.candidateCurrentCompany} looks like a strong fit. Would you be open to a quick 15-min call to hear more?`,
        '',
        `Thanks,`,
        spec.recruiterName,
    ].join('\n');

    return {
        body,
        channel: spec.channel,
        tone: 'conversational',
        wordCount: body.split(/\s+/).length,
        followUpStep: 0,
        tips: [
            'LinkedIn InMail character limit: 2,000 chars — keep it short',
            'Avoid generic phrases like "exciting opportunity" — be specific about WHY them',
            'InMail acceptance rates are 2–3× higher when personalised with a specific detail',
        ],
    };
}

function buildFollowUp(spec: OutreachSpec, step: FollowUpStep): OutreachMessage {
    const stepContent: Record<FollowUpStep, { subject: string; body: string; tips: string[] }> = {
        1: {
            subject: `Following up — ${spec.roleTitle} at ${spec.companyName}`,
            body: [
                `Hi ${spec.candidateName},`,
                '',
                `Just wanted to bump this to the top of your inbox in case it got lost.`,
                '',
                `We're still looking for a ${spec.roleTitle} at ${spec.companyName} and I genuinely think you'd be a great fit for what we're building — ${spec.keyValueProp}.`,
                '',
                `Even if now isn't the right time, I'd love to keep in touch for the future. Would a quick 15-minute call work for you this week?`,
                '',
                `Thanks,`,
                spec.recruiterName,
            ].join('\n'),
            tips: [
                'Wait 5–7 business days after initial outreach before following up',
                'Reference your previous message to provide continuity',
            ],
        },
        2: {
            subject: `Last note — ${spec.roleTitle} @ ${spec.companyName}`,
            body: [
                `Hi ${spec.candidateName},`,
                '',
                `I'll keep this brief — I've reached out a couple of times about a ${spec.roleTitle} opportunity at ${spec.companyName}.`,
                '',
                `If the timing isn't right or this isn't the type of move you're considering, totally understood — no pressure at all.`,
                '',
                `But if you'd like to hear more about what we're building (${spec.keyValueProp}), I'm just a reply away.`,
                '',
                `Wishing you all the best either way.`,
                '',
                spec.recruiterName,
            ].join('\n'),
            tips: [
                'Third touch should give the candidate an easy "out" — removes pressure and often generates replies',
                'After this, move candidate to a nurture list for future roles',
            ],
        },
        3: {
            subject: `Staying in touch — ${spec.companyName}`,
            body: [
                `Hi ${spec.candidateName},`,
                '',
                `It's ${spec.recruiterName} from ${spec.companyName}. I know we've connected before regarding the ${spec.roleTitle} role.`,
                '',
                `I'm reaching out one final time. If things have changed and you're open to exploring something new, I'd love to reconnect.`,
                '',
                spec.calendarLink
                    ? `You can grab 15 mins here: ${spec.calendarLink}`
                    : `Feel free to reply and we'll find a time that works.`,
                '',
                `Otherwise, I'll leave you to it — and I hope our paths cross again.`,
                '',
                `Best,`,
                spec.recruiterName,
                spec.companyName,
            ].join('\n'),
            tips: [
                'This is the final touchpoint — archive candidate after this',
                'Add to a talent pool for future outreach in 6–12 months',
            ],
        },
    };

    const content = stepContent[step];
    return {
        subject: content.subject,
        body: content.body,
        channel: spec.channel,
        tone: 'conversational',
        wordCount: content.body.split(/\s+/).length,
        followUpStep: step,
        tips: content.tips,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function composeOutreach(spec: OutreachSpec): OutreachMessage {
    const step = spec.followUpStep;

    if (step && step >= 1 && step <= 3) {
        return buildFollowUp(spec, step as FollowUpStep);
    }

    if (spec.channel === 'linkedin_inmail') {
        return buildInitialLinkedIn(spec);
    }

    return buildInitialEmail(spec);
}

export function buildOutreachSequence(spec: OutreachSpec): OutreachSequence {
    const initial = composeOutreach({ ...spec, followUpStep: undefined });
    const fu1 = buildFollowUp({ ...spec }, 1);
    const fu2 = buildFollowUp({ ...spec }, 2);
    const fu3 = buildFollowUp({ ...spec }, 3);

    return {
        candidateName: spec.candidateName,
        roleTitle: spec.roleTitle,
        messages: [initial, fu1, fu2, fu3],
        cadence: 'Day 0 → Day 6 → Day 13 → Day 20 (archive if no reply)',
    };
}
