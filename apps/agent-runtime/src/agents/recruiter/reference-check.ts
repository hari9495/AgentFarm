/**
 * Reference Check
 *
 * Manages the full reference-check workflow:
 *   1. Candidate reference request email
 *   2. Reference provider questionnaire (role-calibrated)
 *   3. Reference debrief capture and scoring
 *   4. Consolidated reference summary for the hiring panel
 *
 * Questionnaires are tailored by job domain (clinical, legal, finance,
 * technical, managerial, creative, etc.).
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferenceRelationship =
    | 'direct_manager'
    | 'skip_level_manager'
    | 'peer'
    | 'direct_report'
    | 'client'
    | 'professor'
    | 'mentor';

export type JobDomain =
    | 'technical'
    | 'clinical'
    | 'legal'
    | 'finance'
    | 'managerial'
    | 'sales'
    | 'creative'
    | 'education'
    | 'general';

export interface ReferenceProvider {
    name: string;
    title: string;
    company: string;
    email: string;
    relationship: ReferenceRelationship;
    yearsKnown?: number;
}

export interface ReferenceRequestInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    references: ReferenceProvider[];
    referenceDeadline?: string;    // ISO date
    calendarLink?: string;
}

export interface ReferenceQuestion {
    id: string;
    question: string;
    probes?: string[];
    rationale: string;
}

export interface ReferenceQuestionnaireInput {
    candidateName: string;
    jobTitle: string;
    companyName: string;
    jobDomain: JobDomain;
    referenceProvider: ReferenceProvider;
    specificAreasToProbe?: string[];
}

export interface ReferenceDebriefInput {
    candidateName: string;
    jobTitle: string;
    referenceProvider: ReferenceProvider;
    responses: Record<string, string>;    // questionId → answer
    overallEndorsement: 'strong_yes' | 'yes' | 'qualified_yes' | 'no' | 'declined';
    additionalNotes?: string;
}

export interface ReferenceSummaryInput {
    candidateName: string;
    jobTitle: string;
    debriefs: ReferenceDebriefInput[];
}

export interface ReferenceCheckResult {
    candidateRequestEmail: string;
    refereeRequestEmails: Record<string, string>;   // referee email → email text
    questionnaire: ReferenceQuestion[];
    summary?: string;
}

// ---------------------------------------------------------------------------
// Domain question banks
// ---------------------------------------------------------------------------

const BASE_QUESTIONS: ReferenceQuestion[] = [
    { id: 'q_rel', question: 'How long have you known [CANDIDATE] and in what capacity?', rationale: 'Validates the reference relationship context', probes: ['Were you their direct manager?', 'How closely did you work together?'] },
    { id: 'q_role', question: "Can you describe [CANDIDATE]\'s role and primary responsibilities while you worked together?", rationale: 'Confirms resume accuracy' },
    { id: 'q_strength', question: "What are [CANDIDATE]\'s greatest professional strengths?", rationale: 'Identifies differentiating skills', probes: ['Can you give me a specific example?'] },
    { id: 'q_growth', question: 'What areas did you encourage [CANDIDATE] to develop further?', rationale: 'Surfaces growth areas; phrased neutrally to avoid loaded language' },
    { id: 'q_collab', question: 'How did [CANDIDATE] work with colleagues, stakeholders, and leadership?', rationale: 'Assesses collaboration and communication', probes: ['Any challenging relationships?', 'How did they handle conflict?'] },
    { id: 'q_rehire', question: 'Would you rehire [CANDIDATE] if you had the opportunity?', rationale: 'Single most predictive reference question', probes: ['If not, can you share why?'] },
    { id: 'q_next', question: 'Is there anything about [CANDIDATE] that you think I should know as we consider them for a [TITLE] role at [COMPANY]?', rationale: 'Open-ended final question; often surfaces critical information' },
];

const DOMAIN_QUESTIONS: Record<JobDomain, ReferenceQuestion[]> = {
    technical: [
        { id: 'q_tech_depth', question: "How would you rate [CANDIDATE]\'s technical depth and ability to learn new technologies?", rationale: 'Assesses learning agility', probes: ['Give me a specific example of them mastering a new technology'] },
        { id: 'q_code', question: "How would you describe the quality and maintainability of [CANDIDATE]\'s work?", rationale: 'Evaluates craft and rigour' },
        { id: 'q_problem', question: 'Describe a challenging technical problem [CANDIDATE] solved. What was their approach?', rationale: 'Assesses problem-solving depth' },
        { id: 'q_ownership', question: 'How did [CANDIDATE] handle incidents, bugs, or technical debt under their ownership?', rationale: 'Tests accountability and operational rigour' },
    ],
    clinical: [
        { id: 'q_clin_safety', question: "Did you ever have concerns about patient safety under [CANDIDATE]\'s care?", rationale: 'Non-negotiable safety check; any hesitation is a flag' },
        { id: 'q_clin_judgment', question: "How would you describe [CANDIDATE]\'s clinical judgment in complex or emergency situations?", rationale: 'Critical for patient outcomes' },
        { id: 'q_clin_compliance', question: 'Was [CANDIDATE] compliant with protocols, documentation standards, and regulatory requirements?', rationale: 'Checks for HIPAA, Joint Commission compliance' },
        { id: 'q_clin_team', question: 'How did [CANDIDATE] interact with interdisciplinary team members (physicians, nurses, allied health)?', rationale: 'Healthcare is team-based; culture fit matters' },
    ],
    legal: [
        { id: 'q_legal_judgment', question: "How would you describe [CANDIDATE]\'s legal judgment and analytical ability?", rationale: 'Core legal competency' },
        { id: 'q_legal_writing', question: "How would you rate [CANDIDATE]\'s legal writing and drafting skills?", rationale: 'Critical for most legal roles' },
        { id: 'q_legal_client', question: 'How did [CANDIDATE] manage client relationships and under pressure deadlines?', rationale: 'Client service and composure under pressure' },
        { id: 'q_legal_ethics', question: 'Are you aware of any ethical issues or bar complaints involving [CANDIDATE]?', rationale: 'Mandatory ethics check for attorneys', probes: ['This is a standard question we ask for all attorney positions'] },
    ],
    finance: [
        { id: 'q_fin_accuracy', question: "How would you characterise [CANDIDATE]\'s analytical rigour and attention to detail in financial work?", rationale: 'Accuracy is paramount in finance' },
        { id: 'q_fin_deadline', question: 'How did [CANDIDATE] perform under tight reporting deadlines (quarter/year-end close, earnings)?', rationale: 'Finance roles are time-critical' },
        { id: 'q_fin_integrity', question: "Did you have any concerns about [CANDIDATE]\'s financial integrity or professional ethics?", rationale: 'Fiduciary responsibility check', probes: ['Have they ever been subject to any regulatory inquiry?'] },
        { id: 'q_fin_influence', question: 'How well did [CANDIDATE] communicate financial insights to non-finance stakeholders?', rationale: 'Finance business partnering skill' },
    ],
    managerial: [
        { id: 'q_mgr_team', question: 'How did [CANDIDATE] build and develop their team? Can you give an example?', rationale: 'Assesses talent development' },
        { id: 'q_mgr_decision', question: "Describe [CANDIDATE]\'s decision-making style, especially when data was ambiguous or time was short.", rationale: 'Leadership quality' },
        { id: 'q_mgr_change', question: 'How did [CANDIDATE] lead their team through significant change or organisational challenge?', rationale: 'Change management ability' },
        { id: 'q_mgr_accountability', question: 'How did [CANDIDATE] hold their team accountable while maintaining morale?', rationale: 'Balancing performance and culture' },
    ],
    sales: [
        { id: 'q_sales_quota', question: 'Did [CANDIDATE] consistently achieve their sales targets? What were their best results?', rationale: 'Quota attainment is the primary sales metric' },
        { id: 'q_sales_pipeline', question: "How would you describe [CANDIDATE]\'s ability to build and manage a sales pipeline?", rationale: 'Assesses process and rigour' },
        { id: 'q_sales_complex', question: 'Can you describe how [CANDIDATE] handled a complex or high-stakes deal?', rationale: 'Enterprise sales competency' },
        { id: 'q_sales_collab', question: 'How did [CANDIDATE] work with pre-sales, marketing, and customer success teams?', rationale: 'Team collaboration in revenue function' },
    ],
    creative: [
        { id: 'q_cr_quality', question: "How would you describe the quality, consistency, and originality of [CANDIDATE]\'s creative work?", rationale: 'Core creative competency' },
        { id: 'q_cr_feedback', question: 'How did [CANDIDATE] receive and act on creative feedback from stakeholders?', rationale: 'Receptiveness to feedback is key in creative roles' },
        { id: 'q_cr_brief', question: 'How well did [CANDIDATE] interpret briefs and translate them into effective creative outputs?', rationale: 'Brief-to-execution quality' },
        { id: 'q_cr_deadline', question: 'Was [CANDIDATE] reliable in meeting creative deadlines without compromising quality?', rationale: 'Delivery against timelines' },
    ],
    education: [
        { id: 'q_ed_classroom', question: "How would you describe [CANDIDATE]\'s classroom management and student engagement?", rationale: 'Teaching effectiveness' },
        { id: 'q_ed_outcomes', question: 'What student outcomes and academic results did [CANDIDATE] achieve?', rationale: 'Impact on students' },
        { id: 'q_ed_safeguarding', question: 'Are you aware of any safeguarding concerns or disciplinary matters involving [CANDIDATE]?', rationale: 'Non-negotiable child/student protection check' },
        { id: 'q_ed_diff', question: 'How did [CANDIDATE] differentiate instruction for students with varying needs?', rationale: 'Inclusion and differentiation capability' },
    ],
    general: [],
};

// ---------------------------------------------------------------------------
// Email builders
// ---------------------------------------------------------------------------

function buildCandidateRequestEmail(input: ReferenceRequestInput): string {
    const refList = input.references.map((r, i) => `  ${i + 1}. ${r.name} (${r.title}, ${r.company}) — ${r.email}`).join('\n');
    const deadline = input.referenceDeadline ?? 'within the next 5 business days';
    return [
        `Subject: Reference Check — ${input.jobTitle} at ${input.companyName}`,
        '',
        `Hi ${input.candidateName},`,
        '',
        `Congratulations on progressing to the final stages of our process for the **${input.jobTitle}** role at **${input.companyName}**! We're very excited about your candidacy.`,
        '',
        `As part of our standard process, we'd like to conduct reference checks with the following individuals you provided:`,
        refList,
        '',
        `**We will reach out to each referee directly** — you don't need to do anything other than give them a quick heads-up that they may hear from us. We'll keep the conversations confidential and professional.`,
        '',
        `We aim to complete references by **${deadline}**. If any contact details have changed, please let us know immediately.`,
        '',
        `If you have any questions, don't hesitate to reach out.`,
        '',
        `Best,`,
        input.recruiterName,
        input.companyName,
    ].join('\n');
}

function buildRefereeEmail(
    referee: ReferenceProvider,
    candidateName: string,
    jobTitle: string,
    companyName: string,
    recruiterName: string,
    recruiterEmail: string,
    calendarLink?: string,
): string {
    return [
        `Subject: Reference for ${candidateName} — ${jobTitle} at ${companyName}`,
        '',
        `Dear ${referee.name},`,
        '',
        `My name is ${recruiterName} and I'm a recruiter at **${companyName}**. I'm reaching out because **${candidateName}** has listed you as a professional reference as part of their application for the **${jobTitle}** role with us.`,
        '',
        `We'd greatly appreciate 15–20 minutes of your time for a brief, confidential reference call at your convenience. All responses will be kept strictly confidential and used solely for our hiring decision.`,
        '',
        calendarLink
            ? `You can book a time that works for you directly here: **${calendarLink}**`
            : `Please reply to this email with your availability over the next 5 business days and I'll send a calendar invite.`,
        '',
        `If you'd prefer to respond in writing, I'm happy to send you a brief questionnaire by email instead — just let me know.`,
        '',
        `Thank you so much for your time — I know it's valuable.`,
        '',
        `Best regards,`,
        `${recruiterName}`,
        `${recruiterEmail}`,
        companyName,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildReferenceCheckPackage(input: ReferenceRequestInput): {
    candidateEmail: string;
    refereeEmails: Record<string, string>;
} {
    const candidateEmail = buildCandidateRequestEmail(input);
    const refereeEmails: Record<string, string> = {};
    for (const ref of input.references) {
        refereeEmails[ref.email] = buildRefereeEmail(
            ref,
            input.candidateName,
            input.jobTitle,
            input.companyName,
            input.recruiterName,
            input.recruiterEmail,
            input.calendarLink,
        );
    }
    return { candidateEmail, refereeEmails };
}

export function buildReferenceQuestionnaire(input: ReferenceQuestionnaireInput): ReferenceQuestion[] {
    const domain = input.jobDomain;
    const domainQs = DOMAIN_QUESTIONS[domain] ?? [];
    const all = [...BASE_QUESTIONS, ...domainQs];

    // Personalise question text
    return all.map(q => ({
        ...q,
        question: q.question
            .replace(/\[CANDIDATE\]/g, input.candidateName)
            .replace(/\[TITLE\]/g, input.jobTitle)
            .replace(/\[COMPANY\]/g, input.companyName),
        probes: q.probes?.map(p =>
            p.replace(/\[CANDIDATE\]/g, input.candidateName),
        ),
    }));
}

export function summariseReferenceDebriefs(input: ReferenceSummaryInput): string {
    const { candidateName, jobTitle, debriefs } = input;
    if (debriefs.length === 0) return 'No reference debriefs submitted yet.';

    const endorsements = debriefs.map(d => d.overallEndorsement);
    const strongYes = endorsements.filter(e => e === 'strong_yes').length;
    const yes = endorsements.filter(e => e === 'yes').length;
    const qualified = endorsements.filter(e => e === 'qualified_yes').length;
    const no = endorsements.filter(e => e === 'no').length;
    const declined = endorsements.filter(e => e === 'declined').length;

    const overallSignal = no > 0 || declined > 0 ? '⚠️ CONCERNS' : strongYes >= 2 ? '✅ STRONG' : '✓ POSITIVE';

    const refereeLines = debriefs.map(d => [
        `**${d.referenceProvider.name}** (${d.referenceProvider.relationship.replace(/_/g, ' ')}) — ${d.overallEndorsement.replace(/_/g, ' ').toUpperCase()}`,
        d.additionalNotes ? `  Notes: "${d.additionalNotes}"` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    const recommendation = no > 0
        ? `⛔ One or more referees expressed concerns. Discuss with hiring manager before proceeding.`
        : declined > 0
        ? `⚠️ ${declined} referee(s) declined to comment — investigate reason before extending offer.`
        : strongYes + yes >= debriefs.length - 1
        ? `✅ References are consistently positive. Clear to proceed with offer.`
        : `✓ References are generally positive with minor qualifications — use judgment.`;

    return [
        `# Reference Summary — ${candidateName}`,
        `**Role:** ${jobTitle}  |  **Signal: ${overallSignal}**`,
        `**Breakdown:** Strong Yes: ${strongYes} | Yes: ${yes} | Qualified: ${qualified} | No: ${no} | Declined: ${declined}`,
        '',
        `## Individual Summaries`,
        refereeLines,
        '',
        `## Recommendation`,
        recommendation,
    ].join('\n');
}
