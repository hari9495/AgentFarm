/**
 * Industry Salary Bands
 *
 * Cross-industry, cross-seniority salary benchmarks (annual, USD base).
 * Covers: Technology, Healthcare, Finance & Legal, Manufacturing & Engineering,
 * Retail & Hospitality, Education, Government & Nonprofit, Creative & Media,
 * Consulting & Professional Services, Sales & Business Development.
 *
 * Data modelled on BLS Occupational Employment Statistics, Radford,
 * Mercer, Levels.fyi, Glassdoor, and LinkedIn Salary Insights 2024.
 * Always validate against a live source before making an offer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Industry =
    | 'technology'
    | 'healthcare'
    | 'finance'
    | 'legal'
    | 'manufacturing'
    | 'engineering_non_software'
    | 'retail'
    | 'hospitality'
    | 'education'
    | 'government'
    | 'nonprofit'
    | 'creative_media'
    | 'consulting'
    | 'sales_bizdev'
    | 'logistics_supply_chain'
    | 'real_estate'
    | 'pharmaceutical_biotech'
    | 'agriculture'
    | 'aviation'
    | 'utilities_energy'
    | 'telecommunications'
    | 'insurance'
    | 'mining_extractive';

export type SeniorityBand =
    | 'entry'
    | 'mid'
    | 'senior'
    | 'lead'
    | 'principal'
    | 'director'
    | 'vp'
    | 'c_level';

export interface SalaryRange {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
}

export interface IndustrySalaryBand {
    industry: Industry;
    seniority: SeniorityBand;
    range: SalaryRange;
    exampleRoles: string[];
    currency: string;
    notes: string;
}

// ---------------------------------------------------------------------------
// Salary tables (USD annual base, national average US)
// ---------------------------------------------------------------------------

const BANDS: Record<Industry, Record<SeniorityBand, SalaryRange & { exampleRoles: string[]; notes: string }>> = {

    technology: {
        entry:     { p25: 75_000,  p50: 90_000,  p75: 110_000, p90: 130_000, exampleRoles: ['Junior Software Engineer', 'Associate PM', 'QA Analyst I'], notes: 'Typical for CS new grad; higher in SF/NYC' },
        mid:       { p25: 105_000, p50: 130_000, p75: 155_000, p90: 180_000, exampleRoles: ['Software Engineer II', 'Product Manager', 'Data Analyst'], notes: '2–5 yrs experience' },
        senior:    { p25: 145_000, p50: 180_000, p75: 215_000, p90: 260_000, exampleRoles: ['Senior SWE', 'Senior PM', 'Staff Data Scientist'], notes: 'Includes equity; cash comp often lower' },
        lead:      { p25: 175_000, p50: 215_000, p75: 255_000, p90: 310_000, exampleRoles: ['Tech Lead', 'Engineering Manager', 'Principal Engineer'], notes: 'People management or technical track' },
        principal: { p25: 205_000, p50: 255_000, p75: 305_000, p90: 370_000, exampleRoles: ['Principal Engineer', 'Distinguished Engineer', 'Staff PM'], notes: 'FAANG L6–L7 equivalent' },
        director:  { p25: 220_000, p50: 275_000, p75: 335_000, p90: 410_000, exampleRoles: ['Engineering Director', 'Director of Product', 'Director of DS'], notes: 'Manages multiple teams' },
        vp:        { p25: 270_000, p50: 340_000, p75: 420_000, p90: 510_000, exampleRoles: ['VP Engineering', 'VP Product', 'VP Data'], notes: 'Typically includes significant equity' },
        c_level:   { p25: 350_000, p50: 480_000, p75: 650_000, p90: 900_000, exampleRoles: ['CTO', 'CPO', 'CISO', 'CDO'], notes: 'Total comp varies widely with equity' },
    },

    healthcare: {
        entry:     { p25: 38_000,  p50: 48_000,  p75: 58_000,  p90: 70_000,  exampleRoles: ['Medical Assistant', 'CNA', 'Patient Coordinator'], notes: 'Hourly roles; annualised at 40hrs/wk' },
        mid:       { p25: 62_000,  p50: 78_000,  p75: 95_000,  p90: 115_000, exampleRoles: ['Registered Nurse (RN)', 'Physical Therapist', 'Radiologic Technologist'], notes: 'BSN typically required for RN roles' },
        senior:    { p25: 90_000,  p50: 115_000, p75: 140_000, p90: 170_000, exampleRoles: ['Nurse Practitioner (NP)', 'PA-C', 'Clinical Specialist', 'Senior Pharmacist'], notes: 'Master\'s/doctoral credential typically required' },
        lead:      { p25: 115_000, p50: 145_000, p75: 180_000, p90: 220_000, exampleRoles: ['Charge Nurse', 'Clinical Manager', 'Lead Pharmacist'], notes: 'Supervisory clinical role' },
        principal: { p25: 160_000, p50: 200_000, p75: 245_000, p90: 300_000, exampleRoles: ['Physician (GP)', 'Dentist', 'Optometrist', 'Podiatrist'], notes: 'MD/DO/DDS; varies by specialty and setting' },
        director:  { p25: 145_000, p50: 185_000, p75: 230_000, p90: 285_000, exampleRoles: ['Director of Nursing', 'Medical Director', 'Director of Pharmacy'], notes: 'Clinical + administrative leadership' },
        vp:        { p25: 195_000, p50: 250_000, p75: 315_000, p90: 390_000, exampleRoles: ['VP Clinical Operations', 'Chief Nursing Officer (CNO)', 'VP Medical Affairs'], notes: 'Executive clinical leadership' },
        c_level:   { p25: 300_000, p50: 430_000, p75: 590_000, p90: 800_000, exampleRoles: ['CMO', 'CEO (Hospital)', 'CFO (Health System)'], notes: 'Significant variation by system size' },
    },

    finance: {
        entry:     { p25: 65_000,  p50: 80_000,  p75: 98_000,  p90: 120_000, exampleRoles: ['Financial Analyst I', 'Junior Accountant', 'Audit Associate'], notes: 'CPA/CFA pursuit typical; Big 4 entry ~$75k' },
        mid:       { p25: 90_000,  p50: 115_000, p75: 145_000, p90: 185_000, exampleRoles: ['Senior Financial Analyst', 'CPA', 'Investment Banking Associate'], notes: 'IB Associates earn significantly more with bonus' },
        senior:    { p25: 120_000, p50: 155_000, p75: 200_000, p90: 260_000, exampleRoles: ['Senior Accountant', 'Portfolio Manager', 'VP IBD'], notes: 'Bonus can 1–3× base in banking/PE' },
        lead:      { p25: 155_000, p50: 205_000, p75: 265_000, p90: 340_000, exampleRoles: ['Manager Finance', 'Associate Director FP&A', 'Senior Portfolio Manager'], notes: 'Discretionary bonus is significant component' },
        principal: { p25: 195_000, p50: 260_000, p75: 340_000, p90: 440_000, exampleRoles: ['Principal/Senior PM (PE)', 'Managing Director (Banking)', 'Chief Investment Officer'], notes: 'Carry and profit-share common in PE/HF' },
        director:  { p25: 210_000, p50: 280_000, p75: 370_000, p90: 480_000, exampleRoles: ['Finance Director', 'Director of Treasury', 'Director Risk Management'], notes: 'Base + bonus total compensation reported' },
        vp:        { p25: 270_000, p50: 360_000, p75: 470_000, p90: 600_000, exampleRoles: ['VP Finance', 'VP Investments', 'SVP Risk'], notes: 'Total comp including bonus' },
        c_level:   { p25: 400_000, p50: 580_000, p75: 800_000, p90: 1_200_000, exampleRoles: ['CFO', 'CEO (Bank)', 'CRO'], notes: 'Equity and deferred compensation large component' },
    },

    legal: {
        entry:     { p25: 70_000,  p50: 90_000,  p75: 115_000, p90: 160_000, exampleRoles: ['Paralegal', 'Junior Associate (BigLaw)', 'Legal Assistant'], notes: 'BigLaw first-year associate ~$215k+ in major markets' },
        mid:       { p25: 110_000, p50: 145_000, p75: 195_000, p90: 260_000, exampleRoles: ['Associate Attorney', 'Senior Paralegal', 'Legal Counsel'], notes: 'JD required for attorney roles; bar admission required' },
        senior:    { p25: 155_000, p50: 210_000, p75: 275_000, p90: 355_000, exampleRoles: ['Senior Associate', 'Senior Corporate Counsel', 'IP Counsel'], notes: '5–8 yrs PQE typical' },
        lead:      { p25: 195_000, p50: 265_000, p75: 350_000, p90: 450_000, exampleRoles: ['Of Counsel', 'Senior Legal Manager', 'Associate GC'], notes: 'Non-equity leadership track' },
        principal: { p25: 250_000, p50: 345_000, p75: 460_000, p90: 600_000, exampleRoles: ['Junior Partner (BigLaw)', 'Deputy GC', 'Chief Compliance Officer'], notes: 'Partnership track; includes origination credit' },
        director:  { p25: 285_000, p50: 390_000, p75: 520_000, p90: 680_000, exampleRoles: ['Partner (Mid-law)', 'Director of Legal', 'Senior CCO'], notes: 'Equity partner compensation varies widely' },
        vp:        { p25: 320_000, p50: 440_000, p75: 590_000, p90: 780_000, exampleRoles: ['VP Legal', 'SVP Legal Affairs', 'Deputy GC (Enterprise)'], notes: 'In-house enterprise senior legal leadership' },
        c_level:   { p25: 400_000, p50: 580_000, p75: 800_000, p90: 1_100_000, exampleRoles: ['General Counsel', 'CLO', 'Managing Partner (BigLaw)'], notes: 'Managing partner can earn $5M+ via book of business' },
    },

    manufacturing: {
        entry:     { p25: 38_000,  p50: 48_000,  p75: 58_000,  p90: 68_000,  exampleRoles: ['Production Operator', 'Quality Inspector', 'Material Handler'], notes: 'Hourly; union rates may be higher' },
        mid:       { p25: 55_000,  p50: 68_000,  p75: 82_000,  p90: 98_000,  exampleRoles: ['CNC Machinist', 'Production Supervisor', 'Quality Technician'], notes: 'Trade certifications valued' },
        senior:    { p25: 72_000,  p50: 90_000,  p75: 110_000, p90: 132_000, exampleRoles: ['Plant Manager', 'Senior Quality Engineer', 'Senior Production Engineer'], notes: 'PE license a differentiator' },
        lead:      { p25: 90_000,  p50: 112_000, p75: 138_000, p90: 165_000, exampleRoles: ['Manufacturing Manager', 'Operations Manager', 'Lean / Six Sigma Lead'], notes: 'Black Belt / PMP a strong differentiator' },
        principal: { p25: 110_000, p50: 140_000, p75: 172_000, p90: 210_000, exampleRoles: ['Principal Manufacturing Engineer', 'VP Operations (smaller co.)'], notes: '' },
        director:  { p25: 140_000, p50: 175_000, p75: 215_000, p90: 265_000, exampleRoles: ['Director of Manufacturing', 'Director of Operations', 'Director Quality'], notes: '' },
        vp:        { p25: 185_000, p50: 235_000, p75: 290_000, p90: 360_000, exampleRoles: ['VP Manufacturing', 'VP Operations', 'VP Supply Chain'], notes: '' },
        c_level:   { p25: 270_000, p50: 370_000, p75: 490_000, p90: 650_000, exampleRoles: ['COO', 'CEO (Mid-size Manufacturer)', 'Chief Manufacturing Officer'], notes: '' },
    },

    engineering_non_software: {
        entry:     { p25: 58_000,  p50: 70_000,  p75: 84_000,  p90: 100_000, exampleRoles: ['Civil Engineer EIT', 'Mechanical Engineer I', 'Electrical Engineer I'], notes: 'EIT (Engineer in Training) typical; PE required later' },
        mid:       { p25: 80_000,  p50: 98_000,  p75: 118_000, p90: 140_000, exampleRoles: ['PE Civil', 'Structural Engineer', 'Electrical Engineer III'], notes: 'PE license typically 4+ yrs post-grad' },
        senior:    { p25: 102_000, p50: 128_000, p75: 155_000, p90: 188_000, exampleRoles: ['Senior Structural Engineer', 'Senior MEP Engineer', 'Senior Chemical Engineer'], notes: '' },
        lead:      { p25: 125_000, p50: 158_000, p75: 193_000, p90: 232_000, exampleRoles: ['Lead Engineer', 'Engineering Team Lead', 'Project Engineer (Lead)'], notes: '' },
        principal: { p25: 148_000, p50: 188_000, p75: 230_000, p90: 280_000, exampleRoles: ['Principal Engineer', 'Senior Project Engineer', 'Chief Engineer'], notes: '' },
        director:  { p25: 160_000, p50: 205_000, p75: 255_000, p90: 315_000, exampleRoles: ['Director of Engineering', 'Director of Infrastructure'], notes: '' },
        vp:        { p25: 205_000, p50: 260_000, p75: 325_000, p90: 405_000, exampleRoles: ['VP Engineering', 'VP Infrastructure', 'VP Technical Services'], notes: '' },
        c_level:   { p25: 280_000, p50: 375_000, p75: 490_000, p90: 640_000, exampleRoles: ['Chief Engineer', 'CTO (Infrastructure firm)', 'CEO (Engineering firm)'], notes: '' },
    },

    retail: {
        entry:     { p25: 28_000,  p50: 34_000,  p75: 40_000,  p90: 48_000,  exampleRoles: ['Sales Associate', 'Cashier', 'Stock Associate'], notes: 'Often minimum wage / hourly; locality law applies' },
        mid:       { p25: 42_000,  p50: 52_000,  p75: 63_000,  p90: 76_000,  exampleRoles: ['Department Manager', 'Shift Supervisor', 'Visual Merchandiser'], notes: '' },
        senior:    { p25: 58_000,  p50: 72_000,  p75: 88_000,  p90: 108_000, exampleRoles: ['Store Manager', 'Senior Buyer', 'Category Manager'], notes: '' },
        lead:      { p25: 75_000,  p50: 95_000,  p75: 118_000, p90: 145_000, exampleRoles: ['District Manager', 'Senior Category Manager', 'Regional Operations Lead'], notes: '' },
        principal: { p25: 100_000, p50: 128_000, p75: 158_000, p90: 195_000, exampleRoles: ['Regional Director', 'Head of Merchandising', 'Senior District Manager'], notes: '' },
        director:  { p25: 130_000, p50: 165_000, p75: 205_000, p90: 255_000, exampleRoles: ['Director of Retail Operations', 'Director of Buying', 'Director of E-commerce'], notes: '' },
        vp:        { p25: 185_000, p50: 238_000, p75: 298_000, p90: 375_000, exampleRoles: ['VP Retail', 'VP Merchandising', 'VP E-commerce'], notes: '' },
        c_level:   { p25: 290_000, p50: 415_000, p75: 575_000, p90: 800_000, exampleRoles: ['Chief Merchandising Officer', 'CEO (Retail chain)', 'COO'], notes: '' },
    },

    hospitality: {
        entry:     { p25: 26_000,  p50: 32_000,  p75: 39_000,  p90: 47_000,  exampleRoles: ['Front Desk Agent', 'Server', 'Housekeeper'], notes: 'Tips not included; vary widely' },
        mid:       { p25: 38_000,  p50: 48_000,  p75: 59_000,  p90: 72_000,  exampleRoles: ['Restaurant Manager', 'Front Office Manager', 'Events Coordinator'], notes: '' },
        senior:    { p25: 55_000,  p50: 70_000,  p75: 86_000,  p90: 105_000, exampleRoles: ['General Manager (Restaurant)', 'Senior Events Manager', 'Hotel Operations Manager'], notes: '' },
        lead:      { p25: 72_000,  p50: 92_000,  p75: 115_000, p90: 142_000, exampleRoles: ['Area Manager (F&B)', 'Hotel General Manager', 'Director of F&B'], notes: '' },
        principal: { p25: 95_000,  p50: 122_000, p75: 152_000, p90: 188_000, exampleRoles: ['Regional Manager', 'Senior Hotel GM', 'Corporate Chef'], notes: '' },
        director:  { p25: 118_000, p50: 152_000, p75: 192_000, p90: 242_000, exampleRoles: ['Director of Hospitality Operations', 'VP Food & Beverage'], notes: '' },
        vp:        { p25: 165_000, p50: 215_000, p75: 272_000, p90: 345_000, exampleRoles: ['VP Hospitality', 'VP Operations (Hotel chain)'], notes: '' },
        c_level:   { p25: 250_000, p50: 360_000, p75: 500_000, p90: 700_000, exampleRoles: ['CEO (Hotel chain)', 'COO', 'CMO (Hospitality)'], notes: '' },
    },

    education: {
        entry:     { p25: 32_000,  p50: 40_000,  p75: 48_000,  p90: 58_000,  exampleRoles: ['Teacher Assistant', 'Substitute Teacher', 'Tutor', 'Paraprofessional'], notes: 'State teaching license varies by state; background check always required' },
        mid:       { p25: 44_000,  p50: 56_000,  p75: 68_000,  p90: 82_000,  exampleRoles: ['K-12 Teacher', 'School Counselor', 'Instructional Designer'], notes: 'State licensure + background check required' },
        senior:    { p25: 60_000,  p50: 76_000,  p75: 92_000,  p90: 112_000, exampleRoles: ['Department Head', 'Senior Curriculum Developer', 'University Lecturer'], notes: 'Ed.D / PhD valued; tenure-track has specific pathway' },
        lead:      { p25: 78_000,  p50: 98_000,  p75: 120_000, p90: 148_000, exampleRoles: ['Assistant Principal', 'Dean of Students', 'Director of Curriculum'], notes: '' },
        principal: { p25: 95_000,  p50: 118_000, p75: 145_000, p90: 178_000, exampleRoles: ['School Principal', 'Associate Dean', 'Full Professor'], notes: '' },
        director:  { p25: 112_000, p50: 142_000, p75: 175_000, p90: 218_000, exampleRoles: ['Director of Education', 'Academic Dean', 'District Curriculum Director'], notes: '' },
        vp:        { p25: 145_000, p50: 185_000, p75: 232_000, p90: 290_000, exampleRoles: ['VP Academic Affairs', 'Provost (smaller institution)', 'Deputy Superintendent'], notes: '' },
        c_level:   { p25: 200_000, p50: 290_000, p75: 410_000, p90: 580_000, exampleRoles: ['University President', 'School Superintendent', 'Chief Academic Officer'], notes: '' },
    },

    government: {
        entry:     { p25: 36_000,  p50: 45_000,  p75: 55_000,  p90: 66_000,  exampleRoles: ['GS-5/7 Analyst', 'Administrative Assistant (Federal)', 'Entry-level Analyst'], notes: 'Federal GS scale; locality pay adds 15–30%' },
        mid:       { p25: 58_000,  p50: 72_000,  p75: 88_000,  p90: 105_000, exampleRoles: ['GS-11/12 Specialist', 'Policy Analyst', 'Contract Specialist'], notes: 'Security clearance adds 10–20% in private sector equivalent' },
        senior:    { p25: 80_000,  p50: 100_000, p75: 122_000, p90: 148_000, exampleRoles: ['GS-13/14 Manager', 'Senior Policy Advisor', 'Senior Intelligence Analyst'], notes: '' },
        lead:      { p25: 100_000, p50: 128_000, p75: 158_000, p90: 190_000, exampleRoles: ['GS-15 Branch Chief', 'Program Manager', 'Supervisory Analyst'], notes: '' },
        principal: { p25: 122_000, p50: 158_000, p75: 196_000, p90: 238_000, exampleRoles: ['SES Level 1–3', 'Deputy Director', 'Chief of Staff (Agency)'], notes: 'SES pay band $135k–$221k (2024)' },
        director:  { p25: 148_000, p50: 185_000, p75: 220_000, p90: 260_000, exampleRoles: ['Agency Director', 'Inspector General', 'Regional Administrator'], notes: '' },
        vp:        { p25: 175_000, p50: 210_000, p75: 245_000, p90: 280_000, exampleRoles: ['Deputy Secretary', 'Under Secretary', 'Senior SES'], notes: 'Executive Schedule caps apply' },
        c_level:   { p25: 210_000, p50: 235_000, p75: 258_000, p90: 280_000, exampleRoles: ['Secretary (Cabinet)', 'Agency Head', 'Inspector General'], notes: 'Executive Schedule Level I–V; capped by statute' },
    },

    nonprofit: {
        entry:     { p25: 32_000,  p50: 40_000,  p75: 48_000,  p90: 58_000,  exampleRoles: ['Program Assistant', 'Volunteer Coordinator', 'Development Assistant'], notes: '10–30% below private sector equivalent' },
        mid:       { p25: 50_000,  p50: 62_000,  p75: 76_000,  p90: 92_000,  exampleRoles: ['Program Manager', 'Grant Writer', 'Development Manager'], notes: '' },
        senior:    { p25: 68_000,  p50: 85_000,  p75: 105_000, p90: 128_000, exampleRoles: ['Senior Program Manager', 'Director of Development', 'Finance Director'], notes: '' },
        lead:      { p25: 85_000,  p50: 108_000, p75: 135_000, p90: 165_000, exampleRoles: ['Program Director', 'Senior Director of Development', 'VP Programs'], notes: '' },
        principal: { p25: 105_000, p50: 135_000, p75: 168_000, p90: 208_000, exampleRoles: ['Chief Program Officer', 'COO (Large Nonprofit)', 'Managing Director'], notes: '' },
        director:  { p25: 118_000, p50: 152_000, p75: 192_000, p90: 240_000, exampleRoles: ['Executive Director (mid-size)', 'Chief Development Officer'], notes: '' },
        vp:        { p25: 148_000, p50: 192_000, p75: 245_000, p90: 308_000, exampleRoles: ['VP External Affairs', 'SVP Programs', 'Chief Strategy Officer'], notes: '' },
        c_level:   { p25: 190_000, p50: 265_000, p75: 370_000, p90: 520_000, exampleRoles: ['CEO (Large Nonprofit)', 'President', 'Executive Director (Major)'], notes: 'Varies enormously by org budget' },
    },

    creative_media: {
        entry:     { p25: 38_000,  p50: 48_000,  p75: 58_000,  p90: 70_000,  exampleRoles: ['Junior Designer', 'Associate Producer', 'Editorial Assistant'], notes: 'Portfolio quality often more important than credentials' },
        mid:       { p25: 58_000,  p50: 72_000,  p75: 88_000,  p90: 108_000, exampleRoles: ['Graphic Designer', 'Video Producer', 'UX Designer', 'Copywriter'], notes: '' },
        senior:    { p25: 80_000,  p50: 100_000, p75: 122_000, p90: 150_000, exampleRoles: ['Senior Designer', 'Senior UX/UI', 'Senior Producer', 'Creative Director'], notes: '' },
        lead:      { p25: 100_000, p50: 128_000, p75: 158_000, p90: 195_000, exampleRoles: ['Lead Designer', 'Creative Director', 'Head of Content'], notes: '' },
        principal: { p25: 125_000, p50: 160_000, p75: 198_000, p90: 245_000, exampleRoles: ['Principal Designer', 'Executive Creative Director', 'Director of UX'], notes: '' },
        director:  { p25: 148_000, p50: 190_000, p75: 238_000, p90: 295_000, exampleRoles: ['Creative Director (Agency)', 'Director of Design', 'Director of Content'], notes: '' },
        vp:        { p25: 190_000, p50: 248_000, p75: 312_000, p90: 392_000, exampleRoles: ['VP Creative', 'VP Content', 'VP Design'], notes: '' },
        c_level:   { p25: 275_000, p50: 390_000, p75: 540_000, p90: 750_000, exampleRoles: ['Chief Creative Officer', 'Chief Content Officer', 'CMO (Media)'], notes: '' },
    },

    consulting: {
        entry:     { p25: 70_000,  p50: 88_000,  p75: 108_000, p90: 130_000, exampleRoles: ['Analyst (MBB)', 'Associate Consultant', 'Business Analyst'], notes: 'MBB analysts start ~$100k; boutiques lower' },
        mid:       { p25: 105_000, p50: 135_000, p75: 170_000, p90: 215_000, exampleRoles: ['Consultant', 'Senior Analyst', 'MBA Associate (MBB)'], notes: 'Performance bonus typically 20–30% of base' },
        senior:    { p25: 148_000, p50: 195_000, p75: 250_000, p90: 315_000, exampleRoles: ['Senior Consultant', 'Engagement Manager', 'Senior Manager'], notes: '' },
        lead:      { p25: 195_000, p50: 258_000, p75: 335_000, p90: 430_000, exampleRoles: ['Manager', 'Associate Principal', 'Project Leader'], notes: '' },
        principal: { p25: 260_000, p50: 350_000, p75: 460_000, p90: 600_000, exampleRoles: ['Associate Principal', 'Senior Manager', 'AP/Director'], notes: '' },
        director:  { p25: 330_000, p50: 450_000, p75: 600_000, p90: 800_000, exampleRoles: ['Director / Principal (MBB)', 'Senior Director'], notes: 'Partnership track gating' },
        vp:        { p25: 420_000, p50: 590_000, p75: 800_000, p90: 1_100_000, exampleRoles: ['Partner (MBB)', 'SVP / Partner (Big 4)'], notes: 'Book of business drives total comp' },
        c_level:   { p25: 600_000, p50: 900_000, p75: 1_300_000, p90: 2_000_000, exampleRoles: ['Senior Partner', 'Managing Partner (Regional)'], notes: 'Profit share and origination fees dominant' },
    },

    sales_bizdev: {
        entry:     { p25: 42_000,  p50: 52_000,  p75: 64_000,  p90: 80_000,  exampleRoles: ['SDR', 'BDR', 'Inside Sales Rep', 'Junior Account Executive'], notes: 'OTE typically 1.5–2× base; quota attainment matters' },
        mid:       { p25: 65_000,  p50: 82_000,  p75: 102_000, p90: 128_000, exampleRoles: ['Account Executive', 'Account Manager', 'Sales Engineer'], notes: 'OTE $120k–$180k typical for SaaS AE' },
        senior:    { p25: 90_000,  p50: 115_000, p75: 145_000, p90: 182_000, exampleRoles: ['Senior AE', 'Enterprise Sales Rep', 'Senior BizDev Manager'], notes: 'OTE $200k–$350k for enterprise SaaS' },
        lead:      { p25: 115_000, p50: 148_000, p75: 188_000, p90: 238_000, exampleRoles: ['Sales Team Lead', 'Senior Enterprise AE', 'Strategic Accounts Lead'], notes: '' },
        principal: { p25: 145_000, p50: 190_000, p75: 245_000, p90: 310_000, exampleRoles: ['Principal Sales Engineer', 'Head of Strategic Accounts', 'Global Account Director'], notes: '' },
        director:  { p25: 175_000, p50: 228_000, p75: 295_000, p90: 385_000, exampleRoles: ['Sales Director', 'Director of BizDev', 'RVP Sales'], notes: '' },
        vp:        { p25: 220_000, p50: 295_000, p75: 390_000, p90: 510_000, exampleRoles: ['VP Sales', 'VP Business Development', 'VP Revenue'], notes: '' },
        c_level:   { p25: 320_000, p50: 460_000, p75: 640_000, p90: 900_000, exampleRoles: ['CRO', 'Chief Sales Officer', 'CCO'], notes: '' },
    },

    logistics_supply_chain: {
        entry:     { p25: 38_000,  p50: 48_000,  p75: 58_000,  p90: 70_000,  exampleRoles: ['Logistics Coordinator', 'Supply Chain Analyst I', 'Warehouse Associate'], notes: '' },
        mid:       { p25: 58_000,  p50: 72_000,  p75: 88_000,  p90: 108_000, exampleRoles: ['Supply Chain Manager', 'Procurement Specialist', 'Logistics Manager'], notes: 'APICS / CSCMP certifications valued' },
        senior:    { p25: 78_000,  p50: 98_000,  p75: 120_000, p90: 148_000, exampleRoles: ['Senior SCM', 'Senior Procurement Manager', 'Distribution Center Manager'], notes: '' },
        lead:      { p25: 98_000,  p50: 125_000, p75: 155_000, p90: 192_000, exampleRoles: ['Supply Chain Lead', 'Head of Procurement', 'Regional Logistics Manager'], notes: '' },
        principal: { p25: 122_000, p50: 158_000, p75: 198_000, p90: 248_000, exampleRoles: ['Principal SCM', 'Global Supply Chain Lead'], notes: '' },
        director:  { p25: 148_000, p50: 192_000, p75: 242_000, p90: 305_000, exampleRoles: ['Director of Supply Chain', 'Director of Procurement', 'Director of Logistics'], notes: '' },
        vp:        { p25: 195_000, p50: 255_000, p75: 325_000, p90: 415_000, exampleRoles: ['VP Supply Chain', 'VP Logistics', 'VP Procurement'], notes: '' },
        c_level:   { p25: 280_000, p50: 390_000, p75: 530_000, p90: 720_000, exampleRoles: ['CSCO', 'COO (Logistics)', 'CEO (3PL)'], notes: '' },
    },

    real_estate: {
        entry:     { p25: 35_000,  p50: 45_000,  p75: 55_000,  p90: 68_000,  exampleRoles: ['Real Estate Assistant', 'Leasing Agent', 'Junior Analyst (REPE)'], notes: 'Licensed agents work on commission; salary roles are support' },
        mid:       { p25: 58_000,  p50: 75_000,  p75: 95_000,  p90: 120_000, exampleRoles: ['Property Manager', 'Real Estate Analyst', 'Commercial Leasing Agent'], notes: '' },
        senior:    { p25: 85_000,  p50: 112_000, p75: 145_000, p90: 185_000, exampleRoles: ['Senior RE Analyst', 'Acquisitions Manager', 'Senior Property Manager'], notes: '' },
        lead:      { p25: 115_000, p50: 150_000, p75: 192_000, p90: 245_000, exampleRoles: ['Portfolio Manager', 'Asset Manager', 'Development Manager'], notes: '' },
        principal: { p25: 150_000, p50: 200_000, p75: 258_000, p90: 328_000, exampleRoles: ['VP Acquisitions', 'Senior Asset Manager', 'Principal (REPE)'], notes: 'Carry and promote significant' },
        director:  { p25: 195_000, p50: 258_000, p75: 335_000, p90: 435_000, exampleRoles: ['Director of Real Estate', 'Director of Development', 'MD (REPE)'], notes: '' },
        vp:        { p25: 255_000, p50: 340_000, p75: 445_000, p90: 580_000, exampleRoles: ['VP Real Estate', 'SVP Development', 'Head of Acquisitions'], notes: '' },
        c_level:   { p25: 370_000, p50: 530_000, p75: 740_000, p90: 1_050_000, exampleRoles: ['CEO (REIT)', 'CIO (REPE Fund)', 'COO (Developer)'], notes: '' },
    },

    pharmaceutical_biotech: {
        entry:     { p25: 55_000,  p50: 68_000,  p75: 82_000,  p90: 98_000,  exampleRoles: ['Research Associate', 'QA Associate', 'Clinical Research Coordinator'], notes: 'B.Sc in life sciences typically required' },
        mid:       { p25: 82_000,  p50: 105_000, p75: 128_000, p90: 158_000, exampleRoles: ['Scientist', 'Clinical Research Associate', 'Regulatory Affairs Specialist'], notes: 'Ph.D can accelerate into senior directly' },
        senior:    { p25: 112_000, p50: 145_000, p75: 180_000, p90: 222_000, exampleRoles: ['Senior Scientist', 'Principal CRA', 'Senior Regulatory Affairs Manager'], notes: '' },
        lead:      { p25: 145_000, p50: 188_000, p75: 235_000, p90: 292_000, exampleRoles: ['Lead Scientist', 'Clinical Operations Manager', 'Head of Regulatory'], notes: '' },
        principal: { p25: 180_000, p50: 232_000, p75: 292_000, p90: 365_000, exampleRoles: ['Principal Scientist', 'Associate Director Clinical', 'Senior Director Regulatory'], notes: '' },
        director:  { p25: 215_000, p50: 278_000, p75: 355_000, p90: 450_000, exampleRoles: ['Director of R&D', 'Medical Director', 'Director Clinical Development'], notes: '' },
        vp:        { p25: 280_000, p50: 370_000, p75: 480_000, p90: 618_000, exampleRoles: ['VP R&D', 'VP Clinical Affairs', 'VP Medical Affairs'], notes: '' },
        c_level:   { p25: 410_000, p50: 600_000, p75: 840_000, p90: 1_200_000, exampleRoles: ['CSO', 'CMO', 'CEO (Biotech)'], notes: 'Significant equity in pre-IPO biotechs' },
    },

    agriculture: {
        entry:     { p25: 32_000,  p50: 40_000,  p75: 48_000,  p90: 58_000,  exampleRoles: ['Farm Worker', 'Agricultural Technician', 'Crop Scout'], notes: 'Seasonal work common; H-2A visa programme for migrant workers' },
        mid:       { p25: 48_000,  p50: 60_000,  p75: 74_000,  p90: 90_000,  exampleRoles: ['Agronomist', 'Farm Manager', 'Agricultural Sales Rep', 'Animal Scientist'], notes: 'B.Sc in agronomy, animal science, or horticulture typical' },
        senior:    { p25: 68_000,  p50: 85_000,  p75: 105_000, p90: 130_000, exampleRoles: ['Senior Agronomist', 'Regional Farm Manager', 'Agricultural Engineer'], notes: '' },
        lead:      { p25: 88_000,  p50: 110_000, p75: 138_000, p90: 170_000, exampleRoles: ['Director of Agronomy', 'Operations Manager (Ag)', 'Lead Agricultural Scientist'], notes: '' },
        principal: { p25: 110_000, p50: 140_000, p75: 175_000, p90: 215_000, exampleRoles: ['Principal Scientist (Seeds/Biotech)', 'VP Agronomy', 'Chief Agronomist'], notes: '' },
        director:  { p25: 130_000, p50: 168_000, p75: 210_000, p90: 260_000, exampleRoles: ['Director of Operations (Ag)', 'Director of Research (Crop Science)'], notes: '' },
        vp:        { p25: 165_000, p50: 215_000, p75: 272_000, p90: 345_000, exampleRoles: ['VP Agricultural Operations', 'VP R&D (Seed Company)', 'VP Supply Chain (Ag)'], notes: '' },
        c_level:   { p25: 250_000, p50: 360_000, p75: 510_000, p90: 720_000, exampleRoles: ['CEO (Ag Cooperative)', 'COO (Large Farming Enterprise)', 'CSO (Ag Biotech)'], notes: '' },
    },

    aviation: {
        entry:     { p25: 45_000,  p50: 58_000,  p75: 72_000,  p90: 88_000,  exampleRoles: ['First Officer (Regional)', 'Flight Dispatcher', 'Ramp Agent', 'A&P Mechanic I'], notes: 'Regional FOs start near ATP minimums (1,500 hours); salary increases sharply with seniority' },
        mid:       { p25: 90_000,  p50: 115_000, p75: 145_000, p90: 180_000, exampleRoles: ['Captain (Regional)', 'A&P Lead Mechanic', 'Flight Operations Manager', 'Avionics Technician'], notes: 'FAA A&P licence required for mechanics' },
        senior:    { p25: 155_000, p50: 200_000, p75: 250_000, p90: 310_000, exampleRoles: ['Captain (Mainline)', 'Senior A&P Inspector', 'Director of Maintenance'], notes: 'Major airline captains routinely exceed $300k total comp' },
        lead:      { p25: 185_000, p50: 240_000, p75: 305_000, p90: 385_000, exampleRoles: ['Check Airman / Line Check Airman', 'Chief Inspector', 'Flight Standards Manager'], notes: '' },
        principal: { p25: 215_000, p50: 278_000, p75: 355_000, p90: 450_000, exampleRoles: ['Chief Pilot', 'VP Flight Operations (charter)', 'Principal Engineer (Aircraft)'], notes: '' },
        director:  { p25: 175_000, p50: 230_000, p75: 295_000, p90: 380_000, exampleRoles: ['Director of Operations (AOC)', 'Director of Maintenance', 'Director of Safety'], notes: '' },
        vp:        { p25: 220_000, p50: 295_000, p75: 390_000, p90: 510_000, exampleRoles: ['VP Flight Operations', 'VP Technical Operations', 'VP Safety'], notes: '' },
        c_level:   { p25: 350_000, p50: 520_000, p75: 750_000, p90: 1_100_000, exampleRoles: ['CEO (Regional Airline)', 'COO (Major Carrier)', 'CFO (Aviation Group)'], notes: '' },
    },

    utilities_energy: {
        entry:     { p25: 45_000,  p50: 56_000,  p75: 68_000,  p90: 82_000,  exampleRoles: ['Field Technician', 'Meter Reader', 'Energy Analyst I', 'Plant Operator Trainee'], notes: 'OSHA safety training universally required' },
        mid:       { p25: 68_000,  p50: 85_000,  p75: 105_000, p90: 128_000, exampleRoles: ['Power Plant Operator', 'Electrical Engineer (Utilities)', 'Energy Trader', 'Substation Technician'], notes: 'NRC licences required for nuclear plant operators' },
        senior:    { p25: 95_000,  p50: 122_000, p75: 152_000, p90: 188_000, exampleRoles: ['Senior Grid Engineer', 'Senior Energy Analyst', 'Senior Petroleum Engineer', 'Plant Superintendent'], notes: '' },
        lead:      { p25: 120_000, p50: 155_000, p75: 195_000, p90: 242_000, exampleRoles: ['Lead Power Systems Engineer', 'Operations Manager (Utility)', 'Senior Trader (Energy)'], notes: '' },
        principal: { p25: 148_000, p50: 192_000, p75: 242_000, p90: 305_000, exampleRoles: ['Principal Engineer (Renewables)', 'VP Engineering (Utility)', 'Chief Petroleum Engineer'], notes: '' },
        director:  { p25: 170_000, p50: 220_000, p75: 280_000, p90: 358_000, exampleRoles: ['Director of Operations (Power)', 'Director of Renewable Development', 'Director Grid Modernisation'], notes: '' },
        vp:        { p25: 215_000, p50: 282_000, p75: 365_000, p90: 475_000, exampleRoles: ['VP Power Generation', 'VP Transmission', 'VP Upstream (Oil & Gas)'], notes: '' },
        c_level:   { p25: 320_000, p50: 480_000, p75: 690_000, p90: 1_000_000, exampleRoles: ['CEO (Utility)', 'COO (Pipeline)', 'CTO (Renewables Developer)'], notes: 'Total comp includes long-term incentives tied to regulated returns' },
    },

    telecommunications: {
        entry:     { p25: 42_000,  p50: 52_000,  p75: 63_000,  p90: 76_000,  exampleRoles: ['Network Technician I', 'Telecom Field Tech', 'Customer Support Rep', 'RF Technician'], notes: '' },
        mid:       { p25: 68_000,  p50: 85_000,  p75: 105_000, p90: 128_000, exampleRoles: ['Network Engineer', 'RF Engineer', 'Telecom Project Manager', 'Network Operations Engineer'], notes: 'Cisco CCNA/CCNP valued; FCC licensing for some roles' },
        senior:    { p25: 95_000,  p50: 122_000, p75: 152_000, p90: 188_000, exampleRoles: ['Senior Network Architect', 'Senior RF Engineer', 'Senior Systems Engineer (Telecom)'], notes: '' },
        lead:      { p25: 120_000, p50: 155_000, p75: 195_000, p90: 245_000, exampleRoles: ['Lead Network Architect', 'Technical Program Manager (Telecom)', '5G Solutions Lead'], notes: '' },
        principal: { p25: 148_000, p50: 192_000, p75: 242_000, p90: 310_000, exampleRoles: ['Principal Network Architect', 'Distinguished Engineer (Telco)', 'Principal 5G Engineer'], notes: '' },
        director:  { p25: 168_000, p50: 218_000, p75: 278_000, p90: 358_000, exampleRoles: ['Director of Network Engineering', 'Director of RAN', 'Director Network Operations'], notes: '' },
        vp:        { p25: 215_000, p50: 285_000, p75: 372_000, p90: 490_000, exampleRoles: ['VP Network Engineering', 'VP of Technology', 'VP Network Operations (NOC)'], notes: '' },
        c_level:   { p25: 320_000, p50: 480_000, p75: 690_000, p90: 1_000_000, exampleRoles: ['CTO (Carrier)', 'CIO (Telecom)', 'CEO (MVNO)'], notes: '' },
    },

    insurance: {
        entry:     { p25: 40_000,  p50: 50_000,  p75: 62_000,  p90: 76_000,  exampleRoles: ['Insurance Agent (Licensed)', 'Claims Adjuster I', 'Underwriting Assistant', 'Customer Service Rep'], notes: 'State P&C or L&H licence required for agent/broker roles' },
        mid:       { p25: 62_000,  p50: 78_000,  p75: 98_000,  p90: 122_000, exampleRoles: ['Senior Claims Adjuster', 'Underwriter', 'Risk Analyst', 'Benefits Specialist'], notes: 'CPCU or CIC designation valued' },
        senior:    { p25: 88_000,  p50: 112_000, p75: 142_000, p90: 178_000, exampleRoles: ['Senior Underwriter', 'Senior Actuary', 'Claims Manager', 'Senior Risk Manager'], notes: 'ASA/FSA required for actuarial track' },
        lead:      { p25: 112_000, p50: 145_000, p75: 185_000, p90: 232_000, exampleRoles: ['Actuarial Manager', 'Underwriting Manager', 'VP Claims (mid-size)'], notes: '' },
        principal: { p25: 145_000, p50: 190_000, p75: 245_000, p90: 315_000, exampleRoles: ['Fellow of the Casualty Actuarial Society (FCAS)', 'Principal Actuary', 'Senior VP Underwriting'], notes: '' },
        director:  { p25: 168_000, p50: 220_000, p75: 285_000, p90: 368_000, exampleRoles: ['Director of Underwriting', 'Director of Claims', 'Chief Actuary (Regional)'], notes: '' },
        vp:        { p25: 210_000, p50: 278_000, p75: 365_000, p90: 480_000, exampleRoles: ['VP Underwriting', 'VP Claims', 'VP Actuarial'], notes: '' },
        c_level:   { p25: 325_000, p50: 490_000, p75: 710_000, p90: 1_050_000, exampleRoles: ['CRO (Insurer)', 'CUO (Chief Underwriting Officer)', 'CEO (Insurance Carrier)'], notes: '' },
    },

    mining_extractive: {
        entry:     { p25: 45_000,  p50: 56_000,  p75: 68_000,  p90: 82_000,  exampleRoles: ['Mine Helper', 'Lab Technician (Assay)', 'Geologist I', 'Drill Operator'], notes: 'MSHA safety training mandatory; remote-site premiums common' },
        mid:       { p25: 70_000,  p50: 88_000,  p75: 108_000, p90: 132_000, exampleRoles: ['Mining Engineer', 'Geologist', 'Mine Foreman', 'Environmental Technician'], notes: 'PE licence valued for senior engineering roles' },
        senior:    { p25: 98_000,  p50: 125_000, p75: 158_000, p90: 198_000, exampleRoles: ['Senior Mining Engineer', 'Senior Geologist', 'Mine Manager', 'Environmental Manager'], notes: '' },
        lead:      { p25: 125_000, p50: 162_000, p75: 205_000, p90: 258_000, exampleRoles: ['Mine Superintendent', 'Chief Geologist', 'Lead Mining Engineer'], notes: '' },
        principal: { p25: 155_000, p50: 202_000, p75: 258_000, p90: 330_000, exampleRoles: ['Principal Mining Engineer', 'Chief Metallurgist', 'VP Operations (Small Mine)'], notes: '' },
        director:  { p25: 178_000, p50: 232_000, p75: 300_000, p90: 385_000, exampleRoles: ['Director of Mining Operations', 'Director of Exploration', 'Director of Metallurgy'], notes: '' },
        vp:        { p25: 225_000, p50: 300_000, p75: 395_000, p90: 520_000, exampleRoles: ['VP Mining Operations', 'VP Exploration', 'VP Sustainability (Mining)'], notes: '' },
        c_level:   { p25: 340_000, p50: 510_000, p75: 740_000, p90: 1_080_000, exampleRoles: ['CEO (Mining Company)', 'COO', 'CFO (Resource Company)'], notes: 'Compensation tied to commodity cycles; significant LTI component' },
    },
};

// ---------------------------------------------------------------------------
// Location modifiers (same as before, expanded)
// ---------------------------------------------------------------------------

const LOCATION_MODIFIER: Record<string, number> = {
    // US metros
    'san francisco': 1.48, 'bay area': 1.48, 'silicon valley': 1.48,
    'new york': 1.38, 'nyc': 1.38, 'new york city': 1.38,
    'seattle': 1.28, 'boston': 1.22, 'los angeles': 1.25, 'washington dc': 1.20,
    'chicago': 1.12, 'austin': 1.06, 'denver': 1.06, 'miami': 1.04,
    'atlanta': 1.02, 'dallas': 1.04, 'phoenix': 1.00, 'raleigh': 1.00,
    'nashville': 0.98, 'charlotte': 0.98, 'kansas city': 0.95,
    'remote': 1.00,
    // Canada
    'toronto': 0.80, 'vancouver': 0.78, 'montreal': 0.72, 'calgary': 0.76,
    // UK
    'london': 0.92, 'manchester': 0.75, 'edinburgh': 0.74, 'bristol': 0.74,
    // Europe
    'berlin': 0.68, 'munich': 0.78, 'amsterdam': 0.76, 'paris': 0.82,
    'zurich': 1.05, 'dublin': 0.88, 'stockholm': 0.80, 'barcelona': 0.62,
    'madrid': 0.60, 'milan': 0.65, 'warsaw': 0.42, 'prague': 0.40,
    // APAC
    'singapore': 0.90, 'sydney': 0.82, 'melbourne': 0.78, 'tokyo': 0.72,
    'hong kong': 0.88, 'bangalore': 0.22, 'mumbai': 0.24, 'delhi': 0.20,
    // Middle East
    'dubai': 0.82, 'abu dhabi': 0.85, 'riyadh': 0.68,
    // Latin America
    'são paulo': 0.32, 'mexico city': 0.30, 'bogotá': 0.25, 'buenos aires': 0.25,
};

function getLocationModifier(location: string): number {
    const lower = location.toLowerCase();
    for (const [city, mod] of Object.entries(LOCATION_MODIFIER)) {
        if (lower.includes(city)) return mod;
    }
    return 1.00; // US national average fallback
}

// ---------------------------------------------------------------------------
// Company-size premium
// ---------------------------------------------------------------------------

const SIZE_MODIFIER: Record<string, number> = {
    startup: 0.85,        // below market on cash, offset by equity
    scaleup: 0.95,
    mid_market: 1.00,
    enterprise: 1.12,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SalaryBenchmarkResult {
    industry: Industry;
    seniority: SeniorityBand;
    location: string;
    currency: string;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    locationModifier: number;
    sizeModifier: number;
    exampleRoles: string[];
    notes: string;
    validationNote: string;
}

export function getSalaryBenchmark(
    industry: Industry,
    seniority: SeniorityBand,
    location: string,
    companySize?: string,
    targetCurrency: string = 'USD',
): SalaryBenchmarkResult {
    const band = BANDS[industry]?.[seniority];
    if (!band) {
        throw new Error(`No salary data for industry="${industry}", seniority="${seniority}"`);
    }

    const locMod = getLocationModifier(location);
    const sizeMod = SIZE_MODIFIER[companySize ?? 'mid_market'] ?? 1.00;
    const totalMod = locMod * sizeMod;

    const round = (n: number) => Math.round(n / 1000) * 1000;

    return {
        industry,
        seniority,
        location,
        currency: targetCurrency,
        p25: round(band.p25 * totalMod),
        p50: round(band.p50 * totalMod),
        p75: round(band.p75 * totalMod),
        p90: round(band.p90 * totalMod),
        locationModifier: locMod,
        sizeModifier: sizeMod,
        exampleRoles: band.exampleRoles,
        notes: band.notes,
        validationNote: `Heuristic estimates. Validate against Radford, Mercer, Glassdoor, Levels.fyi, or BLS OES for ${industry} roles before making an offer.`,
    };
}

export function listSupportedIndustries(): Industry[] {
    return Object.keys(BANDS) as Industry[];
}

export function detectIndustryFromJobTitle(jobTitle: string): Industry {
    const lower = jobTitle.toLowerCase();
    if (/nurse|physician|doctor|surgeon|pharmacist|therapist|clinical|medical|dental|radiol|pa-c|neonatal|icu|er |rn |np |cna |bsn/.test(lower)) return 'healthcare';
    if (/attorney|lawyer|counsel|paralegal|solicitor|barrister|legal|litigation|corporate law/.test(lower)) return 'legal';
    if (/accountant|auditor|cpa|cfa|financial analyst|investment|banker|portfolio|actuar|quant|finra|hedge fund|private equity/.test(lower)) return 'finance';
    if (/teacher|professor|lecturer|principal|dean|curriculum|instructional designer|superintendent|educator|tutor/.test(lower)) return 'education';
    if (/cnc|machinist|welder|production|plant manager|manufacturing engineer|quality inspector|lean|six sigma|tooling/.test(lower)) return 'manufacturing';
    if (/civil engineer|structural|mechanical engineer|electrical engineer|chemical engineer|environmental engineer|geotechnical|pe /.test(lower)) return 'engineering_non_software';
    if (/retail|store manager|merchandis|buyer|category manager|visual|e-commerce|district manager/.test(lower)) return 'retail';
    if (/chef|restaurant|hotel|front desk|housekeep|event coordinator|banquet|food and beverage|sommelier/.test(lower)) return 'hospitality';
    if (/policy analyst|government|federal|gsa|dod|public sector|civil servant|intelligence analyst|clearance/.test(lower)) return 'government';
    if (/nonprofit|ngo|charity|program manager|grant writer|fundrais|development director/.test(lower)) return 'nonprofit';
    if (/designer|creative|producer|filmmaker|ux |ui |art director|copywriter|photographer|videographer|animator/.test(lower)) return 'creative_media';
    if (/consultant|mckinsey|bain|bcg|deloitte|accenture|pwc|strategy|management consulting/.test(lower)) return 'consulting';
    if (/account executive|sales rep|sdr|bdr|sales manager|revenue|business development|account manager|field sales/.test(lower)) return 'sales_bizdev';
    if (/supply chain|procurement|logistics|warehouse|distribution|inventory|sourcing|demand planning/.test(lower)) return 'logistics_supply_chain';
    if (/real estate|property manager|leasing|acquisitions|asset manager|reit|developer/.test(lower)) return 'real_estate';
    if (/scientist|researcher|biotech|pharma|clinical trial|regulatory affairs|drug|genomic|bioinformatics/.test(lower)) return 'pharmaceutical_biotech';
    if (/agronomist|farm manager|crop|agricultural|agronomy|horticulture|livestock|animal scientist/.test(lower)) return 'agriculture';
    if (/pilot|captain|first officer|flight dispatcher|aviation mechanic|a&p mechanic|airframe.*powerplant|airline/.test(lower)) return 'aviation';
    if (/power plant|grid engineer|energy trader|petroleum engineer|utility|substation|renewable|upstream oil|downstream/.test(lower)) return 'utilities_energy';
    if (/network engineer|rf engineer|telecom|5g|network architect|network operations|carrier|noc engineer/.test(lower)) return 'telecommunications';
    if (/underwriter|actuary|claims adjuster|insurance agent|insurance broker|insurance manager/.test(lower)) return 'insurance';
    if (/mining engineer|mine manager|geologist|metallurgist|mine foreman|msha|drill operator/.test(lower)) return 'mining_extractive';
    // Default: technology
    return 'technology';
}
