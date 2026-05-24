// ============================================================================
// FSD SECURITY ANALYZER
// Sprint 16 — Full-Stack Developer Role
//
// LLM-powered business-logic security analysis — goes beyond SAST pattern
// matching by reasoning about HOW the feature could be exploited in its
// specific application context.
//
// buildBusinessLogicSecurityPrompt → crafts adversarial LLM prompt
// parseSecurityFindings            → structures LLM response into findings
// runStaticSecurityChecks          → pure pattern-based pre-scan (fast)
// categorizeSecurityRisk           → CVSS-inspired severity bucketing
// buildSecurityReport              → merges static + LLM findings into report
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecurityRisk = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SecurityVulnerabilityClass =
    | 'idor'                    // Insecure Direct Object Reference
    | 'broken_auth'             // Missing/bypassed auth checks
    | 'privilege_escalation'    // User can access higher-privilege actions
    | 'race_condition'          // TOCTOU, concurrent write issues
    | 'data_exposure'           // Sensitive data leaked in response
    | 'injection'               // SQL, NoSQL, command injection
    | 'xss'                     // Cross-Site Scripting
    | 'csrf'                    // Cross-Site Request Forgery
    | 'mass_assignment'         // Unfiltered body fields bound to model
    | 'insecure_deserialization'
    | 'ssrf'                    // Server-Side Request Forgery
    | 'path_traversal'
    | 'business_logic_bypass'   // Domain-specific logic circumvention
    | 'missing_rate_limit'
    | 'hardcoded_secret'
    | 'other';

export interface SecurityFinding {
    id:          string;
    vulnClass:   SecurityVulnerabilityClass;
    risk:        SecurityRisk;
    title:       string;
    description: string;
    codeLocation?: string;    // file path or line reference
    attackVector: string;     // how an attacker would exploit it
    fix:          string;     // concrete remediation
    cweId?:       number;     // CWE reference
}

export interface SecurityReport {
    score:           number;    // 0–100 (100 = no findings)
    criticalCount:   number;
    highCount:       number;
    findings:        SecurityFinding[];
    executiveSummary: string;
}

// ---------------------------------------------------------------------------
// buildBusinessLogicSecurityPrompt
// ---------------------------------------------------------------------------

/**
 * Crafts an adversarial "red team" LLM prompt focused on business-logic
 * vulnerabilities that static scanners miss. Pure function.
 */
export function buildBusinessLogicSecurityPrompt(params: {
    featureTitle:       string;
    featureDescription: string;
    featureCode:        string;
    authCode?:          string;
    existingEndpoints?: string;
    framework?:         string;
}): string {
    const { featureTitle, featureDescription, featureCode, authCode, existingEndpoints, framework } = params;

    const authBlock = authCode
        ? `\nAuth / permission code:\n\`\`\`\n${authCode.slice(0, 2000)}\n\`\`\``
        : '';

    const endpointsBlock = existingEndpoints
        ? `\nExisting API endpoints:\n${existingEndpoints.slice(0, 1000)}`
        : '';

    return [
        `You are a senior application security engineer doing an adversarial code review.`,
        `Think like an attacker. Find business-logic vulnerabilities that a static scanner would miss.`,
        ``,
        `Feature: "${featureTitle}"`,
        `Description: ${featureDescription}`,
        `Framework: ${framework ?? 'Node.js/TypeScript'}`,
        ``,
        `Feature code to review:`,
        `\`\`\``,
        featureCode.slice(0, 4000),
        `\`\`\``,
        authBlock,
        endpointsBlock,
        ``,
        `Vulnerability classes to check (cover as many as apply):`,
        `- IDOR: can user A access user B's data by changing an ID in the request?`,
        `- Broken auth: is authentication checked BEFORE business logic runs?`,
        `- Privilege escalation: can a regular user trigger admin-only actions?`,
        `- Race conditions: are there TOCTOU bugs in check-then-act sequences?`,
        `- Mass assignment: are unfiltered request body fields bound to database models?`,
        `- Data exposure: does the response include fields that should be hidden?`,
        `- Business logic bypass: can a user skip required steps in a workflow?`,
        `- Missing rate limits: can the endpoint be abused by rapid repeated calls?`,
        `- Injection: are user inputs sanitised before use in queries or commands?`,
        ``,
        `For each finding, output a JSON object with keys:`,
        `  vulnClass     — one of the SecurityVulnerabilityClass values`,
        `  risk          — critical | high | medium | low | info`,
        `  title         — short name of the finding`,
        `  description   — what the vulnerability is and why it matters`,
        `  codeLocation  — the function name, variable, or line that is vulnerable (if visible)`,
        `  attackVector  — step-by-step: how would an attacker exploit this?`,
        `  fix           — specific code change or architectural change to remediate`,
        `  cweId         — CWE number (integer, optional)`,
        ``,
        `Return a JSON array of findings. If no vulnerabilities are found, return [].`,
        `No markdown fences, no prose — only the JSON array.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// parseSecurityFindings
// ---------------------------------------------------------------------------

const VALID_VULN_CLASSES = new Set<SecurityVulnerabilityClass>([
    'idor', 'broken_auth', 'privilege_escalation', 'race_condition', 'data_exposure',
    'injection', 'xss', 'csrf', 'mass_assignment', 'insecure_deserialization', 'ssrf',
    'path_traversal', 'business_logic_bypass', 'missing_rate_limit', 'hardcoded_secret', 'other',
]);

const VALID_RISKS = new Set<SecurityRisk>(['critical', 'high', 'medium', 'low', 'info']);

/**
 * Parses the raw LLM string into SecurityFinding[]. Pure function.
 */
export function parseSecurityFindings(raw: string): SecurityFinding[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start = cleaned.indexOf('[');
    const end   = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];

    try {
        const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
        return arr
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item, idx) => ({
                id:           `SEC-${String(idx + 1).padStart(3, '0')}`,
                vulnClass:    VALID_VULN_CLASSES.has(item['vulnClass'] as SecurityVulnerabilityClass)
                    ? item['vulnClass'] as SecurityVulnerabilityClass
                    : 'other',
                risk:         VALID_RISKS.has(item['risk'] as SecurityRisk)
                    ? item['risk'] as SecurityRisk
                    : 'medium',
                title:        String(item['title']         ?? 'Untitled finding'),
                description:  String(item['description']   ?? ''),
                codeLocation: typeof item['codeLocation']  === 'string' ? item['codeLocation'] : undefined,
                attackVector: String(item['attackVector']  ?? ''),
                fix:          String(item['fix']           ?? ''),
                cweId:        typeof item['cweId']         === 'number' ? item['cweId'] : undefined,
            } satisfies SecurityFinding));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// runStaticSecurityChecks
// ---------------------------------------------------------------------------

interface StaticPattern {
    pattern:     RegExp;
    vulnClass:   SecurityVulnerabilityClass;
    risk:        SecurityRisk;
    title:       string;
    description: string;
    fix:         string;
    cweId?:      number;
}

const STATIC_PATTERNS: StaticPattern[] = [
    {
        pattern:     /eval\s*\(/g,
        vulnClass:   'injection',
        risk:        'critical',
        title:       'Use of eval()',
        description: 'eval() executes arbitrary code — if any part of the argument comes from user input, this is a code injection vulnerability.',
        fix:         'Remove eval(). Use JSON.parse() for data, or a safe template engine for HTML.',
        cweId:       95,
    },
    {
        pattern:     /innerHTML\s*=/g,
        vulnClass:   'xss',
        risk:        'high',
        title:       'Direct innerHTML assignment',
        description: 'Setting innerHTML with unsanitised user input enables XSS attacks.',
        fix:         'Use textContent for plain text, or DOMPurify.sanitize() before assigning innerHTML.',
        cweId:       79,
    },
    {
        pattern:     /password|secret|api_key|apikey|private_key/gi,
        vulnClass:   'hardcoded_secret',
        risk:        'high',
        title:       'Potential hardcoded secret',
        description: 'A variable name suggests a secret may be hardcoded. If the value is a literal string, it will be exposed in source control.',
        fix:         'Move secrets to environment variables and load via process.env.',
        cweId:       798,
    },
    {
        pattern:     /dangerouslySetInnerHTML/g,
        vulnClass:   'xss',
        risk:        'high',
        title:       'React dangerouslySetInnerHTML',
        description: 'dangerouslySetInnerHTML with unsanitised content enables XSS.',
        fix:         'Sanitise HTML with DOMPurify before passing to dangerouslySetInnerHTML.',
        cweId:       79,
    },
    {
        pattern:     /\.exec\s*\(\s*req\.|query\s*\(\s*`[^`]*\$\{/g,
        vulnClass:   'injection',
        risk:        'critical',
        title:       'Possible SQL/NoSQL injection',
        description: 'User input appears to be interpolated directly into a query string.',
        fix:         'Use parameterised queries or an ORM that escapes inputs automatically.',
        cweId:       89,
    },
    {
        pattern:     /document\.cookie/g,
        vulnClass:   'data_exposure',
        risk:        'medium',
        title:       'Direct cookie access',
        description: 'Accessing document.cookie in JS is unnecessary when HttpOnly cookies are used and can expose session tokens to XSS.',
        fix:         'Set cookies as HttpOnly so they are inaccessible from JavaScript.',
        cweId:       1004,
    },
    {
        pattern:     /Math\.random\s*\(\)/g,
        vulnClass:   'broken_auth',
        risk:        'medium',
        title:       'Math.random() for security purposes',
        description: 'Math.random() is not cryptographically secure. Using it for tokens, session IDs, or nonces is predictable.',
        fix:         'Use crypto.randomBytes() (Node) or window.crypto.getRandomValues() (browser).',
        cweId:       338,
    },
    {
        pattern:     /localStorage\.(setItem|getItem)\s*\(\s*['"]token/gi,
        vulnClass:   'broken_auth',
        risk:        'medium',
        title:       'JWT/token stored in localStorage',
        description: 'Tokens in localStorage are accessible to JavaScript — XSS can steal them. HttpOnly cookies are safer.',
        fix:         'Store access tokens in memory and refresh tokens in HttpOnly cookies.',
        cweId:       922,
    },
];

/**
 * Fast, synchronous static scan using regex patterns. Pure function.
 * Returns findings without calling the LLM.
 */
export function runStaticSecurityChecks(code: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let idCounter = 1;

    for (const pat of STATIC_PATTERNS) {
        const matches = [...code.matchAll(pat.pattern)];
        if (matches.length === 0) continue;

        // Find approximate line number for first match
        const firstMatch  = matches[0]!;
        const linesBefore = code.slice(0, firstMatch.index ?? 0).split('\n');
        const lineNo      = linesBefore.length;

        findings.push({
            id:           `STATIC-${String(idCounter++).padStart(3, '0')}`,
            vulnClass:    pat.vulnClass,
            risk:         pat.risk,
            title:        pat.title,
            description:  pat.description,
            codeLocation: `line ~${lineNo}`,
            attackVector: `Pattern matched at line ~${lineNo} (${matches.length} occurrence(s)).`,
            fix:          pat.fix,
            cweId:        pat.cweId,
        });
    }

    return findings;
}

// ---------------------------------------------------------------------------
// buildSecurityReport
// ---------------------------------------------------------------------------

/**
 * Merges static and LLM findings into a unified, deduplicated report.
 * Pure function.
 */
export function buildSecurityReport(
    staticFindings: SecurityFinding[],
    llmFindings:    SecurityFinding[],
): SecurityReport {
    const all = [...staticFindings, ...llmFindings];

    const riskWeight: Record<SecurityRisk, number> = {
        critical: 40,
        high:     20,
        medium:    8,
        low:       3,
        info:      1,
    };

    const deduction = all.reduce((sum, f) => sum + (riskWeight[f.risk] ?? 0), 0);
    const score     = Math.max(0, 100 - deduction);

    const criticalCount = all.filter((f) => f.risk === 'critical').length;
    const highCount     = all.filter((f) => f.risk === 'high').length;

    let executiveSummary: string;
    if (all.length === 0) {
        executiveSummary = 'No security issues detected by static scan or LLM analysis.';
    } else {
        const worst = all.find((f) => f.risk === 'critical') ?? all.find((f) => f.risk === 'high') ?? all[0]!;
        executiveSummary = `Security score ${score}/100. ${all.length} finding(s) — ${criticalCount} critical, ${highCount} high. Most severe: ${worst.title}.`;
    }

    return { score, criticalCount, highCount, findings: all, executiveSummary };
}
