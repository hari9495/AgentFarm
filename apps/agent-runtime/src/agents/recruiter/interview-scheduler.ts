/**
 * Interview Scheduler
 *
 * Coordinates interview logistics between candidates and hiring panel members:
 * proposes time slots, generates calendar invites, confirmation emails,
 * and pre-interview prep packs for both the candidate and the interviewer.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterviewFormat = 'phone_screen' | 'video_call' | 'onsite' | 'take_home' | 'panel';
export type InterviewStage =
    | 'initial_screen'
    | 'hiring_manager'
    | 'technical_round'
    | 'cultural_fit'
    | 'final_panel'
    | 'executive';

export interface Interviewer {
    name: string;
    title: string;
    email: string;
    linkedInUrl?: string;
    focusArea?: string;   // e.g. "system design", "leadership", "culture"
}

export interface InterviewSlot {
    date: string;          // YYYY-MM-DD
    startTime: string;     // HH:MM 24h
    endTime: string;
    timezone: string;
}

export interface ScheduleInterviewInput {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    companyName: string;
    stage: InterviewStage;
    format: InterviewFormat;
    durationMinutes: number;
    interviewers: Interviewer[];
    proposedSlots: InterviewSlot[];
    videoLink?: string;           // Zoom/Meet/Teams link
    officeAddress?: string;       // for onsite
    recruiterName: string;
    recruiterEmail: string;
    calendarLink?: string;        // self-service booking link
    jobDescriptionUrl?: string;
    companyValuesUrl?: string;
}

export interface CalendarInvite {
    title: string;
    startDateTime: string;
    endDateTime: string;
    timezone: string;
    attendees: string[];
    location: string;
    description: string;
}

export interface InterviewPrepPack {
    forCandidate: string;
    forInterviewers: string;
}

export interface ScheduleInterviewResult {
    candidateName: string;
    jobTitle: string;
    stage: InterviewStage;
    format: InterviewFormat;
    confirmationEmailToCandidate: string;
    confirmationEmailToInterviewers: string;
    calendarInvite: CalendarInvite;
    prepPack: InterviewPrepPack;
    proposedSlotsSummary: string[];
    nextSteps: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMAT_LABEL: Record<InterviewFormat, string> = {
    phone_screen: 'Phone Screen',
    video_call: 'Video Interview',
    onsite: 'On-site Interview',
    take_home: 'Take-home Assessment',
    panel: 'Panel Interview',
};

const STAGE_LABEL: Record<InterviewStage, string> = {
    initial_screen: 'Initial Screen',
    hiring_manager: 'Hiring Manager Interview',
    technical_round: 'Technical Round',
    cultural_fit: 'Culture & Values Interview',
    final_panel: 'Final Panel',
    executive: 'Executive Interview',
};

function formatSlot(slot: InterviewSlot): string {
    return `${slot.date} at ${slot.startTime}–${slot.endTime} ${slot.timezone}`;
}

function locationString(input: ScheduleInterviewInput): string {
    if (input.videoLink) return input.videoLink;
    if (input.officeAddress) return input.officeAddress;
    return 'Details to be confirmed';
}

function buildCandidateEmail(input: ScheduleInterviewInput, primary: InterviewSlot): string {
    const format = FORMAT_LABEL[input.format];
    const stage = STAGE_LABEL[input.stage];
    const interviewerList = input.interviewers.map(i => `- ${i.name}, ${i.title}`).join('\n');
    const slotOptions = input.proposedSlots.map((s, i) => `  Option ${i + 1}: ${formatSlot(s)}`).join('\n');

    return [
        `Subject: Your ${stage} with ${input.companyName} — ${format}`,
        '',
        `Hi ${input.candidateName},`,
        '',
        `Great news — we'd love to schedule your **${stage}** for the **${input.jobTitle}** role at ${input.companyName}.`,
        '',
        `**Format:** ${format} (${input.durationMinutes} minutes)`,
        `**Your interviewer(s):**`,
        interviewerList,
        '',
        input.proposedSlots.length > 1
            ? `**Proposed time slots (please confirm your preference):**\n${slotOptions}`
            : `**Scheduled time:** ${formatSlot(primary)}`,
        '',
        input.videoLink ? `**Video link:** ${input.videoLink}` : '',
        input.officeAddress ? `**Location:** ${input.officeAddress}` : '',
        '',
        '**To prepare:**',
        input.jobDescriptionUrl ? `- Re-read the job description: ${input.jobDescriptionUrl}` : '- Review the role requirements we shared earlier',
        `- Research ${input.companyName}'s products, recent news, and mission`,
        input.companyValuesUrl ? `- Review our values: ${input.companyValuesUrl}` : '',
        `- Prepare 2–3 examples using the STAR method (Situation, Task, Action, Result)`,
        `- Have questions ready for your interviewers`,
        '',
        `If none of these times work, please reply and we'll find an alternative.`,
        '',
        input.calendarLink ? `Or self-schedule here: ${input.calendarLink}` : '',
        '',
        `Looking forward to speaking with you!`,
        '',
        `Best,`,
        input.recruiterName,
        input.companyName,
    ].filter(l => l !== '').join('\n');
}

function buildInterviewerEmail(input: ScheduleInterviewInput, primary: InterviewSlot): string {
    const stage = STAGE_LABEL[input.stage];
    const format = FORMAT_LABEL[input.format];

    return [
        `Subject: [Action Required] Interview Panel — ${input.candidateName} for ${input.jobTitle}`,
        '',
        `Hi Team,`,
        '',
        `Please see details below for the upcoming ${stage} with **${input.candidateName}**, who is interviewing for the **${input.jobTitle}** role.`,
        '',
        `**When:** ${formatSlot(primary)}`,
        `**Format:** ${format} (${input.durationMinutes} mins)`,
        `**Location / Link:** ${locationString(input)}`,
        '',
        '**Panel assignments:**',
        ...input.interviewers.map(i =>
            `- **${i.name}** (${i.title}): ${i.focusArea ? `Focus — ${i.focusArea}` : 'General evaluation'}`,
        ),
        '',
        `**Please:**`,
        `1. Accept the calendar invite`,
        `2. Review the candidate's resume (attached / in ATS)`,
        `3. Prepare your questions aligned to your focus area`,
        `4. Submit feedback in the ATS within 24 hours of the interview`,
        '',
        `Reply if you have any conflicts.`,
        '',
        `Thanks,`,
        input.recruiterName,
    ].join('\n');
}

function buildCandidatePrepPack(input: ScheduleInterviewInput): string {
    const stage = STAGE_LABEL[input.stage];
    const interviewerBios = input.interviewers.map(i => [
        `**${i.name}** — ${i.title}`,
        i.focusArea ? `  Their focus: ${i.focusArea}` : '',
        i.linkedInUrl ? `  LinkedIn: ${i.linkedInUrl}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    return [
        `# Interview Prep Pack — ${stage} at ${input.companyName}`,
        '',
        `## Role`,
        `**${input.jobTitle}**`,
        '',
        `## Who You'll Meet`,
        interviewerBios,
        '',
        `## What to Expect (${input.durationMinutes} minutes)`,
        `Format: ${FORMAT_LABEL[input.format]}`,
        '',
        `## Tips`,
        `- Lead with outcomes: quantify your impact where possible`,
        `- For every behavioural question, use STAR (Situation → Task → Action → Result)`,
        `- It's fine to ask for a moment to think before answering`,
        `- Prepare 3–5 thoughtful questions to ask your interviewers`,
        '',
        `## Good Questions to Ask`,
        `- What does success look like in this role after 90 days?`,
        `- What are the biggest challenges the team is currently facing?`,
        `- How does the team collaborate across functions?`,
        `- What growth opportunities exist for this role?`,
        '',
        `## Logistics`,
        locationString(input),
    ].join('\n');
}

function buildInterviewerPrepPack(input: ScheduleInterviewInput): string {
    const stage = STAGE_LABEL[input.stage];

    return [
        `# Interviewer Guide — ${stage}: ${input.candidateName}`,
        '',
        `**Role:** ${input.jobTitle}`,
        `**Duration:** ${input.durationMinutes} minutes`,
        '',
        `## Scoring rubric (use ATS feedback form)`,
        `| Dimension | Weight |`,
        `|-----------|--------|`,
        `| Technical / Role Competency | 40% |`,
        `| Problem-solving & Critical Thinking | 25% |`,
        `| Communication & Collaboration | 20% |`,
        `| Cultural Alignment | 15% |`,
        '',
        `## Suggested interview flow`,
        `1. **Intro (3 min)** — Welcome, agenda overview`,
        `2. **Background (5 min)** — "Walk me through your career to date"`,
        `3. **Core questions (${input.durationMinutes - 15} min)** — Competency / behavioural questions`,
        `4. **Candidate Q&A (5 min)** — Answer their questions`,
        `5. **Close (2 min)** — Explain next steps`,
        '',
        `## Reminders`,
        `- Avoid questions about age, marital status, religion, or national origin`,
        `- Take structured notes; avoid relying solely on memory`,
        `- Submit feedback in the ATS within 24 hours`,
        `- Do NOT share compensation or team headcount details — direct to recruiter`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scheduleInterview(input: ScheduleInterviewInput): ScheduleInterviewResult {
    const primary = input.proposedSlots[0] ?? {
        date: 'TBD',
        startTime: 'TBD',
        endTime: 'TBD',
        timezone: 'UTC',
    };

    const calInviteTitle = `${STAGE_LABEL[input.stage]}: ${input.candidateName} — ${input.jobTitle} @ ${input.companyName}`;

    const calendarInvite: CalendarInvite = {
        title: calInviteTitle,
        startDateTime: `${primary.date}T${primary.startTime}`,
        endDateTime: `${primary.date}T${primary.endTime}`,
        timezone: primary.timezone,
        attendees: [
            input.candidateEmail,
            input.recruiterEmail,
            ...input.interviewers.map(i => i.email),
        ],
        location: locationString(input),
        description: `${STAGE_LABEL[input.stage]} for ${input.jobTitle} at ${input.companyName}.\nFormat: ${FORMAT_LABEL[input.format]}\nDuration: ${input.durationMinutes} minutes`,
    };

    const nextSteps = [
        `Send candidate confirmation email`,
        `Send interviewer briefing email`,
        `Add calendar invite to all attendees`,
        `Share candidate resume with panel in ATS`,
        `Set reminder: collect interviewer feedback within 24h of interview`,
        input.proposedSlots.length > 1
            ? `Await candidate slot selection — update invite once confirmed`
            : `All slots confirmed — monitor for attendance`,
    ];

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        stage: input.stage,
        format: input.format,
        confirmationEmailToCandidate: buildCandidateEmail(input, primary),
        confirmationEmailToInterviewers: buildInterviewerEmail(input, primary),
        calendarInvite,
        prepPack: {
            forCandidate: buildCandidatePrepPack(input),
            forInterviewers: buildInterviewerPrepPack(input),
        },
        proposedSlotsSummary: input.proposedSlots.map(formatSlot),
        nextSteps,
    };
}
