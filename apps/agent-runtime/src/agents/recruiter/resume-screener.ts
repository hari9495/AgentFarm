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
    blindScreen?: boolean;            // Strip PII before scoring to reduce unconscious bias
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
    wasAnonymized: boolean;         // True when blindScreen mode was used
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

// ---------------------------------------------------------------------------
// Qualification synonym map — broadens keyword matching to catch equivalent terms
// ---------------------------------------------------------------------------

const QUALIFICATION_SYNONYMS: Record<string, string[]> = {
    // ── Office / Business tools ───────────────────────────────────────────────
    excel:          ['spreadsheet', 'vba', 'pivot table', 'pivot tables', 'power query', 'xlookup', 'vlookup'],
    powerpoint:     ['presentation', 'slides', 'keynote', 'slide deck'],
    word:           ['microsoft word', 'document editing', 'ms word'],
    // ── Programming / Data ───────────────────────────────────────────────────
    python:         ['numpy', 'pandas', 'scikit', 'django', 'flask', 'fastapi', 'pytorch', 'tensorflow'],
    sql:            ['mysql', 'postgresql', 'postgres', 'oracle', 'tsql', 't-sql', 'database query', 'redshift', 'bigquery', 'snowflake'],
    javascript:     ['typescript', 'react', 'vue', 'angular', 'node.js', 'nodejs', 'next.js', 'express'],
    java:           ['spring', 'spring boot', 'j2ee', 'jakarta', 'hibernate', 'maven', 'gradle'],
    cloud:          ['aws', 'azure', 'gcp', 'google cloud', 'amazon web services', 'microsoft azure'],
    aws:            ['amazon web services', 'ec2', 's3', 'lambda', 'cloudformation', 'terraform', 'eks', 'ecs'],
    'machine learning': ['ml', 'deep learning', 'neural network', 'nlp', 'llm', 'ai model', 'artificial intelligence', 'scikit-learn'],
    'data analysis': ['data analytics', 'statistical analysis', 'data visualization', 'tableau', 'power bi', 'looker', 'jupyter'],
    devops:         ['ci/cd', 'cicd', 'kubernetes', 'docker', 'jenkins', 'github actions', 'gitlab ci', 'terraform'],
    // ── Healthcare / Clinical ─────────────────────────────────────────────────
    emr:            ['epic', 'cerner', 'allscripts', 'meditech', 'eclinicalworks', 'ehr', 'electronic health record', 'electronic medical record'],
    'medication administration': ['med admin', 'medication pass', 'mar', 'medication administration record'],
    'wound care':   ['wound management', 'dressing change', 'wound assessment', 'wound healing'],
    triage:         ['patient triage', 'emergency triage', 'esi', 'triage assessment'],
    phlebotomy:     ['venipuncture', 'blood draw', 'iv insertion', 'specimen collection'],
    'patient care': ['direct care', 'bedside nursing', 'clinical care', 'care coordination', 'patient management'],
    // ── Legal / Compliance ───────────────────────────────────────────────────
    litigation:     ['trial', 'deposition', 'discovery', 'pleadings', 'brief writing', 'motion practice'],
    'contract review': ['contract analysis', 'contract drafting', 'agreement review', 'legal review', 'redlining'],
    compliance:     ['regulatory compliance', 'risk & compliance', 'gdpr', 'hipaa', 'sox', 'regulatory affairs'],
    research:       ['legal research', 'westlaw', 'lexisnexis', 'case research', 'statutory research'],
    // ── Finance / Accounting ─────────────────────────────────────────────────
    accounting:     ['bookkeeping', 'general ledger', 'accounts payable', 'accounts receivable', 'financial reporting', 'gaap', 'ifrs'],
    forecasting:    ['financial forecast', 'budgeting', 'budget planning', 'variance analysis', 'financial planning'],
    'financial modeling': ['excel model', 'dcf', 'discounted cash flow', 'lbo', 'three-statement model', 'financial analysis'],
    auditing:       ['audit', 'internal audit', 'external audit', 'sox compliance', 'risk assessment'],
    // ── Operations / Project Management ─────────────────────────────────────
    'project management': ['pmp', 'agile', 'scrum', 'kanban', 'waterfall', 'stakeholder management', 'project coordination'],
    agile:          ['scrum', 'kanban', 'sprint', 'retrospective', 'jira', 'confluence', 'backlog', 'product owner'],
    'process improvement': ['lean', 'six sigma', 'kaizen', 'continuous improvement', 'bpr', 'process optimization'],
    // ── Marketing / Communications ───────────────────────────────────────────
    'digital marketing': ['seo', 'sem', 'ppc', 'google ads', 'facebook ads', 'content marketing', 'email marketing', 'hubspot'],
    'social media': ['instagram', 'linkedin marketing', 'twitter', 'tiktok', 'facebook', 'content creation', 'community management'],
    crm:            ['salesforce', 'hubspot', 'dynamics', 'zoho', 'customer relationship', 'pipeline management'],
    // ── Supply Chain / Logistics ─────────────────────────────────────────────
    'supply chain': ['procurement', 'vendor management', 'sourcing', 'logistics', 'inventory management', 'demand planning'],
    'warehouse management': ['wms', 'warehouse operations', 'inventory control', 'pick and pack', 'fulfillment'],
    // ── Soft skills / Leadership ──────────────────────────────────────────────
    leadership:     ['team management', 'people management', 'mentoring', 'coaching', 'managing a team', 'team lead'],
    communication:  ['written communication', 'verbal communication', 'stakeholder communication', 'public speaking', 'presentation'],
    'cross-functional': ['cross functional', 'collaboration', 'matrix environment', 'working across teams'],
    // ── Aviation ─────────────────────────────────────────────────────────────
    faa:            ['federal aviation administration', 'faa certification', 'faa part 135', 'airworthiness directive'],
    atp:            ['airline transport pilot', 'atp certificate', 'type rating', 'instrument rating'],
    'aircraft maintenance': ['airframe and powerplant', 'a&p mechanic', 'amt', 'avionics technician', 'airworthiness'],
    'flight operations': ['flight dispatch', 'air traffic control', 'atc', 'ground operations', 'ramp operations'],
    avionics:       ['cockpit systems', 'navigation systems', 'fms', 'flight management system', 'efis'],
    // ── Utilities / Energy ───────────────────────────────────────────────────
    nerc:           ['reliability coordinator', 'power systems operator', 'grid operations', 'bulk electric system'],
    substation:     ['switchgear', 'transformer', 'transmission lines', 'distribution', 'high voltage', 'hv equipment'],
    scada:          ['dcs', 'distributed control system', 'energy management system', 'ems', 'historian'],
    'natural gas':  ['pipeline operations', 'compressor station', 'gas metering', 'lng', 'liquefied natural gas'],
    'renewable energy': ['solar pv', 'photovoltaic', 'wind turbine', 'wind farm', 'inverter', 'battery storage', 'bess'],
    // ── Telecommunications ───────────────────────────────────────────────────
    rf:             ['radio frequency', 'antenna design', 'spectrum management', 'microwave', 'signal propagation'],
    'fiber optic':  ['optical transport', 'dwdm', 'sonet', 'otn', 'fiber installation', 'fiber splicing'],
    voip:           ['sip', 'unified communications', 'voice over ip', 'telephony', 'pbx', 'pstn'],
    '5g':           ['5g nr', 'mmwave', 'small cell', 'ran', 'core network', 'nsa architecture', 'o-ran'],
    'network operations': ['noc', 'network operations center', 'network monitoring', 'bandwidth management', 'incident management'],
    // ── Insurance ────────────────────────────────────────────────────────────
    underwriting:   ['risk assessment', 'policy rating', 'risk selection', 'underwriting guidelines', 'risk appetite'],
    'claims adjuster': ['claims processing', 'loss assessment', 'subrogation', 'liability claims', 'property claims'],
    actuarial:      ['reserving', 'loss development', 'ibnr', 'pricing model', 'mortality tables', 'aso', 'fellow of the soa'],
    reinsurance:    ['ceded business', 'treaty reinsurance', 'facultative', 'retrocession', 'cat modeling'],
    // ── Mining / Extractive ──────────────────────────────────────────────────
    mining:         ['open pit mining', 'underground mining', 'blast design', 'drillhole', 'ore body modelling'],
    metallurgy:     ['smelting', 'refining', 'flotation', 'heap leaching', 'hydrometallurgy', 'pyrometallurgy'],
    geology:        ['resource estimation', 'drilling program', 'core logging', 'stratigraphy', 'mineralogy'],
    msha:           ['mine safety', 'mining safety', 'mine safety and health administration', 'part 46 training'],
    'processing plant': ['mill operations', 'crusher', 'concentrator', 'tailings management', 'recovery rate'],
    // ── Agriculture ──────────────────────────────────────────────────────────
    agronomy:       ['crop science', 'soil science', 'agronomist', 'crop management', 'fertility management', 'crop advisor'],
    'precision agriculture': ['gps guidance', 'variable rate application', 'yield mapping', 'drone scouting', 'remote sensing'],
    'crop protection': ['pesticide application', 'herbicide', 'fungicide', 'ipm', 'integrated pest management'],
    'food safety':  ['haccp', 'gmp', 'good agricultural practices', 'gap', 'sqa', 'food safety audit', 'fsma'],
    livestock:      ['animal husbandry', 'herd management', 'feeding programs', 'biosecurity', 'veterinary protocols'],
    // ── Education ────────────────────────────────────────────────────────────
    curriculum:     ['lesson planning', 'iep', 'learning objectives', 'instructional design', 'course development', 'standards alignment'],
    pedagogy:       ['teaching strategies', 'differentiated instruction', 'student engagement', 'formative assessment', 'scaffolding'],
    'classroom management': ['behavior management', 'positive reinforcement', 'sel', 'social emotional learning', 'restorative practices'],
    lms:            ['canvas', 'blackboard', 'moodle', 'google classroom', 'schoology', 'learning management system'],
    accreditation:  ['sacs', 'hlc', 'caep', 'accreditation standards', 'program review', 'academic quality assurance'],
    // ── Government / Public Sector ───────────────────────────────────────────
    'security clearance': ['secret clearance', 'top secret', 'ts/sci', 'clearance eligible', 'sci access', 'poly'],
    'federal contracting': ['far', 'dfars', 'contracting officer', 'idiq', 'pwsc', 'government contracting', 'cost reimbursement'],
    'grants management': ['grant writing', 'federal grants', 'cfda', 'omb circular', 'grant administration', '2 cfr 200'],
    'policy analysis': ['regulatory analysis', 'policy brief', 'legislative analysis', 'rulemaking', 'regulatory impact'],
    // ── Real Estate ──────────────────────────────────────────────────────────
    'property management': ['tenant relations', 'lease administration', 'maintenance coordination', 'rent collection', 'yardi'],
    'commercial real estate': ['cre', 'nnn lease', 'cap rate', 'noi', 'dscr', 'commercial leasing', 'tenant improvement'],
    appraisal:      ['property valuation', 'comparable sales', 'income approach', 'mai designation', 'uspap'],
    mls:            ['multiple listing service', 'listing agent', 'buyer agent', 'real estate agent', 'realtor'],
    argus:          ['argus enterprise', 'financial modeling', 'pro forma', 'cash flow model', 'dcf analysis'],
    // ── Creative / Media ─────────────────────────────────────────────────────
    copywriting:    ['content writing', 'brand voice', 'advertising copy', 'creative brief', 'headline writing', 'long-form content'],
    ux:             ['user experience', 'usability testing', 'information architecture', 'wireframe', 'prototype', 'user research', 'ux research'],
    'adobe photoshop': ['photo editing', 'image retouching', 'compositing', 'adobe creative cloud', 'image manipulation'],
    'video production': ['post-production', 'video editing', 'premiere pro', 'final cut pro', 'color grading', 'motion graphics', 'after effects'],
    'brand strategy': ['brand identity', 'visual identity', 'brand guidelines', 'brand positioning', 'brand management'],
    'art direction': ['creative direction', 'visual design', 'layout design', 'typography', 'color theory', 'design systems'],
};

function checkQualification(qual: string, resumeText: string): QualificationMatch {
    const lower = resumeText.toLowerCase();
    const words = qual.toLowerCase().split(/\s+/);
    const stopWords = new Set(['with', 'and', 'the', 'for', 'in', 'of', 'or', 'to', 'a', 'an', 'at', 'by']);
    // Keyword matching — a qual is "met" if majority of its distinct keywords appear in resume
    const significantWords = words.filter(w => w.length > 3 && !stopWords.has(w));
    if (significantWords.length === 0) {
        return { qualification: qual, met: false, evidence: 'No significant keywords to match' };
    }

    // For each significant word, check: (1) exact substring, or (2) any synonym
    const matched: string[] = [];
    const missing: string[] = [];

    for (const w of significantWords) {
        const directMatch = lower.includes(w);
        if (directMatch) {
            matched.push(w);
            continue;
        }
        // Check synonyms for this word
        const synonymEntry = QUALIFICATION_SYNONYMS[w];
        if (synonymEntry) {
            const synonymMatch = synonymEntry.find(syn => lower.includes(syn));
            if (synonymMatch) {
                matched.push(`${w} (via "${synonymMatch}")`);
                continue;
            }
        }
        // Check if this word appears as part of a multi-word synonym key
        let foundViaSynonymKey = false;
        for (const [key, synonyms] of Object.entries(QUALIFICATION_SYNONYMS)) {
            if (key.includes(w) && lower.includes(key)) {
                matched.push(`${w} (via "${key}")`);
                foundViaSynonymKey = true;
                break;
            }
            if (synonyms.some(syn => syn.includes(w) && lower.includes(syn))) {
                matched.push(`${w} (via synonym)`);
                foundViaSynonymKey = true;
                break;
            }
        }
        if (!foundViaSynonymKey) {
            missing.push(w);
        }
    }

    const pct = matched.length / significantWords.length;
    const met = pct >= 0.6;
    const evidence = met
        ? `Found: ${matched.join(', ')}`
        : `Missing: ${missing.join(', ')}`;
    return { qualification: qual, met, evidence };
}

/**
 * Blind screening — strips PII from a resume before it reaches the scorer.
 * Removes: name/email/phone, physical address, social profile URLs, graduation
 * years (age proxy), gendered pronouns, and photo references.
 * Skills, qualifications, and employment history are preserved intact.
 */
export function anonymizeResume(text: string, candidateName?: string): string {
    let anon = text;

    // Candidate name (if known)
    if (candidateName && candidateName.trim()) {
        const escaped = candidateName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        anon = anon.replace(new RegExp(escaped, 'gi'), '[CANDIDATE]');
        // Also strip individual parts (first / last)
        const parts = candidateName.trim().split(/\s+/).filter(p => p.length > 2);
        for (const part of parts) {
            const ep = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            anon = anon.replace(new RegExp(`\\b${ep}\\b`, 'gi'), '[CANDIDATE]');
        }
    }

    // Email addresses
    anon = anon.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL REDACTED]');

    // Phone numbers (US, UK, international formats)
    anon = anon.replace(
        /(\+?[\d\s\-().]{7,}(?:\s?(?:ext|x)\.?\s?\d{1,5})?)/g,
        (m) => /\d{6,}/.test(m.replace(/\D/g, '')) ? '[PHONE REDACTED]' : m,
    );

    // Physical address lines (number + street name pattern)
    anon = anon.replace(/\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Place|Pl|Way|Close|Terrace|Ter)\b[.,]?/gi, '[ADDRESS REDACTED]');

    // LinkedIn profile URLs
    anon = anon.replace(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s/]+\/?/gi, '[LINKEDIN PROFILE]');

    // GitHub profile URLs
    anon = anon.replace(/https?:\/\/(?:www\.)?github\.com\/[^\s/]+\/?/gi, '[GITHUB PROFILE]');

    // Twitter / X profile URLs
    anon = anon.replace(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s/]+\/?/gi, '[SOCIAL PROFILE]');

    // Personal website / portfolio (generic URL — keep domain but strip path for context)
    anon = anon.replace(/https?:\/\/(?!www\.(?:linkedin|github|twitter|x)\.com)[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?\b/gi, '[PORTFOLIO URL]');

    // "Class of YYYY" / "Graduated YYYY" — age proxy
    anon = anon.replace(/\b(?:class\s+of|graduated\s+(?:in\s+)?)\s*(?:19|20)\d{2}\b/gi, '[GRADUATION YEAR]');

    // Gendered pronouns — replace with neutral equivalents
    anon = anon
        .replace(/\bhe\/she\b/gi, 'they')
        .replace(/\bshe\/he\b/gi, 'they')
        .replace(/\bhim\/her\b/gi, 'them')
        .replace(/\bher\/him\b/gi, 'them')
        .replace(/\bhis\/her\b/gi, 'their')
        .replace(/\bher\/his\b/gi, 'their')
        .replace(/\b(he|she)\b/g, 'they')
        .replace(/\b(him|her)\b/g, 'them')
        .replace(/\b(his|hers)\b/g, 'their');

    // Photo / headshot references
    anon = anon.replace(/\b(?:photo|headshot|portrait|image|picture)\s*(?:attached|enclosed|included|available)?\b/gi, '[PHOTO REMOVED]');

    return anon;
}

/**
 * Detects credentials explicitly marked as expired, lapsed, revoked, or suspended
 * in the resume text. Returns a list of human-readable descriptions of the expired
 * credential findings.  A match is a hard block — an expired licence is as bad as
 * a missing one for regulated roles.
 *
 * Examples caught:
 *   "RN (expired 2022)"
 *   "PMP certification — expired"
 *   "California medical license (lapsed)"
 *   "CPA license revoked 2021"
 */
function detectExpiredCredentials(resumeText: string): string[] {
    const expired: string[] = [];
    const lower = resumeText.toLowerCase();

    // Pattern A: "ACRONYM/title (expired YYYY?)" or "ACRONYM/title (lapsed/revoked/suspended)"
    const parenPattern = /([a-z][a-z0-9 .&/-]{1,60}?)\s*\(\s*(?:expired?|lapsed?|revoked?|suspended?)(?:\s+(?:19|20)\d{2})?\s*\)/gi;
    for (const m of lower.matchAll(parenPattern)) {
        expired.push(`"${m[0].trim()}" — credential appears expired/invalid`);
    }

    // Pattern B: "ACRONYM/title ... expired/lapsed/revoked/suspended [YYYY?]"
    //            where the status word follows within ~6 tokens
    const statusPattern = /([a-z][a-z0-9 .&/-]{1,50}?)\s+(?:license|licence|certification?|cert|credential|registration)?\s*(?:was\s+|is\s+|—\s*)?(?:expired?|lapsed?|revoked?|suspended?)(?:\s+(?:19|20)\d{2})?/gi;
    for (const m of lower.matchAll(statusPattern)) {
        const desc = m[0].trim();
        // Avoid duplicate if already captured by parenPattern
        if (!expired.some(e => e.includes(desc.slice(0, 20)))) {
            expired.push(`"${desc}" — credential appears expired/invalid`);
        }
    }

    return expired;
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

/**
 * Build screenable text + candidate name from an ATS candidate record.
 *
 * ATSs (e.g. Greenhouse) hold the resume itself as a file attachment, not text,
 * but the record carries structured career data — title, company, employments,
 * educations, tags — which is enough to screen against required qualifications
 * without downloading/parsing the attachment. Defensive on shape: unknown ATS
 * layouts simply yield less text.
 */
export function extractCandidateFromAtsRecord(
    record: Record<string, unknown>,
): { candidateName: string; resumeText: string } {
    const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const arr = (v: unknown): Record<string, unknown>[] =>
        Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

    const candidateName =
        [s(record['first_name']), s(record['last_name'])].filter(Boolean).join(' ') || s(record['name']);

    const lines: string[] = [];
    if (candidateName) lines.push(`Name: ${candidateName}`);
    const headline = [s(record['title']), s(record['company'])].filter(Boolean).join(' at ');
    if (headline) lines.push(`Current: ${headline}`);

    const employments = arr(record['employments']);
    if (employments.length > 0) {
        lines.push('Experience:');
        for (const e of employments) {
            const span = [s(e['start_date']), s(e['end_date']) || 'present'].filter(Boolean).join('–');
            lines.push(`- ${[s(e['title']), s(e['company_name']) || s(e['company'])].filter(Boolean).join(' at ')}${span ? ` (${span})` : ''}`);
        }
    }

    const educations = arr(record['educations']);
    if (educations.length > 0) {
        lines.push('Education:');
        for (const ed of educations) {
            lines.push(`- ${[s(ed['degree']), s(ed['discipline'])].filter(Boolean).join(' in ')}${ed['school_name'] ? `, ${s(ed['school_name'])}` : ''}`.trim());
        }
    }

    const tags = Array.isArray(record['tags']) ? (record['tags'] as unknown[]).map((t) => String(t)).filter(Boolean) : [];
    if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);

    return { candidateName, resumeText: lines.join('\n') };
}

export function screenResume(input: ResumeScreenInput): ResumeScreenResult {
    // Blind screening: anonymize PII before any scoring so evaluators see only
    // skills and experience — not name, contact details, or identity signals.
    const wasAnonymized = input.blindScreen === true;
    const resumeText = wasAnonymized
        ? anonymizeResume(input.resumeText, input.candidateName)
        : input.resumeText;

    const resumeLower = resumeText.toLowerCase();

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
        resumeText,
        requiredCredentialIds,
        input.bonusCredentialIds,
    );

    // ── Expired credential detection ─────────────────────────────────────────
    // Scans for explicit expiry markers before any scoring — an expired licence
    // is treated as a hard block for regulated roles regardless of other scores.
    const expiredCredentialFindings = detectExpiredCredentials(resumeText);
    const hasExpiredCredentials = expiredCredentialFindings.length > 0;

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
            credentialGaps: [
                ...credentialValidation.missingRequired.map(c => c.credentialName),
                ...expiredCredentialFindings,
            ],
            salaryFit: 'unknown',
            recommendedAction: `Do not advance. Deal-breaker criterion met: "${hitDealBreaker}".`,
            phoneScreenQuestions: [],
            screenerNotes: `Auto-rejected: deal-breaker keyword "${hitDealBreaker}" found in resume.`,
            wasAnonymized,
        };
    }

    // ── Required qualifications (keyword matching) ───────────────────────────
    const requiredMatches = input.requiredQualifications.map(q => checkQualification(q, resumeText));
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
        checkQualification(q, resumeText),
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

    // Hard block: missing required credential OR explicitly expired credential
    if (credentialValidation.hardBlock || hasExpiredCredentials) {
        overallScore = Math.min(overallScore, 29); // Forces 'no' or 'hard_no'
    }

    const verdict = verdictFromScore(overallScore);

    const strengths = requiredMatches.filter(m => m.met).map(m => m.qualification);
    const gaps = requiredMatches.filter(m => !m.met).map(m => m.qualification);
    const credentialGaps = [
        ...credentialValidation.missingRequired.map(c =>
            `${c.credentialName}${c.notes ? ` (${c.notes})` : ''}`,
        ),
        // Expired credentials are surfaced as gaps — same severity as missing
        ...expiredCredentialFindings,
    ];

    // ── Salary fit ───────────────────────────────────────────────────────────
    let salaryFit: ResumeScreenResult['salaryFit'] = 'unknown';
    if (input.salaryExpectation && input.salaryBudgetMax) {
        salaryFit = input.salaryExpectation <= input.salaryBudgetMax ? 'within_budget' : 'over_budget';
    }

    const actionMap: Record<ScreeningVerdict, string> = {
        strong_yes: 'Advance immediately — schedule phone screen within 24 hours.',
        yes: 'Advance — schedule phone screen this week.',
        maybe: 'Review with hiring manager before deciding; may need clarifying questions.',
        no: (credentialValidation.hardBlock || hasExpiredCredentials)
            ? `Do not advance. Missing or expired required credential(s): ${credentialGaps.join('; ')}.`
            : 'Do not advance. Send polite rejection after pipeline closes.',
        hard_no: 'Do not advance. Archive candidate profile.',
    };

    const screenerNotes = [
        `Score: ${overallScore}/100 (Req: ${reqMet}/${reqTotal}, Cred: ${credentialValidation.totalFound}/${credentialValidation.totalRequired}, Nice: ${niceMet}/${niceToHaveMatches.length}, Exp: ${yearsFound} yrs)`,
        (credentialValidation.hardBlock || hasExpiredCredentials) ? `⛔ CREDENTIAL BLOCK: ${credentialGaps.join('; ')}` : '',
        credentialValidation.presentCredentials.length > 0
            ? `✓ Credentials: ${credentialValidation.presentCredentials.map(c => c.credentialName).join(', ')}`
            : '',
        salaryFit !== 'unknown' ? `Salary: ${salaryFit === 'within_budget' ? '✓ within budget' : '✗ over budget'}` : '',
        wasAnonymized ? '🫥 Blind screen — PII redacted before scoring' : '',
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
        wasAnonymized,
    };
}
