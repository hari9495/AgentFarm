// Prevents the support agent from leaking proprietary information or being
// jailbroken by customers.
//
// Three responsibilities:
//   1. detectPromptInjection()         — catches jailbreak / role-override attempts
//   2. detectProprietaryInfoRequest()  — catches requests for code, secrets, schema, etc.
//   3. sanitizeResponseForCustomer()   — strips code, paths, stack traces from outgoing text

// ── Prompt injection detection ────────────────────────────────────────────

const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
    // "ignore / forget / disregard your instructions" variants
    // Use .{0,30} so multi-word phrases like "ignore all previous rules" still match
    /\bignore\b.{0,30}\b(instructions?|rules?|guidelines?|system\s+prompt)\b/i,
    /\bdisregard\b.{0,30}\b(instructions?|rules?|guidelines?)\b/i,
    /\bforget\b.{0,30}\b(instructions?|rules?|training|guidelines?)\b/i,
    /\boverride\b.{0,30}\b(instructions?|rules?|guidelines?|system)\b/i,
    // Role-switch attacks
    /pretend\s+(you\s+are|to\s+be)/i,
    /act\s+as\s+(if\s+you\s+(are|were)\s+)?(a\s+|an\s+)?(different|another|uncensored|unrestricted|general|free)\b/i,
    /\broleplay\s+as\b/i,
    /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:general|unrestricted|uncensored|different|free)\s+/i,
    // Explicit jailbreak keywords
    /\bDAN\b/,
    /\bdo\s+anything\s+now\b/i,
    /\bjailbreak\b/i,
    /\bdeveloper\s+mode\b/i,
    /\bgod\s+mode\b/i,
    /\bunrestricted\s+mode\b/i,
    // System prompt extraction
    /(?:show|reveal|print|display|output|repeat|tell\s+me)\s+(?:me\s+)?(?:your|the)\s+system\s+prompt/i,
    /what(?:'s|\s+is)\s+(?:your|the)\s+system\s+prompt/i,
    /repeat\s+(?:everything|all)\s+(?:above|from\s+above|before|previously)/i,
    /print\s+(?:your\s+)?(?:instructions?|directives?|system\s+rules)\b/i,
    // Fake role-tag injection (e.g. "[SYSTEM]: ignore above")
    /\[system\]/i,
    /\[admin\]\s*:/i,
    /\[override\]/i,
    // "From now on" framing
    /from\s+now\s+on\s+(?:you|ignore|forget|act|stop)/i,
    // Translation / summarisation tricks to extract the prompt
    // Use .{0,30} to handle "translate your previous instructions" (multiple modifiers)
    /(?:translate|summarize|encode|decode)\b.{0,30}\b(?:instructions?|system\s+prompt|rules)\b/i,
];

export function detectPromptInjection(text: string): boolean {
    return INJECTION_PATTERNS.some((p) => p.test(text));
}

// ── Proprietary info detection ────────────────────────────────────────────

const DISCLOSURE_PATTERNS: ReadonlyArray<RegExp> = [
    // Source code
    /show\s+(me\s+)?(the\s+)?(source\s+)?code/i,
    /share\s+(the\s+)?(source\s+)?code/i,
    /give\s+(me\s+)?(your\s+)?(source|implementation|codebase)/i,
    /what\s+(does\s+)?(the\s+)?source\s+code/i,
    /how\s+is\s+.{0,60}implemented/i,
    /show\s+(me\s+)?how\s+(it|this|that|your\s+\w+)\s+works\s+internally/i,
    /internal\s+implementation/i,
    /read\s+(the\s+)?(file|source|code)/i,
    /list\s+(all\s+)?(the\s+)?files/i,
    /grep\s+(the\s+)?(code|files|source)/i,
    /cat\s+\S*\.(ts|js|json|prisma|env)/i,  // \S* allows `cat .env` (dot-file with no prefix)
    // Database / schema
    /database\s+schema/i,
    /prisma\s+schema/i,
    /show\s+(me\s+)?(the\s+)?schema/i,
    /what\s+(tables?|models?|columns?)\s+(do\s+you\s+have|are\s+(in|there))/i,
    // Credentials / secrets
    /api\s+(key|secret|token)/i,
    /environment\s+variables?/i,
    /\benv\s+vars?\b/i,
    /secret\s+(key|token|value)/i,
    /(?:^|\s)\.env(?:\s|$)/i,  // matches `.env` as a standalone word without relying on \b near a period
    // Internal API surface
    /internal\s+api/i,
    /list\s+(your\s+)?(api\s+)?endpoints?/i,
    /what\s+endpoints?\s+(do\s+you|are\s+there)/i,
    // Architecture
    /internal\s+architecture/i,
    /how\s+(?:does\s+)?(?:your|the)\s+(system|platform|infrastructure)\s+works?\s+internally/i,
    /system\s+design\s+(document|overview)/i,
    // Config files
    /config(uration)?\s+file/i,
    /show\s+(me\s+)?(the\s+)?config/i,
    // Cross-tenant fishing
    /other\s+(customers?|tenants?|users?)\s+(data|info(rmation)?)/i,
    /all\s+(tenants?|customers?|users?|accounts?)/i,
    /list\s+(all\s+)?tenants?/i,
];

export function detectProprietaryInfoRequest(text: string): boolean {
    return DISCLOSURE_PATTERNS.some((p) => p.test(text));
}

// ── Sanitisation ───────────────────────────────────────────────────────────

// Fenced code blocks  ``` … ```
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
// Inline code longer than 10 chars (short snippets like `null` are fine)
const LONG_INLINE_CODE_RE = /`[^`\n]{10,}`/g;
// Internal monorepo path segments
const INTERNAL_PATH_RE = /\b(?:apps|packages|services|src)\/[\w\-./]+\.(?:ts|js|json|prisma)\b/g;
// Stack-trace lines containing internal paths
const STACK_TRACE_LINE_RE = /^\s+at .+(?:apps|packages|services|src)\/.+$/gm;
// Env var assignments that might carry real values
const ENV_VALUE_RE =
    /\b(?:ANTHROPIC|OPENAI|DATABASE|REDIS|SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|API_KEY)\w*\s*[=:]\s*\S+/gi;

export function sanitizeResponseForCustomer(text: string): string {
    return text
        .replace(CODE_BLOCK_RE, '[code omitted]')
        .replace(LONG_INLINE_CODE_RE, '[internal reference]')
        .replace(INTERNAL_PATH_RE, '[internal path]')
        .replace(STACK_TRACE_LINE_RE, '')
        .replace(ENV_VALUE_RE, '[redacted]')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Canned refusals ────────────────────────────────────────────────────────

export const INJECTION_REFUSAL = {
    chat: `I can only assist with AgentFarm platform support. Attempts to alter my instructions or role are not permitted.`,
    voice: `I can only assist with platform support. Please describe your issue and I will help you.`,
} as const;

export const DISCLOSURE_REFUSAL = {
    chat: `I'm here to help resolve platform issues, but I'm not able to share internal source code, implementation details, database schemas, API keys, environment variables, or information about other tenants. If something is broken or behaving unexpectedly, please describe the problem and I'll diagnose and fix it for you.`,
    voice: `I can help fix platform issues, but I cannot share internal code or implementation details. Please describe the problem you are experiencing and I will investigate it for you.`,
} as const;
