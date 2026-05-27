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
    /** ISO country code or plain country name — drives default benefit copy when `benefits` is omitted.
     *  e.g. 'us' | 'uk' | 'gb' | 'au' | 'ca' | 'de' | 'fr' | 'nl' | 'sg' | 'in' | 'ae' | 'jp' |
     *       'br' | 'mx' | 'ch' | 'pl' | 'nz' | 'kr'. Defaults to 'us'. */
    country?: string;
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

/**
 * Returns a country-appropriate default benefits list when the caller does not
 * supply an explicit `benefits` array. Each entry reflects the statutory baseline
 * + typical market-competitive additions for that country.
 *
 * Add more countries by extending the switch below — the function never throws
 * and always returns at least the global fallback list.
 */
function getDefaultBenefits(country?: string): string[] {
    const c = (country ?? 'us').toLowerCase().replace(/[-_ ]/g, '');

    switch (c) {
        case 'uk':
        case 'gb':
            return [
                'Competitive salary',
                'Employer pension contributions (above statutory auto-enrolment minimum)',
                'Private medical & dental insurance',
                '25 days annual leave + UK bank holidays',
                'Enhanced maternity / paternity / shared parental leave',
                'Home-office or travel allowance',
                'Learning & development budget',
            ];

        case 'au':
        case 'australia':
            return [
                'Competitive salary + statutory Superannuation (employer contribution)',
                'Private health insurance allowance or company-paid cover',
                '20 days annual leave + 10 days personal/carer\'s leave',
                'Enhanced parental leave (above the government PPL scheme)',
                'Flexible work arrangements',
                'Learning & development budget',
                'Employee Assistance Programme (EAP)',
            ];

        case 'ca':
        case 'canada':
            return [
                'Competitive salary',
                'Comprehensive group benefits (extended health, dental, vision, paramedical)',
                'RRSP / DPSP matching',
                '3+ weeks vacation to start (above the statutory minimum)',
                'Enhanced parental leave top-up',
                'Flexible / remote work options',
                'Learning & development budget',
            ];

        case 'de':
        case 'germany':
            return [
                'Wettbewerbsfähiges Gehalt (competitive salary)',
                'Betriebliche Altersvorsorge (company pension — above statutory GRV contribution)',
                'Supplementary private health insurance (PKV top-up or company-funded)',
                '30 days annual leave (above the statutory 20-day minimum)',
                'Deutschland-Ticket or job-ticket subsidy',
                'Learning & development budget',
                'Home-office allowance / Homeoffice-Pauschale',
            ];

        case 'fr':
        case 'france':
            return [
                'Rémunération compétitive (competitive salary)',
                'Mutuelle santé (complementary health insurance — employer-co-funded)',
                'Tickets-restaurant / meal vouchers (Swile, Edenred, or equivalent)',
                'RTT days (additional rest days on top of the statutory 5-week congés payés)',
                'Intéressement / participation (profit-sharing scheme where applicable)',
                'Transport subsidy (50% of public transport pass)',
                'Learning & development budget',
            ];

        case 'nl':
        case 'netherlands':
            return [
                'Competitive salary',
                'Pension plan contribution (above the statutory AOW baseline)',
                'Supplementary health insurance allowance (zorgtoeslag top-up)',
                '25+ days annual leave',
                'NS Business Card or mobility budget for commuting',
                'Laptop + home-office budget',
                'Learning & development budget',
            ];

        case 'sg':
        case 'singapore':
            return [
                'Competitive salary',
                'CPF contributions (employer share above statutory minimum, where eligible)',
                'MediShield Life / Integrated Shield Plan top-up',
                '14+ days annual leave (above the statutory 7-day minimum)',
                'Annual AWS (13th month bonus)',
                'Flexible benefits / wellness allowance',
                'Learning & development budget',
            ];

        case 'in':
        case 'india':
            return [
                'Competitive CTC (Cost to Company)',
                'Provident Fund (PF) — employer contribution',
                'Gratuity (eligible after 5 years)',
                'Group medical insurance (self + family)',
                'Leave Travel Allowance (LTA)',
                'Performance bonus / variable pay',
                'Learning & development budget',
            ];

        case 'ae':
        case 'uae':
            return [
                'Tax-free competitive salary',
                'End-of-Service Gratuity (DEWS or legacy scheme)',
                'Company-paid private health insurance',
                'Annual flights home (expat allowance)',
                '30 days annual leave',
                'Housing allowance (or company-provided accommodation for some grades)',
                'Learning & development budget',
            ];

        case 'jp':
        case 'japan':
            return [
                '競争力のある給与 (competitive salary) + 賞与 (biannual bonus)',
                '社会保険 (shakai hoken — health insurance + employee pension)',
                '雇用保険 (employment insurance)',
                '有給休暇 10日以上 (10+ days annual paid leave, increasing with tenure)',
                'Transportation allowance (commuter pass)',
                'Retirement allowance scheme (退職金)',
                'Learning & development budget',
            ];

        case 'br':
        case 'brazil':
            return [
                'Salário competitivo (competitive salary)',
                '13º salário (statutory 13th-month bonus)',
                'Vale-refeição / vale-alimentação (meal / food vouchers)',
                'FGTS (Fundo de Garantia do Tempo de Serviço — employer contribution)',
                'Plano de saúde e odontológico (private health & dental)',
                'PLR (Participação nos Lucros e Resultados — profit sharing)',
                'Learning & development budget',
            ];

        case 'mx':
        case 'mexico':
            return [
                'Salario competitivo (competitive salary)',
                'IMSS (Instituto Mexicano del Seguro Social — statutory health & social security)',
                'PTU — Participación de los Trabajadores en las Utilidades (profit sharing)',
                'Vales de despensa (grocery / food vouchers)',
                'Fondo de ahorro (savings fund — typically 13% employer match)',
                '15 días de vacaciones (15 days vacation after 1 year, scaling with seniority)',
                'Seguro de gastos médicos mayores (major medical expense insurance)',
            ];

        case 'ch':
        case 'switzerland':
            return [
                'Competitive salary (CHF, gross)',
                'BVG / LPP occupational pension (employer contribution above statutory minimum)',
                'Supplementary health insurance allowance (top-up to KVG / LAMal mandatory cover)',
                '25+ days annual leave',
                'SBB half-fare card or public transport subsidy',
                'Meal allowance or subsidised canteen',
                'Learning & development budget',
            ];

        case 'pl':
        case 'poland':
            return [
                'Konkurencyjne wynagrodzenie (competitive salary)',
                'Prywatna opieka medyczna (private medical insurance — LuxMed / Medicover)',
                'Karta sportowa (Multisport / OK System fitness card)',
                '20–26 dni urlopu (20–26 days annual leave depending on tenure)',
                'PPK / PPE (employee capital plan or company pension scheme)',
                'Learning & development budget',
                'Home-office equipment allowance',
            ];

        case 'nz':
        case 'newzealand':
            return [
                'Competitive salary',
                'KiwiSaver employer contribution (minimum 3%, often enhanced)',
                '20 days annual leave + 12 public holidays',
                '10 days sick leave (statutory)',
                'Enhanced parental leave top-up',
                'Flexible work options',
                'Learning & development budget',
            ];

        case 'kr':
        case 'southkorea':
        case 'korea':
            return [
                '경쟁력 있는 급여 (competitive salary) + 성과급 (performance bonus)',
                '국민건강보험 (National Health Insurance — employer co-contribution)',
                '국민연금 (National Pension — employer co-contribution)',
                '고용보험 (Employment Insurance)',
                '연차 15일 이상 (15+ days annual leave)',
                '식대 지원 (meal allowance)',
                'Learning & development budget',
            ];

        case 'il':
        case 'israel':
            return [
                'Competitive salary',
                'Pension fund (קרן פנסיה) — employer contribution (6.5–7.5%)',
                'Study fund (קרן השתלמות) — employer contribution (7.5%)',
                'Bituach Leumi (National Insurance) employer contribution',
                'Company car or car allowance (common at mid-level+)',
                '14+ days annual leave',
                'Meal allowance (כרטיס אוכל)',
            ];

        // US default (also catches any unrecognised country code)
        default:
            return [
                'Competitive salary & equity',
                'Comprehensive health, dental, and vision coverage',
                'Flexible PTO and paid holidays',
                'Home-office stipend',
                'Learning & development budget',
                '401(k) with employer match',
            ];
    }
}

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
    const benefits = brief.benefits ?? getDefaultBenefits(brief.country);
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
