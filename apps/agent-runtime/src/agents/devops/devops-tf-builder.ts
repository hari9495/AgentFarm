// ============================================================================
// DEVOPS TERRAFORM BUILDER
// Terraform plan parsing, IaC code generation, security scanning.
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerraformChangeAction = 'create' | 'update' | 'destroy' | 'replace' | 'no-op' | 'read';

export interface TerraformChange {
    resource:    string;
    action:      TerraformChangeAction;
    provider:    string;
}

export interface TerraformPlanResult {
    toCreate:   number;
    toUpdate:   number;
    toDestroy:  number;
    toReplace:  number;
    changes:    TerraformChange[];
    hasDestroy: boolean;
    summary:    string;
    raw:        string;
}

export interface IacSecurityFinding {
    severity:    'critical' | 'high' | 'medium' | 'low';
    rule:        string;
    resource:    string;
    description: string;
    remediation: string;
}

export interface GeneratedTfFile {
    filename: string;
    content:  string;
}

// ---------------------------------------------------------------------------
// parseTerraformPlan
// ---------------------------------------------------------------------------

/**
 * Parses `terraform plan` stdout into a structured TerraformPlanResult.
 * Pure function.
 */
export function parseTerraformPlan(raw: string): TerraformPlanResult {
    const changes: TerraformChange[] = [];
    let toCreate = 0, toUpdate = 0, toDestroy = 0, toReplace = 0;

    // Match resource change lines: "  # aws_instance.web will be created"
    const lineRe = /# (\S+) will be (created|updated in-place|destroyed|replaced)/gi;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(raw)) !== null) {
        const resource = m[1] ?? '';
        const verb     = (m[2] ?? '').toLowerCase();
        const provider = resource.split('_')[0] ?? 'unknown';

        let action: TerraformChangeAction = 'no-op';
        if (verb.includes('created'))            { action = 'create';  toCreate++;  }
        else if (verb.includes('updated'))       { action = 'update';  toUpdate++;  }
        else if (verb.includes('destroyed'))     { action = 'destroy'; toDestroy++; }
        else if (verb.includes('replaced'))      { action = 'replace'; toReplace++; }

        changes.push({ resource, action, provider });
    }

    // Fall back to summary line: "Plan: 3 to add, 1 to change, 0 to destroy."
    if (changes.length === 0) {
        const summaryRe = /Plan:\s*(\d+) to add,\s*(\d+) to change,\s*(\d+) to destroy/i;
        const sm = summaryRe.exec(raw);
        if (sm) {
            toCreate  = parseInt(sm[1] ?? '0', 10);
            toUpdate  = parseInt(sm[2] ?? '0', 10);
            toDestroy = parseInt(sm[3] ?? '0', 10);
        }
    }

    const total   = toCreate + toUpdate + toDestroy + toReplace;
    const summary = total === 0
        ? 'No infrastructure changes detected.'
        : `${toCreate} to create, ${toUpdate} to update, ${toDestroy} to destroy, ${toReplace} to replace.`;

    return { toCreate, toUpdate, toDestroy, toReplace, changes, hasDestroy: toDestroy + toReplace > 0, summary, raw };
}

// ---------------------------------------------------------------------------
// buildTfGeneratePrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt that asks the model to generate Terraform HCL for a described
 * infrastructure requirement. Pure function.
 */
export function buildTfGeneratePrompt(params: {
    description:  string;
    provider:     string;   // aws | gcp | azure | digitalocean
    region?:      string;
    environment?: string;   // dev | staging | prod
    existing?:    string;   // snippet of existing .tf for context
}): string {
    return [
        `You are a senior DevOps/Infrastructure engineer writing production-grade Terraform HCL.`,
        ``,
        `Provider: ${params.provider}`,
        `Region: ${params.region ?? 'us-east-1'}`,
        `Environment: ${params.environment ?? 'dev'}`,
        ``,
        `Requirement:`,
        params.description,
        ...(params.existing ? [`\nExisting infrastructure context:\n\`\`\`hcl\n${params.existing.slice(0, 2000)}\n\`\`\``] : []),
        ``,
        `Generate complete, valid Terraform HCL. Include:`,
        `  - Required provider block with version constraints`,
        `  - All resources needed to fulfil the requirement`,
        `  - Output blocks for key resource attributes`,
        `  - Variable blocks for configurable values`,
        `  - Sensible tags (Name, Environment, ManagedBy=terraform)`,
        ``,
        `Return a JSON array where each element has:`,
        `  filename  — e.g. "main.tf", "variables.tf", "outputs.tf"`,
        `  content   — the HCL content as a string`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

/**
 * Parses the LLM's JSON output into GeneratedTfFile[]. Pure function.
 */
export function parseTfGenerateOutput(raw: string): GeneratedTfFile[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    try {
        const items = JSON.parse(cleaned.slice(start, end + 1)) as Array<{ filename?: unknown; content?: unknown }>;
        return items
            .filter((i) => typeof i.filename === 'string' && typeof i.content === 'string')
            .map((i)  => ({ filename: i.filename as string, content: i.content as string }));
    } catch { return []; }
}

// ---------------------------------------------------------------------------
// buildIacSecurityPrompt
// ---------------------------------------------------------------------------

/**
 * Adversarial IaC security review prompt. Pure function.
 */
export function buildIacSecurityPrompt(tfContent: string, provider: string): string {
    return [
        `You are a cloud security engineer reviewing Terraform code for security vulnerabilities.`,
        `Provider: ${provider}`,
        ``,
        `Terraform code to review:`,
        '```hcl',
        tfContent.slice(0, 4000),
        '```',
        ``,
        `Check for:`,
        `  - Overly permissive IAM roles/policies (wildcard actions or resources)`,
        `  - Public S3 buckets, storage accounts, or GCS buckets`,
        `  - Security groups open to 0.0.0.0/0 on sensitive ports`,
        `  - Unencrypted storage (EBS, RDS, S3)`,
        `  - Missing MFA enforcement`,
        `  - Hardcoded secrets or credentials`,
        `  - Missing audit logging (CloudTrail, GCP audit logs)`,
        `  - Resources without resource-based deletion protection`,
        ``,
        `Return a JSON array of findings, each with:`,
        `  severity     — critical | high | medium | low`,
        `  rule         — short rule name (e.g. "s3-public-acl")`,
        `  resource     — Terraform resource identifier`,
        `  description  — what the vulnerability is (one sentence)`,
        `  remediation  — specific HCL fix (one sentence)`,
        ``,
        `Return [] if no issues found. No markdown fences, no prose.`,
    ].join('\n');
}

/**
 * Parses LLM security findings. Pure function.
 */
export function parseIacSecurityFindings(raw: string): IacSecurityFinding[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    try {
        const items = JSON.parse(cleaned.slice(start, end + 1)) as Array<Partial<IacSecurityFinding>>;
        return items.filter((i) => typeof i.severity === 'string' && typeof i.rule === 'string') as IacSecurityFinding[];
    } catch { return []; }
}

// ---------------------------------------------------------------------------
// summariseTfPlan
// ---------------------------------------------------------------------------

/**
 * Scores a Terraform plan 0–100 (100 = safe, no destroys or replaces).
 * Pure function.
 */
export function summariseTfPlan(plan: TerraformPlanResult): { score: number; riskLevel: 'low' | 'medium' | 'high' } {
    const score = Math.max(0, 100 - plan.toDestroy * 30 - plan.toReplace * 20 - plan.toUpdate * 5);
    const riskLevel: 'low' | 'medium' | 'high' =
        plan.toDestroy > 0 || plan.toReplace > 0 ? 'high'
        : plan.toUpdate  > 3                     ? 'medium'
        : 'low';
    return { score, riskLevel };
}
