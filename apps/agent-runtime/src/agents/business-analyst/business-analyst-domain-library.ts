/**
 * Business Analyst — Domain Library
 *
 * Pre-loaded industry-specific requirement templates, compliance checklists,
 * and BRD section patterns.  These are the "prior knowledge" the BA agent
 * carries before it has seen any project-specific documents.
 *
 * Usage:
 *   1. On first workspace setup, call ingestAllDomainTemplates() to write all
 *      built-in templates into the knowledge base.
 *   2. The RAG retriever (business-analyst-rag-retriever.ts) searches these
 *      chunks before drafting any document.
 *   3. Tenants can add their own templates by calling ingestDomainTemplate()
 *      with custom content.
 *
 * Each template is written to POST /v1/knowledge-base/write with:
 *   sourceType: 'ba_domain_template'
 *   sourceUrl:  a synthetic URN identifying the template
 *   content:    the full template text
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaDomain =
    | 'general'
    | 'healthcare'
    | 'finance'
    | 'ecommerce'
    | 'saas'
    | 'government'
    | 'logistics'
    | 'hr';

export type BaTemplateCategory =
    | 'brd_section'           // Standard BRD section templates
    | 'user_story_pattern'    // Common user story / AC patterns
    | 'compliance_checklist'  // Regulatory / compliance requirement lists
    | 'risk_pattern'          // Common requirement risk patterns to check for
    | 'definition_of_done';   // Domain-specific DOD checklists

export interface BaDomainTemplate {
    id: string;
    domain: BaDomain;
    category: BaTemplateCategory;
    title: string;
    /**
     * The content to embed and store.  Written verbatim — the LLM retrieves
     * this chunk and uses it as a reference when drafting.
     */
    content: string;
    /**
     * Compliance framework tags for targeted retrieval.
     * e.g. ['gdpr', 'hipaa', 'pci-dss']
     */
    complianceTags: string[];
    /** Synthetic URN — used as the sourceUrl in the knowledge-base write. */
    urn: string;
}

// ---------------------------------------------------------------------------
// Built-in template library
// ---------------------------------------------------------------------------

export const BA_DOMAIN_TEMPLATES: BaDomainTemplate[] = [
    // ── BRD Section Templates ──────────────────────────────────────────────

    {
        id: 'brd_objectives',
        domain: 'general',
        category: 'brd_section',
        title: 'BRD: Objectives Section Template',
        urn: 'urn:agentfarm:ba:template:brd_objectives',
        complianceTags: [],
        content: `## 1. Business Objectives

### 1.1 Problem Statement
[Describe the business problem or opportunity this project addresses. Be specific about the pain, cost, or risk of the current state.]

### 1.2 Strategic Alignment
[Explain how this initiative aligns with organisational strategy, OKRs, or product vision.]

### 1.3 Expected Business Outcomes
List each expected outcome as a measurable result:
- Outcome 1: [What changes and how it is measured]
- Outcome 2: [What changes and how it is measured]

### 1.4 Success Metrics (KPIs)
| Metric | Current Baseline | Target | Measurement Method |
|--------|-----------------|--------|-------------------|
| [e.g. Processing time] | [e.g. 4 hours] | [e.g. 30 min] | [e.g. System logs] |

Tip: At least one metric must be quantifiable and measurable within 90 days of delivery.`,
    },

    {
        id: 'brd_scope',
        domain: 'general',
        category: 'brd_section',
        title: 'BRD: Scope Section Template',
        urn: 'urn:agentfarm:ba:template:brd_scope',
        complianceTags: [],
        content: `## 2. Scope

### 2.1 In Scope
Explicitly list what this project WILL deliver:
- [Feature / process / system component]
- [Integration or data migration included]

### 2.2 Out of Scope
Explicitly list what this project WILL NOT deliver (prevents scope creep):
- [Adjacent feature to be addressed in a future phase]
- [System or data source not being integrated]

### 2.3 Assumptions
List assumptions that, if incorrect, would change the scope:
- [e.g. "Assumes the existing authentication system will remain unchanged"]
- [e.g. "Assumes no change to the regulatory framework during delivery"]

### 2.4 Dependencies
| Dependency | Owner | Risk if Unavailable |
|------------|-------|---------------------|
| [e.g. Data warehouse access] | [Team/Person] | [Impact on timeline] |

Tip: Every item in scope must map to at least one requirement in Section 4.`,
    },

    {
        id: 'brd_stakeholders',
        domain: 'general',
        category: 'brd_section',
        title: 'BRD: Stakeholders Section Template',
        urn: 'urn:agentfarm:ba:template:brd_stakeholders',
        complianceTags: [],
        content: `## 3. Stakeholders

### 3.1 RACI Matrix
| Role | Name | Responsible | Accountable | Consulted | Informed |
|------|------|-------------|-------------|-----------|---------|
| Project Sponsor | [Name] | | ✓ | | |
| Product Owner | [Name] | ✓ | | | |
| End Users | [Group] | | | ✓ | ✓ |
| IT / Engineering | [Team] | ✓ | | ✓ | |
| Legal / Compliance | [Team] | | | ✓ | ✓ |

### 3.2 Communication Plan
| Stakeholder | Frequency | Channel | Content |
|-------------|-----------|---------|---------|
| Project Sponsor | Weekly | Email | Status update |
| End Users | Bi-weekly | Slack | Progress demo |

### 3.3 Change Advisory Board
[Name the body that must approve scope changes and BRD amendments.]`,
    },

    {
        id: 'brd_requirements',
        domain: 'general',
        category: 'brd_section',
        title: 'BRD: Requirements Section Template',
        urn: 'urn:agentfarm:ba:template:brd_requirements',
        complianceTags: [],
        content: `## 4. Requirements

### 4.1 Functional Requirements
Use the format: REQ-F-[NNN] | [Priority: Must/Should/Could/Won't] | [Requirement text]

| ID | Priority | Requirement |
|----|----------|-------------|
| REQ-F-001 | Must | [The system must...] |
| REQ-F-002 | Should | [The system should...] |

Priority follows MoSCoW: Must (MVP), Should (High value), Could (Nice-to-have), Won't (Deferred).

### 4.2 Non-Functional Requirements
| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| REQ-NF-001 | Performance | System response time | < 2s at 95th percentile |
| REQ-NF-002 | Availability | Uptime | 99.9% excluding maintenance |
| REQ-NF-003 | Security | Authentication | MFA for admin roles |
| REQ-NF-004 | Scalability | Concurrent users | 10,000 simultaneous |

### 4.3 Data Requirements
- Data entities involved and their key attributes
- Data volume estimates (current and projected 3-year)
- Data retention and archival requirements
- Data ownership and stewardship`,
    },

    // ── User Story Patterns ────────────────────────────────────────────────

    {
        id: 'us_standard_pattern',
        domain: 'general',
        category: 'user_story_pattern',
        title: 'User Story: Standard Pattern with AC',
        urn: 'urn:agentfarm:ba:template:us_standard_pattern',
        complianceTags: [],
        content: `## User Story Pattern

**Format:**
As a [persona / role],
I want [action / capability],
So that [business value / outcome].

**Acceptance Criteria (Given/When/Then):**
Given [a specific context or precondition],
When [the user performs an action],
Then [the expected observable outcome].

**Quality gates for a well-formed user story:**
- One persona only (avoid "As a user or admin")
- The "so that" clause expresses business value, not a technical detail
- Each AC is independently testable
- No AC references implementation details (no "the system calls API X")
- All edge cases and error states have at least one AC
- Story is estimable in isolation (no hidden dependencies)
- Story is small enough to complete in one sprint

**Anti-patterns to flag:**
- Epic disguised as a story (breaks into multiple stories if > 5 ACs)
- Missing error/failure scenario ACs
- "So that I can use the feature" (circular value statement)
- AC that tests internal state rather than observable behaviour`,
    },

    {
        id: 'us_api_integration',
        domain: 'general',
        category: 'user_story_pattern',
        title: 'User Story: API / Integration Pattern',
        urn: 'urn:agentfarm:ba:template:us_api_integration',
        complianceTags: [],
        content: `## API / Integration User Story Pattern

As a [consuming system or user],
I want [to send / receive / access data via integration],
So that [the integration enables this business outcome].

**Standard AC for integration stories:**

Given the integration is configured and the source system is available,
When a [event / record / payload] is sent to [endpoint / queue],
Then the receiving system [stores / processes / acknowledges] the data within [SLA].

Given the source system is unavailable or returns an error,
When the integration attempts to [send / receive] data,
Then the system [retries N times / queues for later / alerts ops] and does NOT lose data.

Given a malformed payload is received,
When the integration processes the message,
Then the system rejects it with a clear error code and logs the failure for investigation.

**Integration-specific requirements to capture:**
- Authentication mechanism (OAuth2, API key, mTLS)
- Idempotency requirements (duplicate message handling)
- SLA: message processing time, retry policy, dead-letter queue
- Data transformation or mapping rules
- Monitoring and alerting thresholds`,
    },

    // ── Compliance Checklists ──────────────────────────────────────────────

    {
        id: 'compliance_gdpr',
        domain: 'general',
        category: 'compliance_checklist',
        title: 'GDPR Compliance Checklist for Requirements',
        urn: 'urn:agentfarm:ba:template:compliance_gdpr',
        complianceTags: ['gdpr', 'data-protection', 'eu', 'privacy'],
        content: `## GDPR Requirements Checklist

When a project involves personal data of EU/EEA residents, include ALL of the following:

### Lawful Basis
- [ ] REQ: Document the lawful basis for processing (consent / contract / legal obligation / vital interests / public task / legitimate interests)
- [ ] REQ: If consent-based, capture mechanism for obtaining, recording, and withdrawing consent

### Data Subject Rights
- [ ] REQ: Right of access — user can request a copy of their data within 30 days
- [ ] REQ: Right to erasure ("right to be forgotten") — user can request deletion; system must purge within 30 days
- [ ] REQ: Right to rectification — user can correct inaccurate personal data
- [ ] REQ: Right to data portability — data exportable in machine-readable format (JSON or CSV)
- [ ] REQ: Right to object — user can object to processing; system must honour within 72 hours

### Privacy by Design
- [ ] REQ: Data minimisation — only collect fields strictly necessary for the stated purpose
- [ ] REQ: Purpose limitation — data used only for the purpose it was collected
- [ ] REQ: Storage limitation — define retention period; auto-delete or anonymise at expiry
- [ ] REQ: Pseudonymisation — personal identifiers stored separately where feasible

### Security
- [ ] REQ: Encryption at rest (AES-256 minimum) for all personal data fields
- [ ] REQ: Encryption in transit (TLS 1.2+ for all data transfers)
- [ ] REQ: Access controls — only authorised roles can access personal data; audit log of access
- [ ] REQ: Breach notification — system must support detection and logging of breaches for 72-hour GDPR notification SLA

### Third-Party Processors
- [ ] REQ: List all third-party processors who will access personal data
- [ ] REQ: Data Processing Agreements (DPA) in place with each processor
- [ ] REQ: No data transferred outside EEA without adequate safeguards (SCCs, adequacy decision, BCRs)`,
    },

    {
        id: 'compliance_hipaa',
        domain: 'healthcare',
        category: 'compliance_checklist',
        title: 'HIPAA Compliance Checklist for Requirements',
        urn: 'urn:agentfarm:ba:template:compliance_hipaa',
        complianceTags: ['hipaa', 'phi', 'healthcare', 'us'],
        content: `## HIPAA Requirements Checklist

When a project involves Protected Health Information (PHI), include ALL of the following:

### Administrative Safeguards
- [ ] REQ: Designated Privacy Officer and Security Officer roles identified
- [ ] REQ: Workforce training on PHI handling before system access
- [ ] REQ: Business Associate Agreements (BAA) with all vendors accessing PHI
- [ ] REQ: Incident response plan covering PHI breach scenarios

### Physical Safeguards
- [ ] REQ: Workstation and device controls — screen lock, remote wipe for mobile devices
- [ ] REQ: Facility access controls for servers holding PHI (logging, badge access)

### Technical Safeguards
- [ ] REQ: Unique user identification — no shared accounts for PHI access
- [ ] REQ: Automatic session timeout after [≤15 min] of inactivity for PHI screens
- [ ] REQ: Audit controls — log who accessed which PHI record, when, from where
- [ ] REQ: Integrity controls — detect and protect against unauthorized PHI alteration
- [ ] REQ: Transmission security — end-to-end encryption for all PHI in transit (TLS 1.2+)
- [ ] REQ: Encryption at rest for all PHI fields (AES-256)

### Minimum Necessary Standard
- [ ] REQ: Role-based access — users see only the PHI fields needed for their role
- [ ] REQ: De-identification — remove or mask 18 HIPAA identifiers before using data for analytics

### Breach Notification
- [ ] REQ: Detect and log unauthorised PHI access events
- [ ] REQ: Notify affected individuals within 60 days of discovery
- [ ] REQ: Notify HHS within 60 days (annual report if < 500 individuals)`,
    },

    {
        id: 'compliance_pci_dss',
        domain: 'finance',
        category: 'compliance_checklist',
        title: 'PCI-DSS Compliance Checklist for Requirements',
        urn: 'urn:agentfarm:ba:template:compliance_pci_dss',
        complianceTags: ['pci-dss', 'payment', 'finance', 'cardholder-data'],
        content: `## PCI-DSS Requirements Checklist

When a project involves cardholder data (CHD) or payment processing:

### Cardholder Data Environment (CDE) Scope
- [ ] REQ: Define the CDE boundary — which systems store, process, or transmit CHD
- [ ] REQ: Minimise scope — use tokenisation to keep CHD outside core application where possible
- [ ] REQ: NEVER store: full magnetic stripe, CVV/CVC, PINs — not even temporarily

### Access Controls
- [ ] REQ: Unique credentials per user — no shared accounts in CDE
- [ ] REQ: Role-based access — principle of least privilege for CHD access
- [ ] REQ: MFA required for all remote access to CDE and for all administrator access
- [ ] REQ: All access to CHD logged with user, timestamp, action

### Data Security
- [ ] REQ: PAN (Primary Account Number) masked in display — show only last 4 digits
- [ ] REQ: PAN encrypted at rest (AES-256 or RSA-2048+)
- [ ] REQ: Strong cryptography for CHD in transit (TLS 1.2 minimum; TLS 1.0/1.1 disabled)
- [ ] REQ: Quarterly vulnerability scans; annual penetration test of CDE

### Network Security
- [ ] REQ: Firewall rules separate CDE from untrusted networks
- [ ] REQ: No direct internet connectivity to systems holding CHD
- [ ] REQ: IDS/IPS on all traffic entering and leaving CDE

### Logging & Monitoring
- [ ] REQ: Centralised log management for all CDE system events
- [ ] REQ: Log retention: 12 months minimum (3 months immediately available)
- [ ] REQ: Automated alerts for anomalous access patterns within CDE`,
    },

    {
        id: 'compliance_soc2',
        domain: 'saas',
        category: 'compliance_checklist',
        title: 'SOC 2 Type II Requirements Checklist',
        urn: 'urn:agentfarm:ba:template:compliance_soc2',
        complianceTags: ['soc2', 'saas', 'trust-service-criteria'],
        content: `## SOC 2 Type II Requirements Checklist

For SaaS products seeking SOC 2 certification, ensure requirements address all applicable Trust Service Criteria:

### Security (CC — Common Criteria)
- [ ] REQ: Logical access controls — MFA, role-based, least privilege
- [ ] REQ: Change management — all production changes reviewed and approved before deployment
- [ ] REQ: Incident response — defined and tested playbook for security incidents
- [ ] REQ: Vendor management — third-party risk assessment for all vendors in data path
- [ ] REQ: Penetration testing — annual third-party pen test; findings tracked to closure

### Availability
- [ ] REQ: Uptime SLA defined and monitored (e.g. 99.9% monthly)
- [ ] REQ: Disaster recovery plan with tested RTO and RPO targets
- [ ] REQ: Capacity planning — system monitored for usage trends; scale plan documented
- [ ] REQ: Status page — real-time availability communicated to customers

### Confidentiality
- [ ] REQ: Data classification policy — confidential data identified and labelled
- [ ] REQ: Encryption at rest and in transit for confidential data
- [ ] REQ: NDA / confidentiality agreements with employees and contractors

### Processing Integrity
- [ ] REQ: Data validation at input — reject malformed data before processing
- [ ] REQ: Error handling — all processing errors logged; failed transactions identifiable
- [ ] REQ: Reconciliation — output validated against input for critical data pipelines

### Privacy (if collecting personal data)
- [ ] REQ: Privacy notice displayed before data collection
- [ ] REQ: Data retention schedule defined and enforced
- [ ] REQ: Data subject request process (access, deletion, correction)`,
    },

    // ── Risk Patterns ──────────────────────────────────────────────────────

    {
        id: 'risk_scope_creep',
        domain: 'general',
        category: 'risk_pattern',
        title: 'Risk Pattern: Scope Creep Indicators',
        urn: 'urn:agentfarm:ba:template:risk_scope_creep',
        complianceTags: [],
        content: `## Risk Pattern: Scope Creep

Scope creep is the #1 cause of project overruns. Flag the following signals in requirements:

### Language signals in requirements
- "And also..." — indicates a second requirement bundled into one
- "At some point we'll need..." — deferred requirement that will be pushed into current scope
- "We assumed this was included" — undocumented assumption
- "While we're at it..." — opportunistic addition unrelated to the business objective
- "The stakeholder mentioned..." — informal verbal commitment not in the BRD

### Structural signals
- Requirements with no clear link to a stated business objective
- Requirements added after the sign-off date without a change request
- Stories estimated > 13 points (likely contains multiple stories)
- Dependencies that double the scope of an adjacent system

### Mitigation requirements to include
- REQ: All scope changes after baseline sign-off require a formal Change Request with impact assessment
- REQ: Change Request approved by the Change Advisory Board before implementation
- REQ: BRD version history maintained; each version tagged with approver and date`,
    },

    {
        id: 'risk_nonfunctional_omission',
        domain: 'general',
        category: 'risk_pattern',
        title: 'Risk Pattern: Missing Non-Functional Requirements',
        urn: 'urn:agentfarm:ba:template:risk_nonfunctional_omission',
        complianceTags: [],
        content: `## Risk Pattern: Missing Non-Functional Requirements

NFRs are commonly omitted in early BRD drafts but drive the most expensive rework in later phases. Always check for:

### Performance
- No response time target specified → developer will optimise for convenience, not user experience
- No concurrent user target → system may work in testing but fail at scale
- No data volume estimate → database design will be wrong for production load

### Security
- No authentication / authorisation requirements → defaults to "whatever is easiest"
- No data classification → no encryption decisions can be made
- No audit logging requirement → breach investigation impossible

### Reliability
- No uptime / availability SLA → no basis for architecture decisions
- No backup / recovery RPO/RTO → disaster recovery left to chance
- No error handling requirement → failures are silent or user-hostile

### Compliance
- No data retention requirement → legal exposure
- No regulatory framework identified (GDPR, HIPAA, PCI) → compliance gap discovered in pen test
- No geographic data residency requirement → cloud provider places data in wrong region

**Checklist: Before submitting any BRD draft, confirm each category has at least one NFR.**`,
    },

    // ── Definition of Done ─────────────────────────────────────────────────

    {
        id: 'dod_ba_deliverable',
        domain: 'general',
        category: 'definition_of_done',
        title: 'Definition of Done: BA Deliverable Checklist',
        urn: 'urn:agentfarm:ba:template:dod_ba_deliverable',
        complianceTags: [],
        content: `## Definition of Done — BA Deliverable

A BRD, user story set, or specification is DONE when ALL of the following are true:

### Completeness
- [ ] All required BRD sections are present (Objectives, Scope, Stakeholders, Requirements, Success Criteria)
- [ ] Every functional requirement has a unique ID and MoSCoW priority
- [ ] Non-functional requirements cover: Performance, Security, Availability, Scalability
- [ ] Every user story follows "As a... I want... So that..." format
- [ ] Every user story has at least one Given/When/Then acceptance criterion
- [ ] All edge cases and error paths have acceptance criteria

### Consistency
- [ ] No contradictions between requirements (same capability described differently in two sections)
- [ ] Scope section matches the requirement list (nothing in requirements not covered by scope)
- [ ] Stakeholder RACI is consistent with the requirements (all approvers identified)

### Approval
- [ ] Reviewed by at least one technical representative (feasibility confirmed)
- [ ] Reviewed by at least one business stakeholder (business value confirmed)
- [ ] Sign-off obtained from the designated approver (documented with date)

### Traceability
- [ ] Each requirement traceable to at least one business objective
- [ ] Each story traceable to at least one functional requirement
- [ ] Compliance requirements traceable to specific regulatory citations`,
    },

    // ── Finance Domain ─────────────────────────────────────────────────────

    {
        id: 'finance_trading_requirements',
        domain: 'finance',
        category: 'compliance_checklist',
        title: 'Financial Services: Trading & Transaction Requirements',
        urn: 'urn:agentfarm:ba:template:finance_trading',
        complianceTags: ['mifid2', 'finra', 'sec', 'finance'],
        content: `## Financial Services Requirements Checklist

For projects involving trading, transactions, or financial data processing:

### Transaction Integrity
- [ ] REQ: All financial transactions must be atomic — partial completion must roll back
- [ ] REQ: Every transaction assigned a unique immutable ID traceable end-to-end
- [ ] REQ: Double-entry accounting principle enforced in data model (every debit has a matching credit)
- [ ] REQ: Monetary values stored as integers (pence/cents) — no floating point arithmetic

### Regulatory (MiFID II / FINRA)
- [ ] REQ: Order and trade records retained for minimum 7 years
- [ ] REQ: Best execution evidence captured and available for audit
- [ ] REQ: Transaction reporting to regulator within T+1
- [ ] REQ: Client suitability and appropriateness checks before high-risk transactions

### Reconciliation
- [ ] REQ: Daily automated reconciliation of positions against custodian/exchange records
- [ ] REQ: Break report generated automatically for unreconciled items
- [ ] REQ: Reconciliation results signed off by operations within 24 hours

### Latency & Throughput
- [ ] REQ: Order execution latency defined (e.g. < 50ms for market orders)
- [ ] REQ: Peak throughput capacity tested and documented before go-live`,
    },

    // ── Healthcare Domain ──────────────────────────────────────────────────

    {
        id: 'healthcare_ehr_requirements',
        domain: 'healthcare',
        category: 'compliance_checklist',
        title: 'Healthcare: EHR / Clinical System Requirements',
        urn: 'urn:agentfarm:ba:template:healthcare_ehr',
        complianceTags: ['hipaa', 'hl7', 'fhir', 'healthcare'],
        content: `## Healthcare EHR / Clinical System Requirements Checklist

### Interoperability
- [ ] REQ: HL7 FHIR R4 compliance for all clinical data exchange
- [ ] REQ: Support HL7 v2 messaging for legacy system integration (ADT, ORU, ORM messages)
- [ ] REQ: SNOMED CT or ICD-10 coding for diagnoses; LOINC for lab results; RxNorm for medications

### Clinical Safety
- [ ] REQ: Drug-drug interaction checks at point of prescribing (alert on severity ≥ moderate)
- [ ] REQ: Allergy alerts triggered when prescribing a contraindicated medication
- [ ] REQ: Critical lab values flagged and routed to the ordering clinician within 15 minutes
- [ ] REQ: Clinical decision support alerts must be overridable with a documented clinical reason

### Audit & Traceability
- [ ] REQ: Full audit trail of every clinical record access (read) and modification (create/update/delete)
- [ ] REQ: Audit logs immutable — no deletion or modification of audit entries
- [ ] REQ: Patient record versioning — all previous states accessible

### Consent
- [ ] REQ: Patient consent captured and recorded before any data sharing
- [ ] REQ: Granular consent — patient can consent to sharing with specific providers or systems
- [ ] REQ: Consent withdrawal mechanism: stops future sharing, does not remove historical records`,
    },
];

// ---------------------------------------------------------------------------
// Ingest functions — write templates to the knowledge base
// ---------------------------------------------------------------------------

/**
 * The gateway request body shape for POST /v1/knowledge-base/write.
 */
interface KbWriteBody {
    tenantId: string;
    botId?: string;
    content: string;
    sourceUrl: string;
    sourceType: string;
}

/**
 * Write a single domain template to the knowledge base.
 *
 * Returns true on HTTP 201, false on failure.
 * Never throws — errors are logged and the caller can choose to retry.
 */
export async function ingestDomainTemplate(
    template: BaDomainTemplate,
    gatewayBaseUrl: string,
    serviceToken: string,
    tenantId: string,
    botId?: string,
): Promise<boolean> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const body: KbWriteBody = {
        tenantId,
        botId,
        content: `[BA Domain Template: ${template.title}]\n\nDomain: ${template.domain} | Category: ${template.category}${template.complianceTags.length > 0 ? ` | Compliance: ${template.complianceTags.join(', ')}` : ''}\n\n${template.content}`,
        sourceUrl: template.urn,
        sourceType: 'ba_domain_template',
    };

    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn(
                `[ba-domain-library] Failed to ingest template "${template.id}": HTTP ${res.status} ${errText}`,
            );
            return false;
        }

        return true;
    } catch (err) {
        console.warn(`[ba-domain-library] Network error ingesting template "${template.id}": ${String(err)}`);
        return false;
    }
}

export interface IngestAllResult {
    total: number;
    succeeded: number;
    failed: number;
    failedIds: string[];
}

/**
 * Bulk-ingest all built-in domain templates into the knowledge base.
 *
 * Call this once per workspace during setup — subsequent searches will find
 * these templates via cosine-similarity retrieval.
 *
 * Templates are ingested sequentially to avoid overwhelming the embedding
 * service.  Returns a summary of how many succeeded and failed.
 */
export async function ingestAllDomainTemplates(params: {
    gatewayBaseUrl: string;
    serviceToken: string;
    tenantId: string;
    botId?: string;
    /** Subset of template IDs to ingest (default: all). */
    templateIds?: string[];
}): Promise<IngestAllResult> {
    const { gatewayBaseUrl, serviceToken, tenantId, botId, templateIds } = params;

    const toIngest = templateIds
        ? BA_DOMAIN_TEMPLATES.filter((t) => templateIds.includes(t.id))
        : BA_DOMAIN_TEMPLATES;

    const result: IngestAllResult = {
        total: toIngest.length,
        succeeded: 0,
        failed: 0,
        failedIds: [],
    };

    for (const template of toIngest) {
        const ok = await ingestDomainTemplate(template, gatewayBaseUrl, serviceToken, tenantId, botId);
        if (ok) {
            result.succeeded++;
        } else {
            result.failed++;
            result.failedIds.push(template.id);
        }
    }

    return result;
}

/**
 * Return all templates matching the given compliance tags (case-insensitive).
 * Pure helper — no I/O.
 */
export function filterTemplatesByCompliance(tags: string[]): BaDomainTemplate[] {
    const lower = tags.map((t) => t.toLowerCase());
    return BA_DOMAIN_TEMPLATES.filter((template) =>
        template.complianceTags.some((ct) => lower.includes(ct.toLowerCase())),
    );
}
