/**
 * JD Builder
 *
 * Builds structured, employer-branded job descriptions from a role brief.
 * Covers title, summary, responsibilities, requirements, nice-to-haves,
 * compensation, and DEI inclusion language.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';
export type WorkArrangement = 'remote' | 'hybrid' | 'onsite';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'principal' | 'director' | 'executive';

export interface RoleBrief {
    title: string;
    department: string;
    hiringManagerName?: string;
    location: string;
    workArrangement: WorkArrangement;
    employmentType: EmploymentType;
    experienceLevel: ExperienceLevel;
    companyName: string;
    companyMission?: string;
    teamContext?: string;
    responsibilities: string[];
    requiredQualifications: string[];
    niceToHaveQualifications?: string[];
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    benefits?: string[];
    includeEeoStatement?: boolean;
}

export interface JobDescription {
    title: string;
    department: string;
    location: string;
    workArrangement: WorkArrangement;
    employmentType: EmploymentType;
    experienceLevel: ExperienceLevel;
    headline: string;
    aboutCompany: string;
    roleOverview: string;
    responsibilities: string[];
    requiredQualifications: string[];
    niceToHaveQualifications: string[];
    compensation: string;
    benefits: string[];
    eeoStatement: string;
    fullText: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
    entry: '0–2 years',
    mid: '2–5 years',
    senior: '5–8 years',
    lead: '6–10 years',
    principal: '8–12 years',
    director: '10+ years',
    executive: '15+ years',
};

const WORK_ARRANGEMENT_LABEL: Record<WorkArrangement, string> = {
    remote: 'Remote',
    hybrid: 'Hybrid (2–3 days in office)',
    onsite: 'On-site',
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    internship: 'Internship',
    temporary: 'Temporary',
};

const DEFAULT_BENEFITS = [
    'Competitive salary & equity',
    'Comprehensive health, dental, and vision coverage',
    'Flexible PTO and paid holidays',
    'Home-office stipend',
    'Learning & development budget',
    '401(k) / pension with employer match',
];

const EEO_STATEMENT =
    'We are an equal-opportunity employer. We celebrate diversity and are committed to creating an inclusive environment for all employees, regardless of race, color, religion, sex, sexual orientation, gender identity, national origin, disability, or veteran status.';

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

export function buildJobDescription(brief: RoleBrief): JobDescription {
    const expLabel = EXPERIENCE_LABEL[brief.experienceLevel];
    const arrangement = WORK_ARRANGEMENT_LABEL[brief.workArrangement];
    const empType = EMPLOYMENT_TYPE_LABEL[brief.employmentType];
    const currency = brief.salaryCurrency ?? 'USD';
    const benefits = brief.benefits ?? DEFAULT_BENEFITS;
    const niceToHave = brief.niceToHaveQualifications ?? [];

    const headline = `${brief.title} — ${brief.companyName} (${arrangement} · ${empType})`;

    const aboutCompany = brief.companyMission
        ? `${brief.companyName} ${brief.companyMission}`
        : `${brief.companyName} is a growing organisation committed to building products that make a difference.`;

    const roleOverview = [
        `We're looking for a ${expLabel} ${brief.title} to join our ${brief.department} team`,
        brief.teamContext ? ` — ${brief.teamContext}` : '.',
        brief.teamContext ? '.' : '',
    ].join('');

    const compensation =
        brief.salaryMin && brief.salaryMax
            ? `${currency} ${brief.salaryMin.toLocaleString()} – ${brief.salaryMax.toLocaleString()} per year, depending on experience`
            : 'Competitive, commensurate with experience';

    const eeoStatement = brief.includeEeoStatement !== false ? EEO_STATEMENT : '';

    const sections: string[] = [
        `# ${headline}`,
        '',
        `**Location:** ${brief.location}  |  **Arrangement:** ${arrangement}  |  **Type:** ${empType}`,
        '',
        '## About the Company',
        aboutCompany,
        '',
        '## The Role',
        roleOverview,
        '',
        '## What You\'ll Do',
        ...brief.responsibilities.map(r => `- ${r}`),
        '',
        '## What We\'re Looking For',
        ...brief.requiredQualifications.map(q => `- ${q}`),
    ];

    if (niceToHave.length > 0) {
        sections.push('', '## Nice to Have', ...niceToHave.map(n => `- ${n}`));
    }

    sections.push(
        '',
        '## Compensation',
        compensation,
        '',
        '## Benefits',
        ...benefits.map(b => `- ${b}`),
    );

    if (eeoStatement) {
        sections.push('', '## Equal Opportunity', eeoStatement);
    }

    return {
        title: brief.title,
        department: brief.department,
        location: brief.location,
        workArrangement: brief.workArrangement,
        employmentType: brief.employmentType,
        experienceLevel: brief.experienceLevel,
        headline,
        aboutCompany,
        roleOverview,
        responsibilities: brief.responsibilities,
        requiredQualifications: brief.requiredQualifications,
        niceToHaveQualifications: niceToHave,
        compensation,
        benefits,
        eeoStatement,
        fullText: sections.join('\n'),
    };
}
