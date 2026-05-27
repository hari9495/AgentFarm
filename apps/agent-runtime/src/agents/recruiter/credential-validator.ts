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

    // ── Transportation / Logistics ───────────────────────────────────────────
    { id: 'cdl_a', name: 'CDL Class A', aliases: ['cdl a', 'cdl-a', 'class a cdl', 'commercial driver license class a', 'class a commercial driver'], category: 'trades_certification', industries: ['logistics_supply_chain', 'manufacturing'], isLicenseRequired: true, issuer: 'State DMV / FMCSA', renewalRequired: true, notes: 'Required for tractor-trailer / 18-wheel operation' },
    { id: 'cdl_b', name: 'CDL Class B', aliases: ['cdl b', 'cdl-b', 'class b cdl', 'commercial driver license class b', 'class b commercial driver'], category: 'trades_certification', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'State DMV / FMCSA', renewalRequired: true, notes: 'Required for straight trucks, city buses, school buses' },
    { id: 'cdl_c', name: 'CDL Class C', aliases: ['cdl c', 'cdl-c', 'class c cdl', 'commercial driver license class c', 'hazmat cdl', 'passenger endorsement'], category: 'trades_certification', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'State DMV / FMCSA', renewalRequired: true },
    { id: 'twic', name: 'TWIC Card', aliases: ['twic', 'transportation worker identification credential', 'twic card'], category: 'security_clearance', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'TSA / USCG', renewalRequired: true, notes: 'Required for unescorted access to secure maritime facilities' },
    { id: 'uscg_mmc', name: 'USCG Merchant Mariner Credential', aliases: ['mmc', 'merchant mariner credential', 'merchant mariner', 'uscg license', 'uscg mmc', 'mariner license'], category: 'trades_certification', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'US Coast Guard', renewalRequired: true },

    // ── Real Estate ──────────────────────────────────────────────────────────
    { id: 're_broker', name: 'Real Estate Broker License', aliases: ['real estate broker', 'broker license', 'licensed broker', 'real estate broker license', 'managing broker', 'responsible broker'], category: 'trades_certification', industries: ['real_estate'], isLicenseRequired: true, issuer: 'State Real Estate Commission', renewalRequired: true },
    { id: 're_agent', name: 'Real Estate Agent / Salesperson License', aliases: ['real estate agent', 'real estate license', 'real estate salesperson', 'licensed realtor', 'realtor', 'real estate salesperson license', 're license', 'licensed real estate agent'], category: 'trades_certification', industries: ['real_estate'], isLicenseRequired: true, issuer: 'State Real Estate Commission', renewalRequired: true },
    { id: 'nmls', name: 'NMLS License (Mortgage)', aliases: ['nmls', 'safe act license', 'mortgage loan originator', 'mlo license', 'nmls license', 'licensed mortgage originator'], category: 'finance_certification', industries: ['real_estate', 'finance'], isLicenseRequired: true, issuer: 'NMLS / State', renewalRequired: true, notes: 'Required for mortgage loan origination under the SAFE Act' },

    // ── Veterinary / Animal Health ───────────────────────────────────────────
    { id: 'dvm', name: 'Doctor of Veterinary Medicine', aliases: ['dvm', 'd.v.m.', 'vmd', 'v.m.d.', 'veterinarian', 'vet license', 'licensed veterinarian', 'doctor of veterinary medicine'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Veterinary Board', renewalRequired: true },

    // ── Dental ───────────────────────────────────────────────────────────────
    { id: 'dds', name: 'Doctor of Dental Surgery / Dental Medicine', aliases: ['dds', 'd.d.s.', 'dmd', 'd.m.d.', 'dentist', 'dental license', 'licensed dentist', 'doctor of dental surgery', 'doctor of dental medicine'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Dental Board', renewalRequired: true },
    { id: 'rdh', name: 'Registered Dental Hygienist', aliases: ['rdh', 'registered dental hygienist', 'dental hygienist', 'dental hygiene license'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Dental Board', renewalRequired: true },

    // ── Optometry ────────────────────────────────────────────────────────────
    { id: 'od', name: 'Doctor of Optometry', aliases: ['od', 'o.d.', 'optometrist', 'optometry license', 'doctor of optometry', 'licensed optometrist'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Board of Optometry', renewalRequired: true },

    // ── Architecture ─────────────────────────────────────────────────────────
    { id: 'ra_aia', name: 'Registered Architect (RA/AIA)', aliases: ['ra', 'r.a.', 'registered architect', 'licensed architect', 'aia', 'american institute of architects', 'ncarb', 'are exam', 'architect license'], category: 'engineering_license', industries: ['engineering_non_software'], isLicenseRequired: true, issuer: 'State Architecture Board / NCARB', renewalRequired: true },

    // ── Aviation ─────────────────────────────────────────────────────────────
    { id: 'faa_atp', name: 'FAA Airline Transport Pilot Certificate', aliases: ['atp', 'airline transport pilot', 'faa atp', 'atp certificate', 'part 121 captain', 'atp rating'], category: 'trades_certification', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'FAA', renewalRequired: true },
    { id: 'faa_commercial', name: 'FAA Commercial Pilot Certificate', aliases: ['commercial pilot', 'commercial pilot license', 'cpl', 'commercial pilot certificate', 'faa commercial'], category: 'trades_certification', industries: ['logistics_supply_chain'], isLicenseRequired: true, issuer: 'FAA', renewalRequired: true },
    { id: 'faa_ap', name: 'FAA Airframe & Powerplant (A&P) Certificate', aliases: ['a&p', 'a&p mechanic', 'airframe and powerplant', 'faa a&p', 'ap mechanic', 'aviation mechanic', 'a&p certificate'], category: 'trades_certification', industries: ['manufacturing', 'logistics_supply_chain'], isLicenseRequired: true, issuer: 'FAA', renewalRequired: false },

    // ── Mental Health / Counseling ───────────────────────────────────────────
    { id: 'lmft', name: 'Licensed Marriage & Family Therapist', aliases: ['lmft', 'licensed marriage and family therapist', 'marriage and family therapist', 'mft', 'licensed mft'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Board of Behavioral Sciences', renewalRequired: true },
    { id: 'lpc', name: 'Licensed Professional Counselor', aliases: ['lpc', 'lpcc', 'lcpc', 'licensed professional counselor', 'licensed clinical professional counselor', 'professional counselor', 'licensed counselor'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Counseling Board', renewalRequired: true },
    { id: 'ladc', name: 'Licensed Alcohol & Drug Counselor', aliases: ['ladc', 'cadc', 'cdac', 'substance abuse counselor', 'addiction counselor', 'licensed alcohol drug counselor', 'certified substance abuse'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'State Substance Abuse Agency', renewalRequired: true },

    // ── Speech-Language Pathology ─────────────────────────────────────────────
    { id: 'ccc_slp', name: 'Certificate of Clinical Competence — SLP', aliases: ['ccc-slp', 'ccc slp', 'slp', 'speech-language pathologist', 'speech language pathologist', 'speech therapist', 'slp-ccc', 'asha ccc'], category: 'healthcare_license', industries: ['healthcare', 'education'], isLicenseRequired: true, issuer: 'ASHA', renewalRequired: true },

    // ── Emergency Medicine / Paramedicine ────────────────────────────────────
    { id: 'emt', name: 'Emergency Medical Technician (EMT)', aliases: ['emt', 'emt-b', 'emt basic', 'emergency medical technician', 'nremt', 'national registry emt'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'NREMT / State EMS Agency', renewalRequired: true },
    { id: 'paramedic', name: 'Paramedic License', aliases: ['paramedic', 'emt-p', 'nremt-p', 'licensed paramedic', 'advanced life support', 'als provider'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: true, issuer: 'NREMT / State EMS Agency', renewalRequired: true },
    { id: 'nrp', name: 'Neonatal Resuscitation Program', aliases: ['nrp', 'neonatal resuscitation', 'nrp certified'], category: 'healthcare_license', industries: ['healthcare'], isLicenseRequired: false, renewalRequired: true },

    // ── Care Management / Behavioral Health ──────────────────────────────────
    { id: 'ccm', name: 'Certified Case Manager', aliases: ['ccm', 'certified case manager', 'case management certification', 'cmsa', 'ancc case management'], category: 'general_professional', industries: ['healthcare'], isLicenseRequired: false, issuer: 'CCMC', renewalRequired: true },
    { id: 'bcba', name: 'Board Certified Behavior Analyst', aliases: ['bcba', 'board certified behavior analyst', 'applied behavior analysis', 'aba therapist', 'bcba certified', 'bcba-d'], category: 'healthcare_license', industries: ['healthcare', 'education'], isLicenseRequired: true, issuer: 'BACB', renewalRequired: true },

    // ── Insurance ────────────────────────────────────────────────────────────
    { id: 'pc_license', name: 'Property & Casualty Insurance License', aliases: ['p&c license', 'property casualty license', 'p&c agent', 'property and casualty', 'insurance license', 'licensed insurance agent'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: true, issuer: 'State Department of Insurance', renewalRequired: true },
    { id: 'lh_license', name: 'Life & Health Insurance License', aliases: ['life and health license', 'l&h license', 'life health insurance', 'health insurance license', 'life insurance license'], category: 'finance_certification', industries: ['finance'], isLicenseRequired: true, issuer: 'State Department of Insurance', renewalRequired: true },

    // ── IT Infrastructure & Service Management ───────────────────────────────
    { id: 'itil', name: 'ITIL Certification', aliases: ['itil', 'itil v4', 'itil 4', 'itil foundation', 'itil practitioner', 'itil expert'], category: 'technology_certification', industries: ['technology', 'consulting'], isLicenseRequired: false, issuer: 'Axelos', renewalRequired: false },
    { id: 'salesforce_admin', name: 'Salesforce Administrator', aliases: ['salesforce administrator', 'salesforce admin', 'salesforce certified administrator', 'sfdc admin', 'salesforce cert'], category: 'technology_certification', industries: ['technology', 'sales_bizdev'], isLicenseRequired: false, issuer: 'Salesforce', renewalRequired: true },
    { id: 'comptia_aplus', name: 'CompTIA A+', aliases: ['comptia a+', 'a+ certification', 'comptia a plus', 'a+ certified'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'CompTIA', renewalRequired: true },
    { id: 'comptia_net', name: 'CompTIA Network+', aliases: ['network+', 'comptia network+', 'network plus', 'comptia network plus'], category: 'technology_certification', industries: ['technology'], isLicenseRequired: false, issuer: 'CompTIA', renewalRequired: true },
    { id: 'notary', name: 'Notary Public Commission', aliases: ['notary public', 'notary', 'commissioned notary', 'notary commission'], category: 'general_professional', industries: ['legal', 'real_estate', 'finance'], isLicenseRequired: false, issuer: 'State Secretary of State', renewalRequired: true },
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

    // Healthcare — clinical
    if (/\brn\b|registered nurse/.test(lower)) required.push('rn', 'bls');
    if (/\bnp\b|nurse practitioner/.test(lower)) required.push('np', 'bls');
    if (/\blpn\b|\blvn\b|licensed practical nurse|licensed vocational nurse/.test(lower)) required.push('lpn', 'bls');
    if (/\bpa[-\s]?c\b|physician assistant/.test(lower)) required.push('pa_c', 'bls');
    if (/physician|doctor|surgeon|\bmd\b|\bdo\b/.test(lower)) required.push('md', 'bls');
    if (/pharmacist|\bpharmd\b/.test(lower)) required.push('pharmd');
    if (/physical therapist|\bpt\b|\bdpt\b/.test(lower)) required.push('pt');
    if (/occupational therapist|\bot\b/.test(lower)) required.push('ot');
    if (/respiratory therapist/.test(lower)) required.push('rt');
    if (/\bcna\b|nursing assistant/.test(lower)) required.push('cna', 'bls');
    if (/social worker/.test(lower)) required.push('lcsw');
    // Healthcare — dental
    if (/dentist|\bdds\b|\bdmd\b/.test(lower)) required.push('dds');
    if (/dental hygienist/.test(lower)) required.push('rdh');
    // Healthcare — optometry
    if (/optometrist|\bod\b|optometry/.test(lower)) required.push('od');
    // Healthcare — veterinary
    if (/veterinarian|\bdvm\b|\bvmd\b|vet doctor/.test(lower)) required.push('dvm');
    // Healthcare — mental health / counseling
    if (/marriage.*family.*therapist|\blmft\b/.test(lower)) required.push('lmft');
    if (/\blpc\b|\blpcc\b|\blcpc\b|licensed.*counselor|professional counselor/.test(lower)) required.push('lpc');
    if (/substance abuse counselor|addiction counselor|\bladc\b|\bcadc\b/.test(lower)) required.push('ladc');
    // Healthcare — SLP
    if (/speech.language pathologist|\bslp\b|speech therapist/.test(lower)) required.push('ccc_slp');
    // Healthcare — emergency
    if (/\bemt\b|emergency medical technician/.test(lower) && !/paramedic/.test(lower)) required.push('emt');
    if (/paramedic|\bemt-p\b/.test(lower)) required.push('paramedic', 'emt');
    // Healthcare — behavioral
    if (/\bbcba\b|behavior analyst|applied behavior analysis/.test(lower)) required.push('bcba');
    // Healthcare — case management
    if (/case manager|care manager/.test(lower) && /healthcare|clinical|medical/.test(lower + ' ' + industry)) required.push('ccm');

    // Legal
    if (/attorney|lawyer|counsel|associate/.test(lower) && industry === 'legal') required.push('jd', 'bar');
    if (/paralegal/.test(lower)) required.push('jd'); // JD not always required but useful

    // Finance
    if (/broker|financial advisor|investment advisor/.test(lower)) required.push('series7', 'series63');
    if (/accountant|cpa/.test(lower)) required.push('cpa');
    if (/risk manager|risk analyst/.test(lower)) required.push('frm');
    if (/internal auditor/.test(lower)) required.push('cia');
    if (/mortgage.*originator|loan originator|\bnmls\b/.test(lower)) required.push('nmls');
    if (/insurance agent|insurance broker|insurance.*license/.test(lower)) {
        if (/life|health/.test(lower)) required.push('lh_license');
        else if (/property|casualty|p&c/.test(lower)) required.push('pc_license');
        else required.push('pc_license', 'lh_license'); // require both if ambiguous
    }

    // Education
    if (/teacher|educator|instructor/.test(lower) && !/corporate|corporate trainer/.test(lower)) required.push('teaching_license');
    if (/speech.*language.*school|slp.*school|school.*slp/.test(lower)) required.push('ccc_slp', 'teaching_license');

    // Engineering
    if (/\bpe\b|professional engineer|civil engineer|structural engineer/.test(lower)) required.push('pe');
    // Architecture
    if (/\barchitect\b|\bra\b|licensed architect/.test(lower) && !/software architect|solution architect|enterprise architect|cloud architect|data architect|it architect/.test(lower)) required.push('ra_aia');

    // Aviation
    if (/airline.*pilot|atp.*pilot|\bpilot\b.*captain|commercial.*pilot/.test(lower)) required.push('faa_atp');
    if (/commercial pilot/.test(lower) && !/airline/.test(lower)) required.push('faa_commercial');
    if (/a&p mechanic|airframe.*powerplant|aviation mechanic/.test(lower)) required.push('faa_ap');

    // Transportation / Logistics
    if (/\btruck driver\b|cdl.*driver|commercial.*driver|semi.*driver|tractor.*trailer|18.wheel/.test(lower)) required.push('cdl_a');
    if (/bus driver|delivery driver.*\bcdl\b|straight truck/.test(lower)) required.push('cdl_b');
    if (/maritime|port.*access|marine.*terminal|\btwic\b/.test(lower)) required.push('twic');
    if (/merchant marine|marine officer|uscg.*mariner|maritime.*officer/.test(lower)) required.push('uscg_mmc');

    // Real Estate
    if (/real estate broker|managing broker/.test(lower)) required.push('re_broker');
    if (/real estate agent|leasing agent|realtor|real estate salesperson/.test(lower)) required.push('re_agent');

    // Government / Security
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
