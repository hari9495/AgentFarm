/**
 * JD Compliance Advisor
 *
 * Generates industry- and region-specific regulatory disclosure blocks
 * to append to any job description.  Covers:
 *
 *   Healthcare   — HIPAA, BLS/ACLS, OIG exclusion, state licensure
 *   Finance      — FINRA registration, bonding, credit check, U4
 *   Legal        — State Bar admission, UPL, conflicts check
 *   Education    — DBS / fingerprint, safeguarding, mandatory reporting
 *   Government   — Citizenship, security clearance, ITAR, drug testing
 *   Construction — OSHA, physical demands, CDL, drug/alcohol
 *   Pharma/Life  — GMP, FDA inspection, controlled substances
 *   Transportation — DOT physical, hours of service, CDL, drug testing
 *   Technology   — Export controls (EAR/ITAR) for dual-use software
 *   General      — ADA, EEO, background check, drug-free workplace
 *
 * Region EEO boilerplate: US · UK · EU · Canada · Australia
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceIndustry =
    | 'healthcare'
    | 'finance_banking'
    | 'legal'
    | 'education'
    | 'government_defence'
    | 'construction_trades'
    | 'pharmaceuticals'
    | 'transportation'
    | 'technology'
    | 'general';

export type ComplianceRegion = 'us' | 'uk' | 'eu' | 'canada' | 'australia' | 'global';

export type EmploymentClassification = 'employee' | 'contractor' | 'temp' | 'intern';

export interface ComplianceAdvisoryInput {
    jobTitle: string;
    industry: ComplianceIndustry;
    region: ComplianceRegion;
    employmentClassification?: EmploymentClassification;
    // Role-specific flags
    requiresSecurityClearance?: boolean;     // For government / defence
    clearanceLevel?: 'confidential' | 'secret' | 'top_secret' | 'ts_sci' | 'sc_dv' | 'developed_vetting';
    requiresChildOrVulnerableAdultContact?: boolean;   // For education / healthcare / social work
    requiresFinancialFiduciary?: boolean;              // For finance — triggers FINRA/bonding
    finraRegistrations?: string[];                     // e.g. ['Series 7', 'Series 63']
    requiresDriving?: boolean;                         // Triggers CDL / driver checks
    requiresPhysicalDemands?: boolean;                 // Manual handling, PPE
    requiresGmpEnvironment?: boolean;                  // Pharma / food manufacturing
    requiresExportControlledWork?: boolean;            // ITAR / EAR
    requiresLicensedPractitioner?: boolean;            // Clinical, legal, engineering
    stateOrCountry?: string;                           // e.g. 'California', 'New York', 'England'
}

export interface ComplianceClause {
    id: string;
    section: string;
    heading: string;
    text: string;
    mandatory: boolean;
    legalBasis: string;
}

export interface ComplianceAdvisoryResult {
    industry: ComplianceIndustry;
    region: ComplianceRegion;
    jobTitle: string;
    clauses: ComplianceClause[];
    eeoStatement: string;
    fullComplianceBlock: string;   // Ready-to-paste text for JD footer
    warnings: string[];
    checklist: string[];
}

// ---------------------------------------------------------------------------
// EEO / Equal Opportunity statements by region
// ---------------------------------------------------------------------------

const EEO_STATEMENTS: Record<ComplianceRegion, string> = {
    us:
        `${'{COMPANY}'} is an Equal Opportunity Employer. We do not discriminate on the basis of race, color, religion, sex, sexual orientation, gender identity or expression, national origin, age, disability, veteran status, marital status, or any other legally protected characteristic. We are committed to building an inclusive workplace where everyone can do their best work.`,
    uk:
        `${'{COMPANY}'} is an equal opportunities employer. We welcome applications from all suitably qualified persons regardless of their race, sex, disability, religion/belief, sexual orientation, gender reassignment, marriage/civil partnership, pregnancy/maternity, or age. We are committed to providing reasonable adjustments throughout our recruitment process and will endeavour to be as accommodating as possible. Please contact us to discuss any adjustments you may need. This is in accordance with the Equality Act 2010.`,
    eu:
        `${'{COMPANY}'} is committed to equal treatment and prohibits discrimination in all employment decisions on any ground protected under national law and the EU Equal Treatment Directives, including gender, race or ethnic origin, religion or belief, disability, age, sexual orientation, and nationality. We encourage applications from all eligible candidates.`,
    canada:
        `${'{COMPANY}'} is an equal opportunity employer committed to employment equity and diversity in the workplace. We welcome applications from women, Indigenous peoples, persons with disabilities, and members of visible minorities. Reasonable accommodations are available upon request in accordance with the Accessibility for Ontarians with Disabilities Act (AODA) and applicable provincial human rights legislation.`,
    australia:
        `${'{COMPANY}'} is an equal opportunity employer. We celebrate diversity and are committed to creating an inclusive environment for all employees. We welcome applications regardless of age, ancestry, colour, disability, ethnicity, gender identity, national origin, race, religion, sex, or sexual orientation, in accordance with the Fair Work Act 2009 and applicable state anti-discrimination legislation.`,
    global:
        `${'{COMPANY}'} is an equal opportunity employer. We are committed to creating a diverse and inclusive environment and welcome applications from candidates of all backgrounds, identities, and abilities.`,
};

// ---------------------------------------------------------------------------
// Industry-specific compliance clauses
// ---------------------------------------------------------------------------

function getHealthcareClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'hc_hipaa',
            section: 'Compliance & Training',
            heading: 'HIPAA Compliance',
            text: 'This role involves access to Protected Health Information (PHI). The successful candidate must complete HIPAA Privacy and Security training prior to or within 30 days of start date, and is required to sign a Confidentiality Agreement as a condition of employment.',
            mandatory: true,
            legalBasis: 'HIPAA Privacy Rule (45 CFR Part 164)',
        },
        {
            id: 'hc_oig',
            section: 'Background & Credentialing',
            heading: 'OIG Exclusion Check',
            text: 'Employment is contingent upon the candidate not being listed on the OIG List of Excluded Individuals/Entities (LEIE) or the SAM Excluded Parties List. This check is conducted prior to hire and repeated annually.',
            mandatory: true,
            legalBasis: 'Social Security Act § 1128; 42 CFR Part 1001',
        },
        {
            id: 'hc_license',
            section: 'Licensure & Credentials',
            heading: 'State Licensure Requirement',
            text: `This position requires current, unrestricted licensure in ${input.stateOrCountry ?? 'the state of hire'} as a condition of employment. Candidates must maintain good standing with the applicable state licensing board throughout their employment. Documentation of licensure will be required prior to start date.`,
            mandatory: true,
            legalBasis: 'State nursing / medical practice acts; Joint Commission Standards',
        },
    ];

    if (input.requiresPhysicalDemands) {
        clauses.push({
            id: 'hc_physical',
            section: 'Physical Requirements',
            heading: 'Physical Demands',
            text: 'This role may require lifting/moving patients or equipment (up to [X] lbs), prolonged standing, and exposure to infectious materials and hazardous substances. Reasonable accommodations will be provided in accordance with the Americans with Disabilities Act (ADA) / applicable law.',
            mandatory: false,
            legalBasis: 'ADA / Equality Act 2010 / applicable local disability law',
        });
    }

    if (input.requiresChildOrVulnerableAdultContact) {
        clauses.push({
            id: 'hc_vulnerable',
            section: 'Background & Credentialing',
            heading: 'Vulnerable Adult / Child Protection Check',
            text: 'This role involves contact with vulnerable adults and/or children. Employment is conditional upon satisfactory completion of an enhanced criminal background check, including sex offender registry screening, in accordance with applicable state and federal law.',
            mandatory: true,
            legalBasis: 'Adam Walsh Child Protection and Safety Act; state adult protective services laws',
        });
    }

    return clauses;
}

function getFinanceClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [];

    if (input.requiresFinancialFiduciary) {
        clauses.push({
            id: 'fin_finra',
            section: 'Licensing & Registration',
            heading: 'FINRA Registration',
            text: `This position requires active FINRA registration. ${input.finraRegistrations && input.finraRegistrations.length > 0 ? `Required registrations: ${input.finraRegistrations.join(', ')}.` : 'Required registrations will be confirmed during the offer process.'} Candidates must be eligible for registration and must not have any disclosure events that would prevent obtaining or maintaining registration. A Form U4 will be filed upon hire.`,
            mandatory: true,
            legalBasis: 'FINRA Rules 1210, 1220, 1230; SEC Rule 15b7-1',
        });
        clauses.push({
            id: 'fin_credit',
            section: 'Background Checks',
            heading: 'Credit History Check',
            text: 'Due to the nature of this role\'s financial responsibilities, a credit history check will be conducted in accordance with the Fair Credit Reporting Act (FCRA). A disclosure and authorisation form will be provided separately. Adverse credit history does not automatically disqualify a candidate.',
            mandatory: true,
            legalBasis: 'FCRA (15 U.S.C. § 1681); applicable state credit check laws',
        });
        clauses.push({
            id: 'fin_bonding',
            section: 'Bonding',
            heading: 'Fidelity Bond Requirement',
            text: 'This role is covered under the firm\'s ERISA Fidelity Bond / Blanket Bond. Employment is contingent upon the candidate being bondable (i.e., no disqualifying criminal history involving dishonesty or a breach of trust per 29 U.S.C. § 1112).',
            mandatory: true,
            legalBasis: 'ERISA § 412 (29 U.S.C. § 1112); Investment Advisers Act',
        });
    }

    clauses.push({
        id: 'fin_aml',
        section: 'Compliance',
        heading: 'Anti-Money Laundering (AML) Training',
        text: 'All employees in regulated roles must complete mandatory AML/BSA training within 30 days of start date and annually thereafter, in accordance with the Bank Secrecy Act and applicable FinCEN requirements.',
        mandatory: true,
        legalBasis: 'Bank Secrecy Act (31 U.S.C. § 5318); FinCEN regulations',
    });

    return clauses;
}

function getLegalClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    return [
        {
            id: 'legal_bar',
            section: 'Admission & Licensure',
            heading: 'Bar Admission Requirement',
            text: `This position requires current admission to the Bar ${input.stateOrCountry ? `in ${input.stateOrCountry}` : 'in the applicable jurisdiction'} and good standing with the relevant state Bar association. Proof of Bar admission and a current Certificate of Good Standing will be required prior to start date.`,
            mandatory: true,
            legalBasis: 'State Bar admission rules; Model Rules of Professional Conduct',
        },
        {
            id: 'legal_upl',
            section: 'Professional Standards',
            heading: 'Unauthorised Practice of Law',
            text: 'Candidates must hold a valid licence to practise law and must not engage in the unauthorised practice of law. Any change in Bar status (suspension, disbarment, inactive status) must be reported to the firm immediately.',
            mandatory: true,
            legalBasis: 'State unauthorised practice of law statutes; ABA Model Rule 5.5',
        },
        {
            id: 'legal_conflicts',
            section: 'Conflicts of Interest',
            heading: 'Conflicts of Interest Check',
            text: 'All candidates will be asked to complete a conflicts of interest questionnaire as part of the hiring process. The firm runs a conflicts check prior to extending an offer. Candidates may be asked to provide a list of current and prior clients and matters.',
            mandatory: true,
            legalBasis: 'ABA Model Rules of Professional Conduct 1.7, 1.9, 1.10',
        },
        {
            id: 'legal_malpractice',
            section: 'Insurance',
            heading: 'Professional Indemnity',
            text: 'This role is covered under the firm\'s professional indemnity / malpractice insurance policy. Details are available upon request.',
            mandatory: false,
            legalBasis: 'State bar insurance requirements; firm risk management policy',
        },
    ];
}

function getEducationClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'ed_bgc',
            section: 'Background Checks',
            heading: 'Criminal Background Check & Fingerprinting',
            text: input.region === 'uk'
                ? 'This post is subject to an enhanced Disclosure and Barring Service (DBS) check under the Safeguarding Vulnerable Groups Act 2006. Employment is conditional upon a satisfactory DBS disclosure. This position is exempt from the Rehabilitation of Offenders Act 1974.'
                : `This position is subject to a fingerprint-based criminal background check through the applicable state law enforcement agency${input.stateOrCountry ? ` (${input.stateOrCountry})` : ''}. Employment is contingent on the results of this check, as required by state law governing employment in educational settings.`,
            mandatory: true,
            legalBasis: input.region === 'uk'
                ? 'Safeguarding Vulnerable Groups Act 2006; DBS Code of Practice'
                : 'State child protection / education laws; Clery Act',
        },
        {
            id: 'ed_safeguarding',
            section: 'Child Protection & Safeguarding',
            heading: 'Safeguarding Commitment',
            text: input.region === 'uk'
                ? 'We are committed to safeguarding and promoting the welfare of children and young people. All staff are expected to share this commitment. This post is subject to safer recruitment procedures, including verification of identity, qualifications, employment history, and references.'
                : 'We are committed to the safety and well-being of all students. All employees are mandatory reporters under applicable state law and are required to report any suspected child abuse or neglect to the appropriate authorities. Training on mandatory reporting obligations will be provided upon hire.',
            mandatory: true,
            legalBasis: input.region === 'uk'
                ? 'Children Act 1989; Keeping Children Safe in Education (KCSIE) statutory guidance'
                : 'State mandatory reporter laws; FERPA; Title IX',
        },
        {
            id: 'ed_qualifications',
            section: 'Licensure & Qualifications',
            heading: 'Teaching Credential / State Licensure',
            text: `This position requires a valid teaching credential / licence issued by ${input.stateOrCountry ?? 'the relevant licensing authority'}. Proof of licensure must be provided prior to start date. The credential must remain current and in good standing throughout employment.`,
            mandatory: true,
            legalBasis: 'State teacher certification laws; No Child Left Behind Act / Every Student Succeeds Act',
        },
    ];

    if (input.requiresChildOrVulnerableAdultContact) {
        clauses.push({
            id: 'ed_barred',
            section: 'Background Checks',
            heading: 'Barred List Check',
            text: input.region === 'uk'
                ? 'We will check the DBS Children\'s Barred List and Adults\' Barred List as part of the enhanced DBS check. It is a criminal offence to knowingly employ a barred individual in regulated activity with children.'
                : 'We check the National Sex Offender Public Website (NSOPW) and state sex offender registry as part of the pre-employment background check. Inclusion on any sex offender registry is disqualifying for this role.',
            mandatory: true,
            legalBasis: input.region === 'uk'
                ? 'Safeguarding Vulnerable Groups Act 2006 s.34'
                : 'Adam Walsh Child Protection and Safety Act; Jacob Wetterling Act',
        });
    }

    return clauses;
}

function getGovernmentClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'gov_citizenship',
            section: 'Eligibility',
            heading: 'Citizenship / Nationality Requirement',
            text: 'This position is restricted to persons who meet the citizenship or nationality requirements established by law, executive order, or regulation. Applicants who do not meet this requirement are not eligible for consideration.',
            mandatory: true,
            legalBasis: '5 U.S.C. § 3301; Executive Order 13526 (US); Schedule 1, Part 1 of the Security Vetting Policy (UK)',
        },
    ];

    if (input.requiresSecurityClearance) {
        clauses.push({
            id: 'gov_clearance',
            section: 'Security Requirements',
            heading: `Security Clearance — ${input.clearanceLevel?.toUpperCase().replace('_', '/') ?? 'Required'}`,
            text: input.region === 'uk'
                ? `This post requires ${input.clearanceLevel === 'ts_sci' ? 'Developed Vetting (DV)' : input.clearanceLevel === 'secret' ? 'Security Check (SC)' : input.clearanceLevel === 'sc_dv' ? 'SC/DV' : 'the appropriate level of National Security Vetting (NSV)'}. The successful candidate must hold or be eligible to obtain and maintain this clearance. The clearance process involves a thorough background investigation and may take several months.`
                : `This position requires the candidate to obtain and maintain a ${input.clearanceLevel?.toUpperCase().replace('_', '/') ?? 'security'} clearance. The offer of employment is contingent upon successful completion of a full background investigation conducted by the relevant US Government agency. Candidates must be willing to submit to a polygraph examination if required.`,
            mandatory: true,
            legalBasis: input.region === 'uk'
                ? 'HMG Baseline Personnel Security Standard; Security Vetting Policy'
                : 'Executive Order 12968; SEAD-4; 5 CFR Part 732',
        });
    }

    if (input.requiresExportControlledWork) {
        clauses.push({
            id: 'gov_itar',
            section: 'Export Controls',
            heading: 'ITAR / EAR Compliance',
            text: 'This position requires access to technical data and/or technology controlled under the International Traffic in Arms Regulations (ITAR, 22 CFR Parts 120–130) and/or Export Administration Regulations (EAR, 15 CFR Parts 730–774). Candidates must be a "US Person" as defined by ITAR (US citizen, lawful permanent resident, or protected individual under 8 U.S.C. § 1324b(a)(3)), or appropriate export authorisation must be obtained.',
            mandatory: true,
            legalBasis: 'ITAR (22 CFR §§ 120–130); EAR (15 CFR §§ 730–774); Arms Export Control Act',
        });
    }

    clauses.push({
        id: 'gov_drug',
        section: 'Drug Testing',
        heading: 'Drug-Free Workplace',
        text: 'This position is subject to a pre-employment drug test and is covered by the Drug-Free Workplace Act. Employees in safety-sensitive or security-sensitive positions may be subject to random drug testing throughout their employment.',
        mandatory: true,
        legalBasis: 'Drug-Free Workplace Act (41 U.S.C. §§ 8101–8106); Executive Order 12564',
    });

    return clauses;
}

function getConstructionClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'con_osha',
            section: 'Safety & Certification',
            heading: 'OSHA Training Requirement',
            text: 'This role requires a current OSHA 10-hour (or OSHA 30-hour for supervisory roles) construction industry card. Candidates must provide proof of completion prior to or within 30 days of start date. Ongoing safety training will be provided as required by site and project.',
            mandatory: true,
            legalBasis: 'OSHA 29 CFR Part 1926; applicable state plan requirements',
        },
        {
            id: 'con_physical',
            section: 'Physical Requirements',
            heading: 'Physical Demands',
            text: 'This position requires regular lifting of materials up to [X] lbs, working at heights, in confined spaces, and in varying weather conditions. Candidates must be capable of performing these essential functions with or without reasonable accommodation. Compliance with all PPE requirements is mandatory.',
            mandatory: true,
            legalBasis: 'OSHA PPE standards (29 CFR 1926.95–1926.106); ADA reasonable accommodation',
        },
        {
            id: 'con_drug',
            section: 'Drug & Alcohol Testing',
            heading: 'Drug & Alcohol Free Workplace',
            text: 'This is a safety-sensitive position. Candidates must pass a pre-employment drug and alcohol test. Employees may be subject to random, post-accident, and reasonable suspicion testing. A positive result or refusal to test is grounds for withdrawal of offer or termination.',
            mandatory: true,
            legalBasis: 'Drug-Free Workplace Act; DOT 49 CFR Part 40 (where applicable); OSHA post-accident reporting',
        },
    ];

    if (input.requiresDriving) {
        clauses.push({
            id: 'con_cdl',
            section: 'Licensing',
            heading: 'Commercial Driver\'s Licence (CDL)',
            text: 'This role requires a valid Commercial Driver\'s Licence (CDL) Class [A/B/C] with applicable endorsements. Candidates must have a clean Motor Vehicle Record (MVR). Licence verification will be conducted during the background check process.',
            mandatory: true,
            legalBasis: '49 CFR Part 383; Federal Motor Carrier Safety Regulations',
        });
    }

    return clauses;
}

function getPharmaClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'pharma_gmp',
            section: 'Quality & Regulatory',
            heading: 'GMP Training',
            text: 'This role operates within a GMP (Good Manufacturing Practice) environment. The successful candidate will be required to complete GMP training as part of onboarding and maintain compliance with all applicable FDA regulations (21 CFR Parts 210/211) or EMA/EU GMP guidelines throughout their employment.',
            mandatory: true,
            legalBasis: '21 CFR Parts 210, 211; EU GMP Directive 2003/94/EC',
        },
        {
            id: 'pharma_fda',
            section: 'Quality & Regulatory',
            heading: 'FDA Inspection Readiness',
            text: 'Employees in this role may be called upon to interact with or support FDA or regulatory authority inspections. All employees are required to adhere to data integrity principles and to escalate any compliance concerns through appropriate channels.',
            mandatory: false,
            legalBasis: '21 CFR Part 11; FDA inspection guidance',
        },
    ];

    if (input.requiresGmpEnvironment) {
        clauses.push({
            id: 'pharma_controlled',
            section: 'Background Checks',
            heading: 'DEA Registration / Controlled Substance Handling',
            text: 'This position may involve handling DEA Schedule I–V controlled substances. The candidate must be eligible for DEA registration and must not have been convicted of a felony related to controlled substances. DEA background investigation may be required.',
            mandatory: false,
            legalBasis: 'Controlled Substances Act (21 U.S.C. § 801 et seq.); DEA 21 CFR Part 1301',
        });
    }

    return clauses;
}

function getTransportationClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    return [
        {
            id: 'trans_dot',
            section: 'Physical & Medical',
            heading: 'DOT Physical Examination',
            text: 'This is a safety-sensitive position subject to Department of Transportation (DOT) physical examination requirements. The candidate must hold a valid DOT medical certificate and pass a pre-employment DOT physical examination conducted by a certified Medical Examiner listed on the FMCSA National Registry.',
            mandatory: true,
            legalBasis: '49 CFR Part 391 (FMCSA); 49 CFR Part 40 (DOT drug/alcohol testing)',
        },
        {
            id: 'trans_cdl',
            section: 'Licensing',
            heading: 'CDL & MVR Requirements',
            text: 'A valid CDL Class [A/B] is required. Candidates must have held a valid CDL for at least [X] years. We will conduct a Motor Vehicle Record (MVR) check and obtain a PSP (Pre-Employment Screening Program) report via FMCSA. Serious traffic violations within the past 3 years may be disqualifying.',
            mandatory: true,
            legalBasis: '49 CFR Parts 383, 391; FMCSA PSP regulations',
        },
        {
            id: 'trans_drug',
            section: 'Drug & Alcohol Testing',
            heading: 'DOT Drug & Alcohol Testing',
            text: 'This position is subject to DOT-mandated pre-employment drug testing and is covered by our DOT drug and alcohol testing programme. Random, post-accident, and reasonable suspicion testing apply throughout employment. Candidates must not have failed or refused a DOT drug/alcohol test without completing a return-to-duty process.',
            mandatory: true,
            legalBasis: '49 CFR Part 40; 49 CFR Part 382',
        },
        {
            id: 'trans_hos',
            section: 'Regulatory Compliance',
            heading: 'Hours of Service',
            text: 'This role is subject to FMCSA Hours of Service regulations (49 CFR Part 395). Drivers must use an Electronic Logging Device (ELD) and maintain accurate logs. Falsification of logs is a terminable offence.',
            mandatory: true,
            legalBasis: '49 CFR Part 395; FMCSA ELD mandate',
        },
    ];
}

function getTechnologyClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [];

    if (input.requiresExportControlledWork) {
        clauses.push({
            id: 'tech_itar',
            section: 'Export Controls',
            heading: 'Export Control Compliance (ITAR / EAR)',
            text: 'Some of our products and technologies may be subject to US export control laws, including ITAR and the EAR. This role may require access to controlled technology. Candidates must be a "US Person" under ITAR, or appropriate export authorisation must be in place prior to access being granted.',
            mandatory: true,
            legalBasis: 'ITAR (22 CFR Parts 120–130); EAR (15 CFR Parts 730–774)',
        });
    }

    if (input.requiresSecurityClearance) {
        clauses.push({
            id: 'tech_clearance',
            section: 'Security Requirements',
            heading: 'Security Clearance',
            text: `This role requires the candidate to hold or obtain a ${input.clearanceLevel?.toUpperCase().replace('_', '/') ?? 'government'} security clearance. Candidates must be eligible for the required clearance level. Offer is contingent upon clearance being granted or confirmed.`,
            mandatory: true,
            legalBasis: 'Executive Order 12968; SEAD-4; applicable contract requirements',
        });
    }

    if (clauses.length === 0) {
        clauses.push({
            id: 'tech_bgc',
            section: 'Background Checks',
            heading: 'Background Check',
            text: 'Employment is contingent upon satisfactory completion of a background check. Details will be provided in the offer letter.',
            mandatory: false,
            legalBasis: 'FCRA; applicable state law',
        });
    }

    return clauses;
}

function getGeneralClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const clauses: ComplianceClause[] = [
        {
            id: 'gen_bgc',
            section: 'Background Checks',
            heading: 'Pre-Employment Background Check',
            text: 'Employment is contingent upon satisfactory completion of a pre-employment background check, which may include criminal history, employment verification, and education verification, in accordance with applicable law. A separate disclosure and authorisation will be provided.',
            mandatory: false,
            legalBasis: 'FCRA (15 U.S.C. § 1681 et seq.); applicable state background check laws',
        },
        {
            id: 'gen_ada',
            section: 'Accommodations',
            heading: 'Reasonable Accommodations',
            text: 'We are committed to providing reasonable accommodations for qualified individuals with disabilities. If you require accommodations during the application or interview process, please contact [HR contact] to discuss your needs.',
            mandatory: true,
            legalBasis: 'ADA (US); Equality Act 2010 (UK); applicable local disability law',
        },
    ];

    if (input.employmentClassification === 'contractor') {
        clauses.push({
            id: 'gen_contractor',
            section: 'Engagement Terms',
            heading: 'Independent Contractor',
            text: 'This is an independent contractor position. The contractor is not an employee and is not entitled to employee benefits. The contractor is responsible for their own tax and national insurance / self-employment obligations. A separate Statement of Work and Independent Contractor Agreement will be provided.',
            mandatory: true,
            legalBasis: 'IRS Rev. Rul. 87-41; applicable state worker classification laws; IR35 (UK)',
        });
    }

    return clauses;
}

// ---------------------------------------------------------------------------
// Main clause builder
// ---------------------------------------------------------------------------

function buildClauses(input: ComplianceAdvisoryInput): ComplianceClause[] {
    const base = getGeneralClauses(input);

    switch (input.industry) {
        case 'healthcare':          return [...getHealthcareClauses(input), ...base];
        case 'finance_banking':     return [...getFinanceClauses(input),   ...base];
        case 'legal':               return [...getLegalClauses(input),     ...base];
        case 'education':           return [...getEducationClauses(input), ...base];
        case 'government_defence':  return [...getGovernmentClauses(input),...base];
        case 'construction_trades': return [...getConstructionClauses(input),...base];
        case 'pharmaceuticals':     return [...getPharmaClauses(input),    ...base];
        case 'transportation':      return [...getTransportationClauses(input),...base];
        case 'technology':          return [...getTechnologyClauses(input), ...base];
        default:                    return base;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildJdComplianceBlock(input: ComplianceAdvisoryInput): ComplianceAdvisoryResult {
    const clauses = buildClauses(input);
    const eeoStatement = EEO_STATEMENTS[input.region].replace(/\{COMPANY\}/g, '[Company Name]');

    const warnings: string[] = [];

    if (input.industry === 'healthcare' && !input.requiresLicensedPractitioner) {
        warnings.push('Healthcare role detected but requiresLicensedPractitioner is not set — verify whether state licensure clause is needed.');
    }
    if (input.requiresSecurityClearance && !input.clearanceLevel) {
        warnings.push('Security clearance required but clearanceLevel not specified — set clearanceLevel for correct disclosure language.');
    }
    if (input.industry === 'finance_banking' && !input.requiresFinancialFiduciary) {
        warnings.push('Finance role detected but requiresFinancialFiduciary is not set — confirm whether FINRA / bonding clauses are needed.');
    }
    if (input.region === 'uk' && input.requiresChildOrVulnerableAdultContact) {
        warnings.push('UK role with child/vulnerable adult contact — ensure DBS update service subscription is checked for frequent turnover roles.');
    }
    if (input.employmentClassification === 'contractor' && input.region === 'uk') {
        warnings.push('UK contractor role — IR35 determination required. Use the international-recruiting module to run an IR35 assessment.');
    }

    const fullComplianceBlock = [
        `---`,
        `## Compliance & Additional Information`,
        ``,
        ...clauses.map(c => [
            `### ${c.heading}`,
            c.text,
            ``,
        ].join('\n')),
        `### Equal Opportunity`,
        eeoStatement,
    ].join('\n');

    const checklist = [
        'Replace [Company Name] with your company name throughout this block',
        'Replace all [X], [AMOUNT], [HR contact], [A/B/C] placeholders with actual values',
        'Have legal counsel review clauses before publishing — especially clearance, ITAR, and FINRA language',
        clauses.some(c => c.id.startsWith('hc_')) ? 'Confirm state licensure requirements with HR before publishing (state laws vary)' : null,
        clauses.some(c => c.id.startsWith('fin_')) ? 'Confirm FINRA registration requirements with compliance officer' : null,
        clauses.some(c => c.id === 'gov_itar') ? 'Have export counsel confirm ITAR / EAR applicability and correct US Person definition' : null,
        clauses.some(c => c.id === 'ed_bgc') ? 'Confirm state-specific fingerprinting requirements with HR — rules vary significantly by state' : null,
        'Add accommodation contact details before posting',
    ].filter(Boolean) as string[];

    return {
        industry: input.industry,
        region: input.region,
        jobTitle: input.jobTitle,
        clauses,
        eeoStatement,
        fullComplianceBlock,
        warnings,
        checklist,
    };
}
