/**
 * Candidate Assessment
 *
 * Generates structured pre-interview assessments for any role type:
 *   - Take-home assignment brief (sent to candidate)
 *   - Scoring rubric per domain (used by evaluators)
 *   - Platform setup hints (HackerRank, Codility, TestGorilla, etc.)
 *   - Cognitive / personality test coordination notes
 *
 * Covers: Engineering, Product, Design, Marketing, Sales, Finance,
 *         Legal, Healthcare/Clinical, Data Science, Operations, General.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssessmentType =
    | 'take_home_technical'      // Code / architecture exercise
    | 'take_home_case_study'     // Business case / strategy
    | 'take_home_portfolio'      // Design / writing samples
    | 'take_home_writing'        // Written comms / content sample
    | 'coding_challenge'         // Timed online coding (HackerRank / Codility)
    | 'work_sample'              // Role-specific task (e.g. financial model, legal memo)
    | 'cognitive_aptitude'       // Numerical / verbal / logical reasoning
    | 'personality_values'       // Culture / values fit survey
    | 'presentation'             // Slide deck + live presentation
    | 'trial_day';               // Paid half/full day working with team

export type AssessmentDomain =
    | 'engineering'
    | 'data_science'
    | 'product'
    | 'design'
    | 'marketing'
    | 'sales'
    | 'finance_accounting'
    | 'legal'
    | 'healthcare_clinical'
    | 'operations'
    | 'hr_people'
    | 'education'
    | 'government_public_sector'
    | 'construction_trades'
    | 'aviation'
    | 'creative_media'
    | 'general';

export interface AssessmentBriefInput {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    domain: AssessmentDomain;
    assessmentType: AssessmentType;
    durationHours: number;           // Expected time commitment
    submissionDeadlineDays: number;  // Calendar days from sending
    platformLink?: string;           // HackerRank / Codility / TestGorilla URL
    problemStatement?: string;       // Custom problem override
    evaluators?: string[];           // Names of people scoring
    compensated?: boolean;           // True for trial days
    nda?: boolean;                   // Require NDA before sending
}

export interface RubricLevel {
    score: number;                   // e.g. 1, 2, 3, 4
    label: string;                   // e.g. "Does not meet", "Meets", "Exceeds"
    description: string;
}

export interface ScoringCriterion {
    name: string;
    description: string;
    weight: number;                  // % of total score (all criteria sum to 100)
    levels: RubricLevel[];
}

export interface AssessmentBrief {
    candidateName: string;
    jobTitle: string;
    assessmentType: AssessmentType;
    domain: AssessmentDomain;
    candidateEmail: string;          // Email body to send to candidate
    evaluatorBrief: string;          // Briefing note for evaluators
    rubric: ScoringCriterion[];
    totalPossibleScore: number;
    passingThreshold: number;        // Min score to advance
    platformNotes: string;
    sendingChecklist: string[];
    complianceNotes: string[];
}

// ---------------------------------------------------------------------------
// Domain rubrics
// ---------------------------------------------------------------------------

const RUBRIC_LEVELS: RubricLevel[] = [
    { score: 1, label: 'Does not meet expectations', description: 'Significant gaps; work is incomplete or incorrect.' },
    { score: 2, label: 'Partially meets expectations', description: 'Some elements present; notable weaknesses.' },
    { score: 3, label: 'Meets expectations',          description: 'Solid work; covers all key requirements competently.' },
    { score: 4, label: 'Exceeds expectations',        description: 'Exceptional quality; goes beyond the brief with insight.' },
];

type RubricMap = Record<AssessmentDomain, ScoringCriterion[]>;

const DOMAIN_RUBRICS: RubricMap = {
    engineering: [
        { name: 'Code correctness', description: 'Solution is functionally correct and handles edge cases.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Code quality & readability', description: 'Clean, well-named, idiomatic code. Easy for another engineer to maintain.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Test coverage', description: 'Meaningful unit/integration tests that would catch regressions.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'System / API design', description: 'Well-structured architecture, sensible abstractions and separation of concerns.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Documentation', description: 'README / inline comments explain decisions and how to run the solution.', weight: 10, levels: RUBRIC_LEVELS },
        { name: 'Performance & scalability awareness', description: 'Candidate demonstrates awareness of complexity and potential bottlenecks.', weight: 5, levels: RUBRIC_LEVELS },
    ],
    data_science: [
        { name: 'Problem framing & EDA', description: 'Clear understanding of the business problem; insightful exploratory analysis.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Methodology selection', description: 'Appropriate model/technique chosen and justified.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Model performance', description: 'Metrics interpreted correctly; train/test split, overfitting addressed.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Code quality & reproducibility', description: 'Notebook is clean, reproducible, and well-commented.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Communication of findings', description: 'Results explained in plain language with actionable recommendations.', weight: 15, levels: RUBRIC_LEVELS },
    ],
    product: [
        { name: 'Problem framing', description: 'Correctly identifies and scopes the problem; avoids solution-first thinking.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'User insight', description: 'Demonstrates empathy for users; uses data or research to ground decisions.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Prioritisation & trade-offs', description: 'Clear, reasoned prioritisation; acknowledges constraints honestly.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Business impact', description: 'Links product decisions to measurable business outcomes.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Clarity of communication', description: 'Crisp, structured writing or presentation; minimal jargon.', weight: 15, levels: RUBRIC_LEVELS },
    ],
    design: [
        { name: 'Visual craft', description: 'Hierarchy, spacing, type, colour — all applied with intention and consistency.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'UX / interaction thinking', description: 'Flow is intuitive; micro-interactions and states are considered.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Problem framing', description: 'Brief is read critically; candidate asks the right questions before designing.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Rationale & presentation', description: 'Design decisions are explained clearly; trade-offs are acknowledged.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Iteration & process', description: 'Evidence of iteration (wireframes → hi-fi); responsive to constraints.', weight: 15, levels: RUBRIC_LEVELS },
    ],
    marketing: [
        { name: 'Strategic thinking', description: 'Clear understanding of target audience, positioning, and competitive context.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Copy / content quality', description: 'Writing is compelling, on-brand, and audience-appropriate.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Channel & tactic knowledge', description: 'Appropriate channels recommended with sound rationale.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Analytics & measurement', description: 'Clear KPIs defined; approach to tracking and iteration outlined.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Creativity & originality', description: 'Standout ideas that differentiate from generic playbook recommendations.', weight: 15, levels: RUBRIC_LEVELS },
    ],
    sales: [
        { name: 'Discovery & qualification', description: 'Uses MEDDIC / SPIN / BANT framework; asks probing questions to qualify.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Value articulation', description: 'Clearly maps product capabilities to prospect pain points.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Objection handling', description: 'Responds to objections with empathy and data; does not capitulate immediately.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Closing technique', description: 'Natural progression to ask for next step; avoids high-pressure tactics.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Pipeline & follow-up thinking', description: 'Considers what happens after the meeting; demonstrates long-term relationship focus.', weight: 15, levels: RUBRIC_LEVELS },
    ],
    finance_accounting: [
        { name: 'Technical accuracy', description: 'Numbers, formulas, and accounting treatment are correct.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Model structure & clarity', description: 'Workbook is clean, labelled, with clear inputs / outputs / assumptions sections.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Assumptions & judgement', description: 'Assumptions are documented; sensitivity analysis or scenario modelling included.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Business insight', description: 'Numbers are interpreted; candidate draws meaningful conclusions and flags risks.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Communication', description: 'Executive summary is concise and decision-ready.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    legal: [
        { name: 'Issue spotting', description: 'Identifies the key legal issues without missing material risks.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Legal analysis', description: 'Applies the correct legal framework; analysis is well-reasoned and balanced.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Writing quality', description: 'Clear, precise, professional legal writing. No ambiguity in operative clauses.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Risk assessment & practical advice', description: 'Identifies commercial risks; advice is actionable for a non-lawyer client.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Jurisdiction & compliance awareness', description: 'Correct jurisdiction flagged; regulatory requirements acknowledged.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    healthcare_clinical: [
        { name: 'Clinical knowledge accuracy', description: 'Information is evidence-based, up to date, and clinically sound.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Patient safety awareness', description: 'Demonstrates "safety first" mindset; escalation thresholds are appropriate.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Documentation quality', description: 'Notes are clear, accurate, SBAR/SOAP-structured where appropriate.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Communication & empathy', description: 'Patient / family communication is compassionate and comprehensible.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Regulatory & ethical compliance', description: 'Adheres to scope of practice; flags ethical issues appropriately.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    operations: [
        { name: 'Process thinking', description: 'Identifies bottlenecks and proposes systematic solutions.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Data-driven decision making', description: 'Uses metrics and data to support recommendations.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Cross-functional awareness', description: 'Considers upstream/downstream impact of proposed changes.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Execution & prioritisation', description: 'Realistic implementation plan with clear priorities and dependencies.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Communication', description: 'Findings are communicated clearly to a mixed stakeholder audience.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    hr_people: [
        { name: 'Situational judgment', description: 'Navigates ambiguous people scenarios with sound, empathetic judgment.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Employment law awareness', description: 'Identifies legal risks; escalates appropriately without overstepping.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Communication & influencing', description: 'Clear, professional written communication; adapts tone to audience.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Process design', description: 'Proposes scalable, fair processes that minimise bias.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Data & metrics', description: 'Uses people data to support decisions; tracks meaningful HR KPIs.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    education: [
        { name: 'Pedagogical knowledge', description: 'Demonstrates understanding of evidence-based teaching strategies and curriculum design.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Lesson planning & differentiation', description: 'Ability to design inclusive lessons that address diverse learning needs and ability levels.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Safeguarding awareness', description: 'Clear understanding of child/vulnerable-adult protection duties, reporting thresholds, and DBS/clearance requirements.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Classroom communication', description: 'Written and verbal communication is appropriate for the student audience; feedback is constructive and clear.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Professional standards & ethics', description: 'Demonstrates commitment to professional codes of conduct (e.g. Teachers\' Standards, NAEYC, state licensure requirements).', weight: 10, levels: RUBRIC_LEVELS },
    ],
    government_public_sector: [
        { name: 'Policy analysis & interpretation', description: 'Accurately interprets legislation, regulations, and policy briefs; identifies implications for stakeholders.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Compliance & regulatory awareness', description: 'Demonstrates understanding of applicable laws, FOI obligations, ethics rules, and conflict-of-interest requirements.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Stakeholder communication', description: 'Communicates clearly to both technical and non-technical audiences; reports are concise and decision-ready.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Security & confidentiality', description: 'Handles sensitive information appropriately; understands classification levels and handling caveats.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Budget & resource stewardship', description: 'Demonstrates responsible use of public funds; identifies cost-efficiency without compromising service quality.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    construction_trades: [
        { name: 'Technical / trade knowledge', description: 'Demonstrates depth of knowledge relevant to the specific trade (electrical, plumbing, HVAC, civil, structural, etc.).', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Safety & compliance', description: 'Applies OSHA / HSE / local safety standards correctly; identifies hazards proactively; PPE usage is appropriate.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Blueprint / spec reading', description: 'Accurately interprets construction drawings, specifications, and schedules.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Quality & attention to detail', description: 'Work meets code requirements and quality standards; defects are identified and corrected proactively.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Teamwork & site communication', description: 'Collaborates with foremen, subcontractors, and inspectors; communicates delays or issues promptly.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    aviation: [
        { name: 'Regulatory & licence knowledge', description: 'Demonstrates accurate knowledge of applicable FAA / EASA / ICAO / CASA regulations; licence currency and limitations are understood.', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Safety management & SMS', description: 'Applies Safety Management System principles; hazard identification and risk mitigation are systematic.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Technical aircraft knowledge', description: 'Demonstrates understanding of aircraft systems, maintenance / operating procedures, and airworthiness standards relevant to the role.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Crew resource management (CRM)', description: 'Communicates clearly under pressure; demonstrates assertiveness, situational awareness, and decision-making in simulated scenarios.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Documentation & record-keeping', description: 'Maintenance logs, journey logs, or technical records are accurate, complete, and compliant.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    creative_media: [
        { name: 'Portfolio quality & craft', description: 'Work demonstrates technical proficiency, originality, and attention to the medium (copywriting, design, video, photography, etc.).', weight: 30, levels: RUBRIC_LEVELS },
        { name: 'Brief interpretation', description: 'Work clearly responds to the brief; creative choices are purposeful and audience-appropriate.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Brand & tone consistency', description: 'Output aligns with specified brand voice, visual identity, or editorial style guidelines.', weight: 20, levels: RUBRIC_LEVELS },
        { name: 'Feedback receptiveness & iteration', description: 'Demonstrates ability to incorporate stakeholder feedback constructively without losing creative integrity.', weight: 15, levels: RUBRIC_LEVELS },
        { name: 'Deadline & project management', description: 'Delivers quality work within stated time constraints; communicates scope changes proactively.', weight: 10, levels: RUBRIC_LEVELS },
    ],
    general: [
        { name: 'Communication clarity', description: 'Written / verbal output is clear, concise, and well-structured.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Problem-solving approach', description: 'Breaks down ambiguous problems systematically.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Attention to detail', description: 'Output is accurate, thorough, and free of errors.', weight: 25, levels: RUBRIC_LEVELS },
        { name: 'Judgement & initiative', description: 'Demonstrates good judgement; takes appropriate initiative without being told.', weight: 25, levels: RUBRIC_LEVELS },
    ],
};

// ---------------------------------------------------------------------------
// Platform notes
// ---------------------------------------------------------------------------

const PLATFORM_NOTES: Record<AssessmentType, string> = {
    take_home_technical:
        'Send as a GitHub repo / zip / Google Doc depending on role. Use a private GitHub repo for code. Set deadline in the covering email; extend by 48h on request with no questions asked.',
    take_home_case_study:
        'Google Doc or PDF submission. Specify page/slide limit (recommended: 5–10 slides or 1,500–2,000 words). Reward conciseness.',
    take_home_portfolio:
        'Request a Figma file, PDF portfolio, or Notion page. Specify file size and format limits. Accept Google Drive links.',
    take_home_writing:
        'Plain text, Google Doc, or PDF. Specify word count (typically 500–1,000 words). Provide a style guide or brand voice brief.',
    coding_challenge:
        'Recommended platforms: HackerRank (https://www.hackerrank.com/work), Codility (https://codility.com), CoderPad (https://coderpad.io). Set the challenge to the role\'s primary language. Duration: 60–90 min for junior/mid, 2–3 hrs for senior.',
    work_sample:
        'Provide all necessary templates, data, or precedents. Specify the output format expected (Excel model, Word memo, etc.). Compensate if > 4 hours.',
    cognitive_aptitude:
        'Recommended platforms: Criteria Corp (https://www.criteriacorp.com), TestGorilla (https://www.testgorilla.com), Revelian. Duration: 20–45 min. Use validated, norm-referenced assessments only.',
    personality_values:
        'Recommended: Hogan, Predictive Index, Culture Amp, Culture Index. Do NOT use personality scores as a pass/fail gate — use for structured conversation only. Ensure ADA compliance and reasonable accommodation notice.',
    presentation:
        'Provide a topic brief 5–7 days in advance. Specify slide count (max 10), presentation time (15–20 min), and Q&A time (10 min). Schedule as a live video call with 2–3 evaluators.',
    trial_day:
        'Must be paid at least minimum wage (all jurisdictions). Provide a signed trial day agreement. Design a realistic but bounded task. Debrief with candidate same day. Check local labour laws — some jurisdictions require full employment contract before trial work.',
};

// ---------------------------------------------------------------------------
// Problem statements by domain + type
// ---------------------------------------------------------------------------

function defaultProblemStatement(domain: AssessmentDomain, type: AssessmentType, jobTitle: string): string {
    if (type === 'coding_challenge') {
        return `A timed coding challenge will be sent via the platform link. Typical problem types for a ${jobTitle}: algorithmic problem solving, data structure questions, or a small feature implementation task.`;
    }

    const PROMPTS: Partial<Record<AssessmentDomain, string>> = {
        engineering:
            `Build a small REST API (or CLI tool) that [describes a scoped feature relevant to the team's stack]. Include a README, basic tests, and notes on design decisions. Time: ${type === 'take_home_technical' ? '3–4 hours' : '2 hours'}.`,
        data_science:
            `Analyse the attached dataset. Identify the key trends, build a predictive model for [target variable], and produce a 1-page executive summary of your findings and recommendations.`,
        product:
            `You are a PM at [Company]. DAU has dropped 12% over the past 30 days. Diagnose the likely causes, propose a prioritised set of experiments to address them, and outline how you would measure success. Limit: 2 pages or 10 slides.`,
        design:
            `Redesign the checkout flow for a mobile e-commerce app. Identify the top 3 usability issues and propose improved screens. Deliver annotated wireframes or hi-fi mockups. Include a short rationale for each decision.`,
        marketing:
            `Draft a go-to-market plan for launching [Product] in [Market]. Include target segment, key messages, channel mix, 90-day activity plan, and success metrics. Limit: 10 slides.`,
        sales:
            `Prepare and deliver a 15-minute demo of our product to a fictitious VP of Engineering at a 200-person SaaS company. Assume they have seen a competitor demo and have 2 key objections: price and integration complexity.`,
        finance_accounting:
            `Using the attached P&L and balance sheet, build a 3-year financial model. Include a DCF valuation, sensitivity analysis (revenue growth ± 10%), and a 1-page investment memo.`,
        legal:
            `Review the attached draft SaaS agreement (15 pages). Mark up the document with your suggested redlines and provide a 1-page memo summarising the top 5 risk areas and recommended negotiation positions.`,
        healthcare_clinical:
            `Review the following patient scenario and provide: (1) your differential diagnosis, (2) your initial management plan, (3) key documentation you would complete, and (4) any escalation triggers you would set.`,
        operations:
            `Our customer onboarding process takes an average of 34 days. Using the attached process map and data, identify the top 3 bottlenecks and propose a redesigned process that targets a 15-day average. Include an implementation roadmap.`,
        education:
            `Design a 45-minute lesson plan for [SUBJECT / GRADE LEVEL]. Include learning objectives, a warm-up activity, core instruction strategy, an independent practice task, an assessment checkpoint, and an extension activity for advanced learners. Note how you would adapt the lesson for students with an IEP/504 or English Language Learner needs.`,
        government_public_sector:
            `A new regulation requires your department to reduce processing time for [PERMIT/APPLICATION TYPE] by 30% within 6 months. Write a policy brief (max 2 pages) that: (1) analyses the root cause of current delays, (2) proposes three evidence-based process improvements, (3) identifies stakeholders who must be consulted, and (4) outlines risks and mitigation steps. Assume a public-sector budget constraint.`,
        construction_trades:
            `Using the attached structural drawing, identify: (1) any code non-compliance or constructability issues, (2) your proposed resolution for each issue, and (3) the sequence of work for the affected phase. Include reference to the applicable code section (IBC, NEC, or your jurisdiction's equivalent). Limit your response to a one-page site note / RFI format.`,
        aviation:
            `You are a [ROLE: A&P Mechanic / Commercial Pilot / Operations Dispatcher] at [AIRLINE / MRO]. Review the attached MEL (Minimum Equipment List) entry and scenario. Provide: (1) your go / no-go determination with regulatory citation, (2) any required deferral or placard actions, (3) communication you would initiate with crew / ATC / operations, and (4) any safety risk items you would flag before departure.`,
        creative_media:
            `[BRAND BRIEF ATTACHED]. Create a [format: campaign concept / article outline / social media series / video storyboard] for the attached brief. Your submission should include: a headline concept, three key messages, a sample [headline / caption / shot list] per deliverable, and a 1-paragraph rationale explaining how your approach meets the brief's objectives and speaks to the target audience. Limit total submission to [2 pages / 500 words / 10 frames].`,
    };

    return PROMPTS[domain] ?? `Complete a work sample exercise relevant to the ${jobTitle} role. Details will be provided in the assessment brief.`;
}

// ---------------------------------------------------------------------------
// Email builder
// ---------------------------------------------------------------------------

function buildCandidateEmail(input: AssessmentBriefInput, problemStatement: string): string {
    const deadline = `${input.submissionDeadlineDays} calendar day${input.submissionDeadlineDays !== 1 ? 's' : ''} from today`;
    const platformLine = input.platformLink
        ? `\n**Platform link:** ${input.platformLink}\n`
        : '';
    const ndaLine = input.nda
        ? `\n> ⚠️ **NDA required:** Please sign and return the attached non-disclosure agreement before accessing the brief.\n`
        : '';
    const compensationLine = input.compensated
        ? `\n> 💰 **This assessment is compensated.** You will receive [AMOUNT] for your time, regardless of outcome.\n`
        : '';

    return [
        `Hi ${input.candidateName},`,
        ``,
        `Thank you for your time during our conversation. We'd like to move forward with the next step in our process for the **${input.jobTitle}** role at **${input.companyName}** — a ${ASSESSMENT_TYPE_LABEL[input.assessmentType]}.`,
        ``,
        ndaLine,
        compensationLine,
        `**What we're asking:**`,
        problemStatement,
        platformLine,
        `**Logistics:**`,
        `- ⏱ **Estimated time:** ${input.durationHours} hour${input.durationHours !== 1 ? 's' : ''}`,
        `- 📅 **Deadline:** Please submit within **${deadline}** — reply to this email if you need an extension.`,
        `- 📤 **How to submit:** ${input.platformLink ? 'Complete via the platform link above. Your submission will be recorded automatically.' : `Reply to this email with your completed work attached or linked.`}`,
        ``,
        `**A few things to note:**`,
        `- This exercise is designed to reflect real work you'd do in this role — there is no single "right" answer.`,
        `- We value quality of thinking over polish. A well-reasoned approach beats a perfect-looking output.`,
        `- If you have any questions about the brief, please email me — I'm happy to clarify.`,
        ``,
        `We look forward to reviewing your submission. Best of luck!`,
        ``,
        `${input.recruiterName}`,
        `${input.recruiterEmail}`,
        `${input.companyName}`,
    ].filter(l => l !== null && l !== undefined).join('\n');
}

const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
    take_home_technical:   'Take-Home Technical Exercise',
    take_home_case_study:  'Take-Home Case Study',
    take_home_portfolio:   'Portfolio Submission',
    take_home_writing:     'Writing Sample',
    coding_challenge:      'Timed Online Coding Challenge',
    work_sample:           'Work Sample Exercise',
    cognitive_aptitude:    'Cognitive Aptitude Assessment',
    personality_values:    'Values & Culture Fit Survey',
    presentation:          'Live Presentation',
    trial_day:             'Paid Trial Day',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildAssessmentBrief(input: AssessmentBriefInput): AssessmentBrief {
    const rubric = DOMAIN_RUBRICS[input.domain];
    const totalPossibleScore = rubric.reduce((sum, c) => sum + (c.weight / 100) * 4, 0);  // max 4 per criterion, weighted
    const passingThreshold = Math.round(totalPossibleScore * 0.65 * 100) / 100;            // 65% to advance

    const problemStatement = input.problemStatement ?? defaultProblemStatement(input.domain, input.assessmentType, input.jobTitle);
    const candidateEmail   = buildCandidateEmail(input, problemStatement);

    const evaluatorNames = input.evaluators && input.evaluators.length > 0
        ? input.evaluators.join(', ')
        : '[Evaluator names TBC]';

    const evaluatorBrief = [
        `## Assessment Evaluator Brief — ${input.jobTitle}`,
        ``,
        `**Candidate:** ${input.candidateName} (${input.candidateEmail})`,
        `**Role:** ${input.jobTitle}`,
        `**Assessment type:** ${ASSESSMENT_TYPE_LABEL[input.assessmentType]}`,
        `**Evaluators:** ${evaluatorNames}`,
        ``,
        `### How to score`,
        `Score each criterion on a 1–4 scale (see rubric below). Multiply each raw score by the criterion weight to get a weighted score. Sum all weighted scores to get the total (max ${(totalPossibleScore).toFixed(2)}). Candidates who score ≥ ${passingThreshold.toFixed(2)} should advance.`,
        ``,
        `### Rubric`,
        ...rubric.map(c => [
            `**${c.name}** (${c.weight}% weight)`,
            c.description,
            c.levels.map(l => `  - ${l.score}: ${l.label} — ${l.description}`).join('\n'),
        ].join('\n')),
        ``,
        `### Scoring sheet`,
        `| Criterion | Raw (1–4) | Weight | Weighted |`,
        `|-----------|-----------|--------|----------|`,
        ...rubric.map(c => `| ${c.name} | ___ | ${c.weight}% | ___ |`),
        `| **TOTAL** | | | ___ / ${totalPossibleScore.toFixed(2)} |`,
        ``,
        `**Advance if total ≥ ${passingThreshold.toFixed(2)}.**`,
        ``,
        `### Calibration notes`,
        `- Score independently before discussing with co-evaluators.`,
        `- Focus on the work, not how the candidate presents (unconscious bias risk).`,
        `- Document specific evidence for each score — vague feedback is unhelpful and legally risky.`,
        `- Do NOT reference protected characteristics (age, gender, race, family status) in any feedback.`,
    ].join('\n');

    const complianceNotes: string[] = [
        'Assessment must be job-related and consistent — every candidate for this role uses the same brief.',
        'Retain all evaluation forms for a minimum of 2 years (EEOC / employment law requirement).',
        'Provide reasonable accommodation upon request (ADA / Equality Act). Extend deadline or modify format.',
    ];

    if (input.assessmentType === 'personality_values') {
        complianceNotes.push(
            'Personality assessments must NOT be used as a sole or primary pass/fail gate — EEOC adverse impact risk.',
            'Ensure assessment is validated, norm-referenced, and not correlated with protected characteristics.',
        );
    }
    if (input.assessmentType === 'trial_day') {
        complianceNotes.push(
            'Trial day participants must be paid at least minimum wage — treat as workers, not volunteers.',
            'Check local jurisdiction: some require a formal employment contract before any work is performed.',
        );
    }
    if (input.assessmentType === 'cognitive_aptitude') {
        complianceNotes.push(
            'Cognitive assessments can have adverse impact on protected groups — validate test for job-relatedness.',
            'Reasonable accommodations (extra time, alternative format) must be provided upon request.',
        );
    }

    const sendingChecklist = [
        `Draft and review the problem statement before sending`,
        input.nda ? 'Attach signed NDA template — candidate must return before accessing brief' : null,
        input.platformLink ? `Confirm platform link is active and candidate email is pre-registered: ${input.platformLink}` : null,
        `Set a calendar reminder for ${Math.max(1, input.submissionDeadlineDays - 1)} day before deadline to follow up`,
        `Share rubric + evaluator brief with: ${input.evaluators?.join(', ') ?? '[evaluators]'}`,
        `Ask evaluators to score independently before calibration call`,
        `Log assessment sent in ATS with timestamp`,
        `Prepare decision email templates (advance / decline) before submission arrives`,
    ].filter(Boolean) as string[];

    return {
        candidateName: input.candidateName,
        jobTitle:      input.jobTitle,
        assessmentType: input.assessmentType,
        domain:        input.domain,
        candidateEmail,
        evaluatorBrief,
        rubric,
        totalPossibleScore,
        passingThreshold,
        platformNotes: PLATFORM_NOTES[input.assessmentType],
        sendingChecklist,
        complianceNotes,
    };
}
