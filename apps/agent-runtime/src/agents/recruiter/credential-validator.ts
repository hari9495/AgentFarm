/**
 * Credential Validator
 *
 * Domain-aware credential, license, and certification checker for resume screening.
 * Goes beyond keyword matching — understands that "RN" means registered nurse,
 * "JD" is a legal degree, "Series 7" is a FINRA license, etc.
 *
 * Covers: Healthcare, Legal, Finance, Education, Engineering, Government,
 * Technology certifications, Manufacturing/Trades, and general professional certs.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialCategory =
    | 'healthcare_license'
    | 'legal_qualification'
    | 'finance_certification'
    | 'education_credential'
    | 'engineering_license'
    | 'technology_certification'
    | 'project_management'
    | 'security_clearance'
    | 'trades_certification'
    | 'general_professional';

export interface CredentialDefinition {
    id: string;
    name: string;
    aliases: string[];           // All abbreviations and alternate names
    category: CredentialCategory;
    industries: string[];
    isLicenseRequired: boolean;  // Must appear for role to be valid
    issuer?: string;
    renewalRequired?: boolean;
    notes?: string;
}

export interface CredentialCheckResult {
    credentialId: string;
    credentialName: string;
    required: boolean;
    found: boolean;
    foundAlias?: string;         // Which alias was matched
    confidence: 'high' | 'medium' | 'low';
    notes?: string;
}

export interface CredentialValidationResult {
    totalRequired: number;
    totalFound: number;
    missingRequired: CredentialCheckResult[];
    presentCredentials: CredentialCheckResult[];
    credentialScore: number;     // 0–100
    hardBlock: boolean;          // true if a required license is completely absent
    summary: string;
    recommendations: string[];
}

// ---------------------------------------------------------------------------
// Credential registry
// ---------------------------------------------------------------------------

const CREDENTIAL_REGISTRY: CredentialDefinition[] = [

    // ── Healthcare ───────────────────────────────────────────────────────────
    { id: 'rn', name: 'Registered Nurse', aliases: ['rn', 'registered nurse', 'r.n.'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Board of Nursing', renewalRequired: true },
    { id: 'lpn', name: 'Licensed Practical Nurse', aliases: ['lpn', 'lvn', 'licensed practical nurse', 'licensed vocational nurse'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Board of Nursing', renewalRequired: true },
    { id: 'np', name: 'Nurse Practitioner', aliases: ['np', 'fnp', 'anp', 'nurse practitioner', 'fnp-c', 'fnp-bc', 'pmhnp', 'agnp'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'bsn', name: 'Bachelor of Science in Nursing', aliases: ['bsn', 'bachelor of science in nursing', 'bs nursing'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: false },
    { id: 'msn', name: 'Master of Science in Nursing', aliases: ['msn', 'master of science in nursing'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: false },
    { id: 'md', name: 'Medical Doctor', aliases: ['md', 'm.d.', 'doctor of medicine', 'physician'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Medical Board', renewalRequired: true },
    { id: 'do', name: 'Doctor of Osteopathic Medicine', aliases: ['do', 'd.o.', 'osteopath', 'osteopathic physician'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Medical Board', renewalRequired: true },
    { id: 'pa_c', name: 'Physician Assistant — Certified', aliases: ['pa-c', 'pa', 'physician assistant', 'physician associate'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'pharmd', name: 'Doctor of Pharmacy', aliases: ['pharmd', 'pharm.d.', 'doctor of pharmacy', 'pharmacist'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Board of Pharmacy', renewalRequired: true },
    { id: 'pt', name: 'Physical Therapist License', aliases: ['pt', 'dpt', 'physical therapist', 'doctor of physical therapy'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'ot', name: 'Occupational Therapist', aliases: ['ot', 'otr', 'otr/l', 'occupational therapist'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'rt', name: 'Respiratory Therapist', aliases: ['rt', 'rrt', 'crt', 'respiratory therapist'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'cna', name: 'Certified Nursing Assistant', aliases: ['cna', 'certified nursing assistant', 'nurse aide'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'bls', name: 'BLS Certification', aliases: ['bls', 'basic life support', 'cpr', 'heartsaver'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: false, renewalRequired: true, notes: 'Required for most clinical roles' },
    { id: 'acls', name: 'ACLS Certification', aliases: ['acls', 'advanced cardiac life support'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: false, renewalRequired: true },
    { id: 'rdms', name: 'Registered Diagnostic Medical Sonographer', aliases: ['rdms', 'sonographer', 'ultrasound technician'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },
    { id: 'lcsw', name: 'Licensed Clinical Social Worker', aliases: ['lcsw', 'licensed clinical social worker', 'lmsw', 'licensed master social worker'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, renewalRequired: true },

    // ── Legal ────────────────────────────────────────────────────────────────
    { id: 'jd', name: 'Juris Doctor', aliases: ['jd', 'j.d.', 'juris doctor', 'law degree', 'llb'], category: 'legal_qualification', industries: ['legal'], isLicenseRequired: true, notes: 'Required for all attorney roles' },
    { id: 'bar', name: 'Bar Admission', aliases: ['bar admitted', 'bar admission', 'admitted to the bar', 'bar member', 'licensed attorney', 'admitted to practice', 'state bar'], category: 'legal_qualification', industries: ['legal'], isLicenseRequired: true, issuer: 'State Bar Association', renewalRequired: true },
    { id: 'llm', name: 'Master of Laws', aliases: ['llm', 'll.m.', 'master of laws'], category: 'legal_qualification', industries: ['legal'], isLicenseRequired: false, notes: 'Valuable for specialisations (tax, IP, international)' },
    { id: 'clp', name: 'Certified Legal Professional', aliases: ['cls', 'cp', 'certified paralegal', 'certified legal professional', 'registered paralegal', 'rp (nala)'], category: 'legal_qualification', industries: ['legal'], isLicenseRequired: false },

    // ── Finance ──────────────────────────────────────────────────────────────
    { id: 'cfa', name: 'Chartered Financial Analyst', aliases: ['cfa', 'chartered financial analyst', 'cfa charterholder', 'cfa candidate'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'CFA Institute', renewalRequired: false },
    { id: 'cpa', name: 'Certified Public Accountant', aliases: ['cpa', 'certified public accountant', 'cpa license', 'cpa certified'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'AICPA / State Board', renewalRequired: true },
    { id: 'series7', name: 'FINRA Series 7', aliases: ['series 7', 'series7', 'finra series 7', 'general securities representative'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: true, issuer: 'FINRA', renewalRequired: false, notes: 'Required for securities brokers' },
    { id: 'series63', name: 'FINRA Series 63', aliases: ['series 63', 'series63', 'uniform securities agent'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'FINRA', renewalRequired: false },
    { id: 'series65', name: 'FINRA Series 65', aliases: ['series 65', 'series65', 'investment adviser representative'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'FINRA', renewalRequired: false },
    { id: 'frm', name: 'Financial Risk Manager', aliases: ['frm', 'financial risk manager', 'frm certified'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'GARP', renewalRequired: true },
    { id: 'cia', name: 'Certified Internal Auditor', aliases: ['cia', 'certified internal auditor'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false, issuer: 'IIA', renewalRequired: true },
    { id: 'caia', name: 'CAIA Charter', aliases: ['caia', 'chartered alternative investment analyst'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: false },

    // ── Education ────────────────────────────────────────────────────────────
    { id: 'teaching_license', name: 'State Teaching License/Certificate', aliases: ['teaching certificate', 'teaching license', 'state license', 'teacher certification', 'licensure', 'credential', 'single subject', 'multiple subject', 'clear credential'], category: 'education_credential', industries: ['education'], isLicenseRequired: true, issuer: 'State Department of Education', renewalRequired: true },
    { id: 'med', name: 'Master of Education', aliases: ['med', 'm.ed.', 'master of education', 'master of arts in education', 'ma education'], category: 'education_credential', industries: ['education'], isLicenseRequired: false },
    { id: 'edd', name: 'Doctor of Education', aliases: ['edd', 'ed.d.', 'doctor of education'], category: 'education_credential', industries: ['education'], isLicenseRequired: false },
    { id: 'esol', name: 'ESOL/ESL Endorsement', aliases: ['esol', 'esl', 'tefl', 'tesol', 'ell endorsement'], category: 'education_credential', industries: ['education'], isLicenseRequired: false },

    // ── Engineering (non-software) ───────────────────────────────────────────
    { id: 'pe', name: 'Professional Engineer License', aliases: ['pe', 'p.e.', 'professional engineer', 'licensed pe', 'registered professional engineer'], category: 'engineering_license', industries: ['engineering_non_software', 'manufacturing'], isLicenseRequired: false, issuer: 'State Engineering Board', renewalRequired: true, notes: 'Required for stamping drawings; valued for senior roles' },
    { id: 'eit', name: 'Engineer in Training', aliases: ['eit', 'engineer in training', 'fe exam', 'fundamentals of engineering', 'fe certified'], category: 'engineering_license', industries: ['engineering_non_software'], isLicenseRequired: false, notes: 'Pre-PE credential; shows pathway to licensure' },
    { id: 'se', name: 'Structural Engineer License', aliases: ['se', 's.e.', 'structural engineer license', 'licensed se'], category: 'engineering_license', industries: ['engineering_non_software'], isLicenseRequired: false },

    // ── Technology Certifications ────────────────────────────────────────────
    { id: 'aws_saa', name: 'AWS Solutions Architect', aliases: ['aws certified', 'aws saa', 'aws solutions architect', 'aws sap', 'aws-saa', 'aws-sap', 'aws certified solutions architect'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'Amazon Web Services' },
    { id: 'gcp_pro', name: 'Google Cloud Professional', aliases: ['gcp certified', 'google cloud professional', 'gcp professional', 'professional cloud architect'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'Google' },
    { id: 'azure_cert', name: 'Microsoft Azure Certification', aliases: ['azure certified', 'microsoft certified', 'az-900', 'az-104', 'az-204', 'az-305', 'azure administrator', 'azure developer'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'Microsoft' },
    { id: 'cissp', name: 'CISSP', aliases: ['cissp', 'certified information systems security professional'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'ISC2', renewalRequired: true },
    { id: 'ceh', name: 'Certified Ethical Hacker', aliases: ['ceh', 'certified ethical hacker'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false },
    { id: 'comptia_sec', name: 'CompTIA Security+', aliases: ['security+', 'comptia security+', 'sec+'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'CompTIA', renewalRequired: true },
    { id: 'ckad', name: 'Certified Kubernetes Application Developer', aliases: ['ckad', 'certified kubernetes application developer', 'cka', 'certified kubernetes administrator'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false },

    // ── Project Management ───────────────────────────────────────────────────
    { id: 'pmp', name: 'PMP Certification', aliases: ['pmp', 'project management professional', 'pmp certified', 'pmp®'], category: 'project_management', industries: ['technology', 'manufacturing', 'consulting', 'government'], isLicenseRequired: false, issuer: 'PMI', renewalRequired: true },
    { id: 'csm', name: 'Certified Scrum Master', aliases: ['csm', 'certified scrum master', 'scrum master certified', 'psm', 'professional scrum master', 'safe scrum master'], category: 'project_management', industries: ['technology'], isLicenseRequired: false },
    { id: 'capm', name: 'CAPM', aliases: ['capm', 'certified associate in project management'], category: 'project_management', industries: ['technology', 'consulting'], isLicenseRequired: false, issuer: 'PMI' },
    { id: 'prince2', name: 'PRINCE2', aliases: ['prince2', 'prince 2', 'prince2 practitioner', 'prince2 foundation'], category: 'project_management', industries: ['consulting', 'government'], isLicenseRequired: false },

    // ── Security Clearances ──────────────────────────────────────────────────
    { id: 'ts_sci', name: 'Top Secret / SCI Clearance', aliases: ['ts/sci', 'top secret/sci', 'top secret sci', 'ts-sci', 'sci clearance', 'active ts/sci'], category: 'security_clearance', industries: ['government', 'technology'], isLicenseRequired: true, notes: 'Background investigation required; non-transferable' },
    { id: 'secret', name: 'Secret Clearance', aliases: ['secret clearance', 'active secret', 'dod secret', 'interim secret'], category: 'security_clearance', industries: ['government'], isLicenseRequired: false },
    { id: 'public_trust', name: 'Public Trust Clearance', aliases: ['public trust', 'moderate risk public trust', 'high risk public trust'], category: 'security_clearance', industries: ['government'], isLicenseRequired: false },

    // ── Trades / Manufacturing ───────────────────────────────────────────────
    { id: 'journeyman', name: 'Journeyman License', aliases: ['journeyman', 'journeyman electrician', 'journeyman plumber', 'journeyman carpenter'], category: 'trades_certification', industries: ['manufacturing'], isLicenseRequired: false },
    { id: 'osha30', name: 'OSHA 30-Hour Certification', aliases: ['osha 30', 'osha-30', 'osha 30-hour', 'osha 30 hour certification'], category: 'trades_certification', industries: ['manufacturing', 'engineering_non_software'], isLicenseRequired: false, renewalRequired: false },
    { id: 'six_sigma_bb', name: 'Six Sigma Black Belt', aliases: ['six sigma black belt', 'black belt', 'ssbb', 'lean six sigma black belt', 'lssbb'], category: 'trades_certification', industries: ['manufacturing', 'consulting'], isLicenseRequired: false },
    { id: 'six_sigma_gb', name: 'Six Sigma Green Belt', aliases: ['six sigma green belt', 'green belt', 'ssgb', 'lean six sigma green belt'], category: 'trades_certification', industries: ['manufacturing'], isLicenseRequired: false },

    // ── General Professional ─────────────────────────────────────────────────
    { id: 'mba', name: 'MBA', aliases: ['mba', 'm.b.a.', 'master of business administration', 'wharton mba', 'harvard mba', 'business school'], category: 'general_professional', industries: ['finance', 'consulting', 'technology'], isLicenseRequired: false },
    { id: 'phd', name: 'PhD / Doctorate', aliases: ['phd', 'ph.d.', 'doctorate', 'doctor of philosophy', 'd.phil', 'doctoral degree'], category: 'general_professional', industries: ['technology', 'healthcare', 'pharmaceutical_biotech', 'education'], isLicenseRequired: false },
    { id: 'shrm', name: 'SHRM Certification', aliases: ['shrm-cp', 'shrm-scp', 'shrm cp', 'shrm scp', 'phr', 'sphr', 'hrci certified'], category: 'general_professional', industries: ['technology', 'manufacturing'], isLicenseRequired: false, issuer: 'SHRM / HRCI' },
    { id: 'apics', name: 'APICS Certification', aliases: ['apics', 'cpim', 'cscp', 'cltd', 'supply chain certification'], category: 'general_professional', industries: ['logistics_supply_chain', 'manufacturing'], isLicenseRequired: false },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseText(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9\s\/\-\.]/g, ' ').replace(/\s+/g, ' ');
}

function findCredentialInText(
    cred: CredentialDefinition,
    normalisedResumeText: string,
): { found: boolean; alias?: string; confidence: 'high' | 'medium' | 'low' } {
    for (const alias of cred.aliases) {
        const normAlias = normaliseText(alias);
        if (normAlias.length < 3) {
            // Short abbreviations (e.g., "rn", "pe") — require word boundary match
            const pattern = new RegExp(`(?:^|\\s|\\(|,)${normAlias.replace(/\./g, '\\.')}(?:\\s|$|\\)|,|\\.)`, 'i');
            if (pattern.test(normalisedResumeText)) {
                return { found: true, alias, confidence: alias.length <= 3 ? 'medium' : 'high' };
            }
        } else {
            if (normalisedResumeText.includes(normAlias)) {
                return { found: true, alias, confidence: 'high' };
            }
        }
    }
    return { found: false, confidence: 'low' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check which of the required credentials are present in the resume text.
 */
export function validateCredentials(
    resumeText: string,
    requiredCredentialIds: string[],
    bonusCredentialIds?: string[],
): CredentialValidationResult {
    const normText = normaliseText(resumeText);

    const requiredChecks: CredentialCheckResult[] = [];
    const bonusChecks: CredentialCheckResult[] = [];

    for (const credId of requiredCredentialIds) {
        const cred = CREDENTIAL_REGISTRY.find(c => c.id === credId);
        if (!cred) continue;
        const match = findCredentialInText(cred, normText);
        requiredChecks.push({
            credentialId: credId,
            credentialName: cred.name,
            required: true,
            found: match.found,
            foundAlias: match.alias,
            confidence: match.confidence,
            notes: cred.notes,
        });
    }

    for (const credId of (bonusCredentialIds ?? [])) {
        const cred = CREDENTIAL_REGISTRY.find(c => c.id === credId);
        if (!cred) continue;
        const match = findCredentialInText(cred, normText);
        if (match.found) {
            bonusChecks.push({
                credentialId: credId,
                credentialName: cred.name,
                required: false,
                found: true,
                foundAlias: match.alias,
                confidence: match.confidence,
            });
        }
    }

    const missingRequired = requiredChecks.filter(c => !c.found);
    const foundRequired = requiredChecks.filter(c => c.found);
    const hardBlock = missingRequired.some(c => {
        const cred = CREDENTIAL_REGISTRY.find(x => x.id === c.credentialId);
        return cred?.isLicenseRequired ?? false;
    });

    const total = requiredChecks.length;
    const found = foundRequired.length;
    const credentialScore = total > 0 ? Math.round((found / total) * 100) : 100;

    const summary = [
        `Credentials: ${found}/${total} required found`,
        missingRequired.length > 0
            ? `Missing: ${missingRequired.map(c => c.credentialName).join(', ')}`
            : 'All required credentials present',
        hardBlock ? '⛔ HARD BLOCK — required license/certification not evidenced in resume' : '',
    ].filter(Boolean).join(' | ');

    const recommendations: string[] = [];
    if (hardBlock) {
        recommendations.push(`Verify ${missingRequired.filter(c => CREDENTIAL_REGISTRY.find(x => x.id === c.credentialId)?.isLicenseRequired).map(c => c.credentialName).join(', ')} during phone screen — role cannot proceed without it`);
    }
    if (missingRequired.length > 0 && !hardBlock) {
        recommendations.push(`Ask about ${missingRequired.map(c => c.credentialName).join(', ')} during phone screen`);
    }
    if (bonusChecks.length > 0) {
        recommendations.push(`Bonus credentials found: ${bonusChecks.map(c => c.credentialName).join(', ')} — positive signal`);
    }

    return {
        totalRequired: total,
        totalFound: found,
        missingRequired,
        presentCredentials: [...foundRequired, ...bonusChecks],
        credentialScore,
        hardBlock,
        summary,
        recommendations,
    };
}

/**
 * Auto-detect required credentials for a given industry and job title.
 */
export function detectRequiredCredentials(
    jobTitle: string,
    industry: string,
): string[] {
    const lower = jobTitle.toLowerCase();
    const required: string[] = [];

    // Healthcare
    if (/\brn\b|registered nurse/.test(lower)) required.push('rn', 'bls');
    if (/\bnp\b|nurse practitioner/.test(lower)) required.push('np', 'bls');
    if (/\blpn\b|licensed practical nurse/.test(lower)) required.push('lpn', 'bls');
    if (/\bpa[-\s]?c\b|physician assistant/.test(lower)) required.push('pa_c', 'bls');
    if (/physician|doctor|surgeon|\bmd\b|\bdo\b/.test(lower)) required.push('md', 'bls');
    if (/pharmacist|\bpharmd\b/.test(lower)) required.push('pharmd');
    if (/physical therapist|\bpt\b|\bdpt\b/.test(lower)) required.push('pt');
    if (/occupational therapist|\bot\b/.test(lower)) required.push('ot');
    if (/respiratory therapist/.test(lower)) required.push('rt');
    if (/\bcna\b|nursing assistant/.test(lower)) required.push('cna', 'bls');
    if (/social worker/.test(lower)) required.push('lcsw');

    // Legal
    if (/attorney|lawyer|counsel|associate/.test(lower) && industry === 'legal') required.push('jd', 'bar');
    if (/paralegal/.test(lower)) required.push('jd'); // JD not always required but useful

    // Finance
    if (/broker|financial advisor|investment advisor/.test(lower)) required.push('series7', 'series63');
    if (/accountant|cpa/.test(lower)) required.push('cpa');
    if (/risk manager|risk analyst/.test(lower)) required.push('frm');
    if (/internal auditor/.test(lower)) required.push('cia');

    // Education
    if (/teacher|educator|instructor/.test(lower) && !/corporate|corporate trainer/.test(lower)) required.push('teaching_license');

    // Engineering
    if (/\bpe\b|professional engineer|civil engineer|structural engineer/.test(lower)) required.push('pe');

    // Government
    if (/ts\/sci|top secret|intelligence analyst/.test(lower)) required.push('ts_sci');
    if (/secret clearance/.test(lower)) required.push('secret');

    // Security
    if (/ciso|chief information security|information security officer/.test(lower)) required.push('cissp');

    return [...new Set(required)];
}

/**
 * Look up a credential by any alias.
 */
export function lookupCredential(query: string): CredentialDefinition | undefined {
    const norm = normaliseText(query);
    return CREDENTIAL_REGISTRY.find(c =>
        c.aliases.some(a => normaliseText(a) === norm || normaliseText(a).includes(norm)),
    );
}

export { CREDENTIAL_REGISTRY };
