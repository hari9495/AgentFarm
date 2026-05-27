/**
 * Background Check
 *
 * FCRA-compliant background check initiation workflow:
 *   - Disclosure + authorisation document
 *   - Initiation request to BGC provider (Sterling, Checkr, HireRight)
 *   - Status tracking and result interpretation
 *   - Adverse action notice (pre-adverse + final adverse) if BGC fails
 *
 * Designed for US hiring; notes UK (DBS) and EU equivalents where applicable.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BgcProvider = 'sterling' | 'checkr' | 'hireright' | 'first_advantage' | 'generic';
export type BgcPackage =
    | 'standard'           // Criminal, employment, education verification
    | 'enhanced'           // + credit, professional licence verification
    | 'executive'          // + media search, global watchlist
    | 'clinical'           // + OIG exclusion, SAM, DEA, licence verification
    | 'financial'          // + credit report, FINRA BrokerCheck
    | 'federal_government' // + fingerprint, security clearance initiation
    | 'international';     // Cross-border criminal + employment

export type BgcStatus = 'pending' | 'in_progress' | 'clear' | 'consider' | 'adverse' | 'cancelled';

export interface BgcInitiateInput {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    hrSignatoryName?: string;
    bgcPackage: BgcPackage;
    bgcProvider?: BgcProvider;
    stateOfHire?: string;               // US state (affects FCRA requirements)
    countryOfHire?: string;             // 'US', 'UK', 'DE', etc.
    /** UK only — DBS check level; auto-inferred from bgcPackage if not set. */
    dbsLevel?: DbsLevel;
    additionalChecks?: string[];        // e.g. ['driving_record', 'drug_screen"]
}

export interface AdverseActionInput {
    candidateName: string;
    candidateAddress?: string;
    jobTitle: string;
    companyName: string;
    hrSignatoryName?: string;
    bgcProviderName: string;
    bgcProviderContact: string;
    adverseFindings: string[];
    actionType: 'pre_adverse' | 'final_adverse';
    preAdverseDate?: string;   // For final adverse — date pre-adverse was sent
}

export interface BgcPackage_ {
    checksIncluded: string[];
    typicalTurnaround: string;
    notes: string;
}

export interface BgcInitiationResult {
    candidateName: string;
    jobTitle: string;
    bgcPackage: BgcPackage;
    bgcProvider: BgcProvider;
    disclosureAndAuthDocument: string;
    candidateInviteEmail: string;
    recruiterChecklistEmail: string;
    packageDetails: BgcPackage_;
    complianceNotes: string[];
    /** Populated for non-US hires — country-specific guidance replaces FCRA workflow. */
    internationalNotes?: string;
    /** Populated for UK hires — DBS check level guidance. */
    ukDbsGuidance?: string;
}

export interface AdverseActionResult {
    actionType: 'pre_adverse' | 'final_adverse';
    letterText: string;
    requiredEnclosures: string[];
    deliveryMethod: string;
    complianceDeadline: string;
    nextSteps: string[];
}

// ---------------------------------------------------------------------------
// UK DBS check framework
// ---------------------------------------------------------------------------

/**
 * UK Disclosure and Barring Service (DBS) check levels.
 * Required for most UK hires in regulated industries (healthcare, education, law).
 * Regulated by the Police Act 1997 and the Safeguarding Vulnerable Groups Act 2006.
 */
export type DbsLevel = 'basic' | 'standard' | 'enhanced' | 'enhanced_barred_list';

const UK_DBS_LEVELS: Record<DbsLevel, {
    description: string;
    typicalRoles: string;
    turnaround: string;
    processingBody: string;
    notes: string;
}> = {
    basic: {
        description: 'Shows unspent convictions and conditional cautions only.',
        typicalRoles: 'Most office and professional roles not involving vulnerable groups.',
        turnaround: '5–14 business days',
        processingBody: 'Applicant applies directly at gov.uk/request-copy-criminal-record',
        notes: 'The only level a candidate can apply for themselves. Employer may require the certificate to be presented on Day 1.',
    },
    standard: {
        description: 'Shows spent and unspent convictions, cautions, reprimands, and final warnings.',
        typicalRoles: 'Roles in law, financial services, pharmacy, and other regulated professions.',
        turnaround: '5–14 business days',
        processingBody: 'Employer submits via a registered Umbrella Body (e.g. uCheck, Sterling)',
        notes: 'Employer must be in a legally-permitted occupation to request Standard level. Candidate countersigns.',
    },
    enhanced: {
        description: 'Standard disclosure plus relevant police information held locally.',
        typicalRoles: 'Roles working with children or vulnerable adults in a supervised capacity.',
        turnaround: '5–14 business days (up to 60 days if police information is flagged)',
        processingBody: 'Employer submits via a registered Umbrella Body',
        notes: 'Most common level for NHS, social care, and teaching roles. Police forces may add "soft intelligence" not on the PNC.',
    },
    enhanced_barred_list: {
        description: 'Enhanced check plus check against the DBS Children\'s and/or Adults\' Barred Lists.',
        typicalRoles: 'Regulated activity with children or vulnerable adults (unsupervised, regular contact).',
        turnaround: '5–14 business days (up to 60 days if barred list or police information flagged)',
        processingBody: 'Employer submits via a registered Umbrella Body. Must confirm post is regulated activity.',
        notes: 'Legally required before placing anyone in regulated activity. Placing a barred person in regulated activity is a criminal offence (SVG Act 2006).',
    },
};

/**
 * EU / international criminal record check equivalents by country.
 * Each country has its own process; no single EU-wide criminal record check exists.
 */
const EU_INTERNATIONAL_BGC: Record<string, { name: string; issuingBody: string; notes: string }> = {
    DE: { name: 'Führungszeugnis', issuingBody: 'Federal Central Register (Bundeszentralregister) via Bürgeramt', notes: 'Two types: private (simple conviction record) and public (for professional licensing). Issued within 2–4 weeks. GDPR consent required.' },
    FR: { name: 'Bulletin no. 3 (Casier judiciaire)', issuingBody: 'Casier judiciaire national (Ministry of Justice)', notes: 'Bulletin no. 3 is the only level available to individuals / employers. Contains unspent convictions. Available online via justice.fr.' },
    NL: { name: 'Verklaring Omtrent Gedrag (VOG)', issuingBody: 'Dienst Justis (Ministry of Security and Justice)', notes: 'Role-specific assessment. Applied via Justis or municipality. Required for many care, education, and security roles. Takes 1–4 weeks.' },
    ES: { name: 'Certificado de Antecedentes Penales', issuingBody: 'Registro Central de Penados (Ministry of Justice)', notes: 'Available online via justicia.gob.es. Contains serious convictions. Candidate must apply; employer cannot request directly.' },
    SE: { name: 'Utdrag ur belastningsregistret', issuingBody: 'Swedish Police Authority (Polismyndigheten)', notes: 'Candidate requests their own record. For roles with children, use Form 442.3. Processing time 1–4 weeks.' },
    PL: { name: 'Zaświadczenie o niekaralności (KRK)', issuingBody: 'Krajowy Rejestr Karny (National Criminal Register)', notes: 'Available online via Portal Informacyjny Ministerstwa Sprawiedliwości. Covers convictions in Poland.' },
    AU: { name: 'National Police Certificate (NPC)', issuingBody: 'Australian Federal Police (AFP) or state police', notes: 'Most roles use state/territory police check (faster). AFP NPC for federal government and international use. Working With Children Check (WWCC) required separately for child-related roles.' },
    SG: { name: 'Certificate of Clearance (CoC)', issuingBody: 'Singapore Police Force (SPF)', notes: 'Candidates apply at SPF HQ or online. Required for many regulated roles and financial sector positions. PDPA consent required.' },
    IN: { name: 'Police Verification Certificate', issuingBody: 'Local police station of permanent residence', notes: 'Process varies by state. For corporate roles, many employers use third-party verifiers (Authbridge, KPMG BGCS). Can take 2–8 weeks.' },
    AE: { name: 'Good Conduct Certificate (شهادة حسن السيرة والسلوك)', issuingBody: 'UAE Ministry of Interior (Abu Dhabi Police / Dubai Police)', notes: 'Required for most UAE employment visas. Apply online via MOI or Amer centres. Apostille may be required for international use.' },
    CA: { name: 'RCMP Criminal Record Check', issuingBody: 'Royal Canadian Mounted Police (RCMP) or accredited service', notes: 'Standard criminal record check for employment. Vulnerable Sector Check (VSC) required for roles with vulnerable populations. Provincial equivalents exist.' },
    NZ: { name: 'Criminal Record Check', issuingBody: 'Ministry of Justice NZ', notes: 'Available online via Criminal Records (Clean Slate) Act 2004. Police Vetting (for specified organisations) is more comprehensive.' },
};

function buildUkDbsGuidance(dbsLevel: DbsLevel, jobTitle: string, companyName: string): string {
    const dbs = UK_DBS_LEVELS[dbsLevel];
    return [
        `# UK DBS Check Guidance — ${jobTitle} at ${companyName}`,
        `**Check Level:** ${dbsLevel.replace(/_/g, ' ').toUpperCase()} | **Turnaround:** ${dbs.turnaround}`,
        `**Processing:** ${dbs.processingBody}`,
        '',
        `## What This Check Covers`,
        dbs.description,
        '',
        `## Typical Roles for This Level`,
        dbs.typicalRoles,
        '',
        `## Key Compliance Requirements`,
        `- [ ] Candidate must provide written consent before DBS check is initiated (Data Protection Act 2018)`,
        `- [ ] Retain a copy of the DBS certificate securely; do not retain for longer than 6 months`,
        `- [ ] Register with the DBS Update Service to enable portability and real-time status (optional but recommended)`,
        `- [ ] If adverse result, follow fair-hiring guidance — consider role relevance, time elapsed, and rehabilitation`,
        '',
        `## Notes`,
        dbs.notes,
        '',
        `*The DBS has replaced the former CRB (Criminal Records Bureau) and ISA (Independent Safeguarding Authority).*`,
    ].join('\n');
}

function buildInternationalBgcNote(countryCode: string): string {
    const upperCode = countryCode.toUpperCase();
    const info = EU_INTERNATIONAL_BGC[upperCode];
    if (!info) {
        return `International BGC for ${countryCode}: No specific guidance available. Consult local legal counsel and use a vetted international BGC provider (e.g. Sterling International, HireRight International). Ensure compliance with local data protection law and obtain candidate consent per local regulations.`;
    }
    return [
        `**Criminal Record Check for ${upperCode}: ${info.name}**`,
        `**Issuing Body:** ${info.issuingBody}`,
        `**Notes:** ${info.notes}`,
        ``,
        `⚠️ Data protection requirements apply: candidate consent must be obtained per local law (GDPR where applicable).`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// BGC package definitions
// ---------------------------------------------------------------------------

const BGC_PACKAGES: Record<BgcPackage, BgcPackage_> = {
    standard: {
        checksIncluded: [
            'SSN/Identity trace',
            'Multi-jurisdictional criminal database search',
            'County criminal search (7-year lookback)',
            'Federal criminal search',
            'Sex offender registry',
            'Global watchlist / OFAC / terrorist screening',
            'Employment verification (last 3 positions)',
            'Education verification (highest degree)',
        ],
        typicalTurnaround: '3–5 business days',
        notes: 'Appropriate for most professional and office-based roles.',
    },
    enhanced: {
        checksIncluded: [
            'All Standard checks',
            'Credit report (with consent)',
            'Professional licence verification',
            'Civil records search',
            'Extended employment verification (7 years)',
            'Reference check coordination (if not done separately)',
        ],
        typicalTurnaround: '5–7 business days',
        notes: 'Recommended for roles with financial responsibility, access to sensitive data, or professional licensure requirements.',
    },
    executive: {
        checksIncluded: [
            'All Enhanced checks',
            'Global adverse media search',
            'Litigation history search (civil + bankruptcy)',
            'Directorship / board membership check',
            'Social media screening (structured)',
            'International criminal check (if applicable)',
        ],
        typicalTurnaround: '7–10 business days',
        notes: 'For Director, VP, and C-level hires. May require longer turnaround for international components.',
    },
    clinical: {
        checksIncluded: [
            'All Standard checks',
            'OIG (Office of Inspector General) exclusion search',
            'SAM (System for Award Management) exclusion',
            'State medical/nursing licence verification',
            'DEA registration check (where applicable)',
            'NPDB (National Practitioner Data Bank) query',
            'Abuse registry search',
            'Drug screen (5-panel or 10-panel)',
        ],
        typicalTurnaround: '5–8 business days',
        notes: 'Mandatory for all clinical healthcare roles. OIG exclusion is a legal requirement for Medicare/Medicaid billing roles.',
    },
    financial: {
        checksIncluded: [
            'All Enhanced checks',
            'Full credit report with fraud indicators',
            'FINRA BrokerCheck verification',
            'FINRA CRD (Central Registration Depository) search',
            'Regulatory enforcement action search',
            'Bankruptcy filing check',
        ],
        typicalTurnaround: '5–7 business days',
        notes: 'Required for FINRA-registered roles and positions with financial control or fiduciary duties.',
    },
    federal_government: {
        checksIncluded: [
            'All Enhanced checks',
            'Fingerprint-based FBI criminal check',
            'eQIP form initiation (for security clearance)',
            'Foreign national contact disclosure',
            'Drug screen',
            'Personal interview (for TS/SCI)',
        ],
        typicalTurnaround: '30–120 days (clearance-dependent)',
        notes: 'Timeline varies significantly by clearance level. Interim clearance may allow start before full adjudication.',
    },
    international: {
        checksIncluded: [
            'Country-specific criminal record check',
            'International employment verification',
            'International education verification',
            'Global watchlist / sanctions screening',
            'Right-to-work / visa status verification',
        ],
        typicalTurnaround: '10–21 business days',
        notes: 'Subject to local data protection laws (GDPR in EU/UK). Candidate must consent per local regulations.',
    },
};

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

function buildDisclosureAuth(input: BgcInitiateInput): string {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return [
        `DISCLOSURE AND AUTHORIZATION FOR BACKGROUND INVESTIGATION`,
        ``,
        `In connection with your application for employment or continued employment with **${input.companyName}** ("Company"), a consumer report and/or investigative consumer report ("Background Report") may be obtained from a consumer reporting agency ("CRA") for employment purposes.`,
        ``,
        `**Consumer Reporting Agency:**`,
        `${input.bgcProvider === 'checkr' ? 'Checkr, Inc. — 1 Montgomery St, Suite 2000, San Francisco, CA 94104 | (844) 824-5373' :
          input.bgcProvider === 'sterling' ? 'Sterling (Sterling Infosystems) — 249 W 17th St, New York, NY 10011 | (800) 853-3228' :
          input.bgcProvider === 'hireright' ? 'HireRight, LLC — 100 Centerview Dr #300, Nashville, TN 37214 | (800) 381-0645' :
          input.bgcProvider === 'first_advantage' ? 'First Advantage — 1 Concourse Pkwy NE, Suite 200, Atlanta, GA 30328 | (800) 888-5773' :
          '[BGC Provider Name and Contact Information]'}`,
        ``,
        `**Scope of the Background Report may include, but is not limited to:**`,
        ...BGC_PACKAGES[input.bgcPackage].checksIncluded.map(c => `  • ${c}`),
        ``,
        `**Your Rights Under the FCRA:**`,
        `You have the right to obtain a free copy of your consumer report from the CRA upon request within 60 days of receiving notice that adverse action was taken, or within 60 days of being informed of your right to a free copy. You also have the right to dispute incomplete or inaccurate information in your report.`,
        ``,
        input.stateOfHire ? `**${input.stateOfHire} State-Specific Notice:** [Attach applicable state addendum — check with legal for ${input.stateOfHire} requirements]` : '',
        ``,
        `By signing below, I:`,
        `(1) Acknowledge receipt of this disclosure`,
        `(2) Authorize ${input.companyName} and its agents to obtain background report(s) about me`,
        `(3) Understand this authorization remains on file and may be used for future updates during my employment, if hired`,
        ``,
        `Candidate Name (Print): _______________________________`,
        ``,
        `Signature: _______________________________  Date: ___________`,
        ``,
        `Date of Birth: ___________  (required for criminal search accuracy)`,
        ``,
        `SSN (last 4 digits): ___-___-___ ___ ___ ___  (required for identity trace)`,
        ``,
        `---`,
        `*Prepared: ${today}  |  Role: ${input.jobTitle}  |  Company: ${input.companyName}*`,
    ].filter(l => l !== '').join('\n');
}

function buildCandidateInviteEmail(input: BgcInitiateInput): string {
    const pkg = BGC_PACKAGES[input.bgcPackage];
    return [
        `Subject: Next Step — Background Check for ${input.jobTitle} at ${input.companyName}`,
        ``,
        `Hi ${input.candidateName},`,
        ``,
        `We're thrilled with how your interviews have progressed and we're moving forward with the next step in our process — a background check.`,
        ``,
        `**What to expect:**`,
        `- You will receive a separate invitation email from our background check provider`,
        `- Typical turnaround: ${pkg.typicalTurnaround}`,
        `- The check will include: ${pkg.checksIncluded.slice(0, 4).join(', ')}${pkg.checksIncluded.length > 4 ? ', and more' : ''}`,
        ``,
        `**Action required from you:**`,
        `1. Review and sign the enclosed Disclosure & Authorization form`,
        `2. Complete the online form from our BGC provider when you receive the invitation`,
        `3. Have your ID documents ready (government-issued photo ID + SSN)`,
        ``,
        `This is a standard step for all hires. The information is kept strictly confidential and handled in accordance with the FCRA and applicable privacy laws.`,
        ``,
        `If you have questions or concerns, please don't hesitate to reach out to me directly.`,
        ``,
        `Looking forward to the next steps!`,
        ``,
        `Best,`,
        `${input.recruiterName}`,
        `${input.recruiterEmail}`,
        `${input.companyName}`,
    ].join('\n');
}

function buildRecruiterChecklist(input: BgcInitiateInput): string {
    const pkg = BGC_PACKAGES[input.bgcPackage];
    return [
        `# BGC Initiation Checklist — ${input.candidateName} for ${input.jobTitle}`,
        ``,
        `**Package:** ${input.bgcPackage.toUpperCase()}  |  **Provider:** ${input.bgcProvider ?? 'TBD'}  |  **Turnaround:** ${pkg.typicalTurnaround}`,
        ``,
        `## Before Initiating`,
        `- [ ] Verbal offer extended and accepted by candidate`,
        `- [ ] FCRA Disclosure & Authorization form signed by candidate`,
        `- [ ] Candidate's consent on file (do NOT start BGC without signed auth)`,
        `- [ ] State-specific addendum attached (if required for ${input.stateOfHire ?? 'your state'})`,
        ``,
        `## Initiation Steps`,
        `- [ ] Log into ${input.bgcProvider ?? 'BGC provider'} portal`,
        `- [ ] Enter candidate details: full legal name, DOB, SSN, current address`,
        `- [ ] Select package: **${input.bgcPackage}**`,
        `- [ ] Upload signed Disclosure & Authorization`,
        `- [ ] Send candidate portal invitation`,
        `- [ ] Note BGC order reference number in ATS`,
        ``,
        `## Monitoring`,
        `- [ ] Check status daily after Day 3`,
        `- [ ] If flagged as "Consider" — review report with HR/Legal before deciding`,
        `- [ ] If "Adverse" — initiate adverse action process (see workspace_rec_initiate_bgc with actionType adverse_action)`,
        ``,
        `## Compliance Notes`,
        ...buildComplianceNotes(input).map(n => `- ${n}`),
        ``,
        `*Initiated by: ${input.recruiterName}  |  Date: ${new Date().toISOString().split('T')[0]}*`,
    ].join('\n');
}

function buildComplianceNotes(input: BgcInitiateInput): string[] {
    const notes: string[] = [
        'NEVER start a BGC without a signed Disclosure & Authorization form — FCRA violation',
        'The BGC must be conducted using a certified CRA — not informal searches',
        'Results may only be used for employment decisions — not shared outside hiring team',
        'Retain BGC records for minimum 5 years or duration of employment + 3 years, whichever is longer',
    ];

    if (input.bgcPackage === 'clinical') {
        notes.push('OIG exclusion check is legally required for any role billing Medicare/Medicaid');
        notes.push('Positive OIG match = automatic disqualification in federally-funded healthcare settings');
    }
    if (input.bgcPackage === 'financial') {
        notes.push('Credit check requires separate written consent in some states (CA, NY, IL, WA, MD, HI, OR, CT, VT)');
    }
    if (input.stateOfHire) {
        notes.push(`${input.stateOfHire}-specific addendum may be required — consult legal before initiating`);
    }
    if (input.countryOfHire && input.countryOfHire !== 'US') {
        notes.push(`Non-US hire: comply with ${input.countryOfHire} data protection laws (GDPR if EU/UK)`);
        notes.push('Candidate must provide separate consent per local regulations');
    }

    return notes;
}

// ---------------------------------------------------------------------------
// Adverse action builder
// ---------------------------------------------------------------------------

function buildAdverseActionLetter(input: AdverseActionInput): string {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const isPre = input.actionType === 'pre_adverse';

    return [
        `${today}`,
        ``,
        `${input.candidateName}`,
        input.candidateAddress ? input.candidateAddress : '[Candidate Address]',
        ``,
        `Re: ${isPre ? 'Pre-Adverse Action Notice' : 'Notice of Adverse Action'} — ${input.jobTitle}`,
        ``,
        `Dear ${input.candidateName},`,
        ``,
        isPre
            ? `We are writing to inform you that we may take adverse action with respect to your application for the position of **${input.jobTitle}** at **${input.companyName}**. This decision is based in whole or in part on information contained in a consumer report obtained from:`
            : `We are writing to inform you that we have decided not to extend an offer of employment for the position of **${input.jobTitle}** at **${input.companyName}**. This decision was based in whole or in part on information obtained from a consumer report provided by:`,
        ``,
        `**${input.bgcProviderName}**`,
        `${input.bgcProviderContact}`,
        ``,
        `The information that formed the basis of this ${isPre ? 'potential' : ''} adverse action includes:`,
        ...input.adverseFindings.map(f => `  • ${f}`),
        ``,
        isPre
            ? [
                `You have the right to dispute the accuracy or completeness of any information in your consumer report by contacting the CRA above directly.`,
                ``,
                `We will wait a minimum of **5 business days** from the date of this notice before taking final adverse action, to give you the opportunity to dispute any inaccurate information.`,
                ``,
                `Please contact us within that time if you believe any information in your report is inaccurate or incomplete.`,
            ].join('\n')
            : [
                `You have the following rights under the Fair Credit Reporting Act (FCRA):`,
                `• You have the right to obtain a free copy of your consumer report from the CRA within 60 days of this notice`,
                `• You have the right to dispute inaccurate or incomplete information in your report`,
                `• The CRA did not make the adverse hiring decision and cannot explain why the decision was made`,
            ].join('\n'),
        ``,
        `Sincerely,`,
        ``,
        `${input.hrSignatoryName ?? '[HR Representative]'}`,
        `${input.companyName}`,
    ].filter(l => l !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initiateBgcWorkflow(input: BgcInitiateInput): BgcInitiationResult {
    const countryUpper = (input.countryOfHire ?? 'US').toUpperCase();
    const isUk = countryUpper === 'UK' || countryUpper === 'GB';
    const isUs = countryUpper === 'US';

    // Infer DBS level from package if not explicitly set (UK only)
    let dbsLevel: DbsLevel | undefined = input.dbsLevel;
    if (isUk && !dbsLevel) {
        if (input.bgcPackage === 'clinical' || input.bgcPackage === 'federal_government') {
            dbsLevel = 'enhanced_barred_list';
        } else if (input.bgcPackage === 'enhanced' || input.bgcPackage === 'executive') {
            dbsLevel = 'enhanced';
        } else if (input.bgcPackage === 'financial') {
            dbsLevel = 'standard';
        } else {
            dbsLevel = 'basic';
        }
    }

    // Build international BGC note for non-US countries
    const internationalNotes = !isUs
        ? buildInternationalBgcNote(countryUpper)
        : undefined;

    return {
        candidateName: input.candidateName,
        jobTitle: input.jobTitle,
        bgcPackage: input.bgcPackage,
        bgcProvider: input.bgcProvider ?? 'generic',
        disclosureAndAuthDocument: buildDisclosureAuth(input),
        candidateInviteEmail: buildCandidateInviteEmail(input),
        recruiterChecklistEmail: buildRecruiterChecklist(input),
        packageDetails: BGC_PACKAGES[input.bgcPackage]!,
        complianceNotes: buildComplianceNotes(input),
        internationalNotes,
        ukDbsGuidance: isUk && dbsLevel ? buildUkDbsGuidance(dbsLevel, input.jobTitle, input.companyName) : undefined,
    };
}

export function buildAdverseAction(input: AdverseActionInput): AdverseActionResult {
    const letterText = buildAdverseActionLetter(input);
    const isPre = input.actionType === 'pre_adverse';

    return {
        actionType: input.actionType,
        letterText,
        requiredEnclosures: [
            'Copy of the consumer report (BGC result)',
            '"A Summary of Your Rights Under the FCRA" (FTC publication)',
            isPre ? '' : 'Copy of original pre-adverse notice',
        ].filter(Boolean),
        deliveryMethod: 'Send via certified mail AND email for dual documentation',
        complianceDeadline: isPre
            ? 'Allow minimum 5 business days before sending final adverse action'
            : 'Send immediately once 5-day waiting period has elapsed',
        nextSteps: isPre
            ? [
                'Send this pre-adverse notice to candidate via certified mail + email',
                'Log date sent in ATS',
                'Wait 5 business days for candidate response',
                'If no dispute received, send final adverse action notice',
                'If dispute received, forward to BGC provider and pause hiring decision',
            ]
            : [
                'Send final adverse action notice to candidate',
                'Update ATS status to Rejected',
                'Retain all BGC records for 5 years minimum',
                'Do not disclose specific BGC findings to third parties',
                'Consult legal if candidate files a dispute or complaint',
            ],
    };
}
