// ============================================================================
// SAST Semantic Analyzer — Sprint 15 Tester Agent Gap 3 Fix
//
// Supplements the 30+ regex rules in workspace_sast_scan with LLM-based
// semantic reasoning.  Regex cannot catch:
//   - Authentication/authorization bypass (logic flow, not syntax)
//   - Missing authorization checks on specific routes
//   - Race conditions / TOCTOU (time-of-check-time-of-use)
//   - Insecure Direct Object References (IDOR) — missing ownership assertions
//   - Business logic errors (over-/under-privileged operations)
//   - Unsafe trust assumptions about sanitised input lower in the call stack
//
// This module is intentionally stateless and side-effect-free outside of
// the optional HTTP call to callSastLlmIfConfigured().
//
// Env vars (optional — feature degrades gracefully when absent):
//   SAST_LLM_ENDPOINT  — OpenAI-compatible chat completions URL
//   SAST_LLM_API_KEY   — Bearer token for the endpoint
//   SAST_LLM_MODEL     — Model name (default: gpt-4o-mini)
// ============================================================================

export type SastLlmFinding = {
    rule: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    file: string;
    line: number;
    message: string;
    engine: 'llm_semantic';
};

// ---------------------------------------------------------------------------
// buildSastSemanticPrompt
// ---------------------------------------------------------------------------
// Produces an LLM prompt that asks for logic-level security vulnerabilities
// in a code snippet.  The prompt is structured so the model MUST respond with
// a JSON array (makes parseSastSemanticResponse reliable).
// ---------------------------------------------------------------------------

export function buildSastSemanticPrompt(fileContent: string, filename: string): string {
    const MAX_CHARS = 6_000; // keep within typical context windows
    const snippet = fileContent.length > MAX_CHARS
        ? fileContent.slice(0, MAX_CHARS) + '\n// [file truncated for analysis]'
        : fileContent;

    return [
        'You are a senior application security engineer performing a static code review.',
        `File: ${filename}`,
        '',
        'Review the code below for LOGIC-LEVEL security vulnerabilities that regex patterns cannot detect:',
        '  1. Authentication bypass — code paths that skip identity verification',
        '  2. Missing authorization checks — operations that do not verify the caller has permission',
        '  3. IDOR (Insecure Direct Object Reference) — resource fetched by ID without ownership check',
        '  4. Race conditions / TOCTOU — check-then-use patterns with exploitable windows',
        '  5. Privilege escalation — a low-privilege path that can reach high-privilege state',
        '  6. Unsafe trust of sanitised input — downstream code trusts a flag/field set upstream without re-validating',
        '  7. Business logic errors — amounts, counters, or state transitions that can be abused',
        '',
        'Do NOT report issues already covered by common regex rules:',
        '  - eval(), innerHTML, SQL template literals, hardcoded secrets, weak crypto — skip these.',
        '',
        'Respond ONLY with a JSON array.  Use this exact schema:',
        '[',
        '  {',
        '    "rule": "short-kebab-id",',
        '    "severity": "low" | "medium" | "high" | "critical",',
        '    "line": <1-based line number or 0 if not applicable>,',
        '    "message": "concise description of the vulnerability and why it matters"',
        '  }',
        ']',
        'If no logic vulnerabilities are found respond with an empty array: []',
        '',
        '```',
        snippet,
        '```',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// parseSastSemanticResponse
// ---------------------------------------------------------------------------
// Tolerantly parses the raw LLM response string into SastLlmFinding[].
// Returns an empty array if the response is not valid JSON or malformed.
// ---------------------------------------------------------------------------

export function parseSastSemanticResponse(rawResponse: string, filename: string): SastLlmFinding[] {
    const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

    // Try to extract a JSON array from the response (LLMs sometimes wrap in prose)
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) return [];

    const findings: SastLlmFinding[] = [];
    for (const item of parsed) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        const rule = typeof rec['rule'] === 'string' ? rec['rule'] : 'llm-finding';
        const rawSev = typeof rec['severity'] === 'string' ? rec['severity'].toLowerCase() : 'medium';
        const severity = (VALID_SEVERITIES.has(rawSev) ? rawSev : 'medium') as SastLlmFinding['severity'];
        const line = typeof rec['line'] === 'number' ? rec['line'] : 0;
        const message = typeof rec['message'] === 'string' ? rec['message'] : String(rec['message'] ?? '');
        if (!message) continue;
        findings.push({ rule, severity, file: filename, line, message, engine: 'llm_semantic' });
    }
    return findings;
}

// ---------------------------------------------------------------------------
// callSastLlmIfConfigured
// ---------------------------------------------------------------------------
// Calls the configured OpenAI-compatible LLM endpoint for semantic SAST.
// Returns null (graceful no-op) if the required env vars are absent.
// Never throws — always returns null on network/parse error.
// ---------------------------------------------------------------------------

export async function callSastLlmIfConfigured(
    prompt: string,
    filename: string,
): Promise<SastLlmFinding[] | null> {
    const endpoint = process.env['SAST_LLM_ENDPOINT'] ?? '';
    const apiKey = process.env['SAST_LLM_API_KEY'] ?? '';
    const model = process.env['SAST_LLM_MODEL'] ?? 'gpt-4o-mini';

    if (!endpoint || !apiKey) return null;

    const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: 'text' },
    });

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body,
            signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) return null;

        const json = await res.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? '';
        return parseSastSemanticResponse(content, filename);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// selectFilesForSemanticAnalysis
// ---------------------------------------------------------------------------
// Picks the top N files most likely to contain logic vulnerabilities.
// Prioritises files with auth/route/controller/service naming patterns and
// those that are large enough to contain meaningful logic.
// ---------------------------------------------------------------------------

const AUTH_PATTERNS = /auth|permission|role|policy|access|session|token|jwt|guard|middleware|controller|service|route|handler/i;

export function selectFilesForSemanticAnalysis(files: string[], topN = 5): string[] {
    const scored = files.map((f) => {
        const base = f.split(/[/\\]/).pop() ?? '';
        const score = AUTH_PATTERNS.test(base) ? 2 : 1;
        return { f, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((x) => x.f);
}
