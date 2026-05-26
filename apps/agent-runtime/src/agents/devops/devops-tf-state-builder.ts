// ============================================================================
// DEVOPS TERRAFORM STATE BUILDER
//
// CLI command builders and output parsers for Terraform state management:
//   terraform state mv     — rename / move a resource address
//   terraform state rm     — detach a resource from state (no real destroy)
//   terraform import       — import real infra into state
//   terraform state pull   — dump current state as JSON
//   terraform state push   — overwrite remote state with a local file
//   terraform state unlock — force-unlock a stuck state lock
//   terraform state list   — list all resource addresses in state
//
// All operations work on the standard Terraform CLI; no plugins required.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TfStateResource {
    address:   string;
    type:      string;
    name:      string;
    module?:   string;
}

export interface TfStateFile {
    version:         number;
    terraform_version: string;
    resources:       TfStateResource[];
    serial:          number;
    lineage:         string;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

/**
 * Move a resource from one address to another in Terraform state.
 * Safe: does not change real infrastructure.
 * Common use: rename a resource, move into/out of a module.
 */
export function buildTfStateMvArgs(params: {
    source:      string;   // e.g. aws_instance.web
    destination: string;   // e.g. module.ec2.aws_instance.web
    tfDir?:      string;
    backup?:     boolean;  // create .backup file (default: true)
}): string[] {
    const args = ['terraform', 'state', 'mv', '-no-color'];
    if (params.backup === false) args.push('-backup=-');
    args.push(params.source, params.destination);
    return args;
}

/**
 * Remove a resource from Terraform state without destroying it in the cloud.
 * Common use: stop managing a resource with Terraform, or pre-import cleanup.
 */
export function buildTfStateRmArgs(params: {
    address:  string;    // e.g. aws_security_group.legacy
    tfDir?:   string;
    dryRun?:  boolean;   // -dry-run: show what would be removed, no change
    backup?:  boolean;
}): string[] {
    const args = ['terraform', 'state', 'rm', '-no-color'];
    if (params.dryRun)           args.push('-dry-run');
    if (params.backup === false) args.push('-backup=-');
    args.push(params.address);
    return args;
}

/**
 * Import an existing real-world resource into Terraform state.
 * Common use: adopting manually-created infra into IaC, recovering from drift.
 */
export function buildTfImportArgs(params: {
    address:    string;  // Terraform resource address e.g. aws_vpc.main
    id:         string;  // Cloud resource ID e.g. vpc-0a1b2c3d
    tfDir?:     string;
    varFile?:   string;
}): string[] {
    const args = ['terraform', 'import', '-no-color', '-input=false'];
    if (params.varFile) args.push(`-var-file=${params.varFile}`);
    args.push(params.address, params.id);
    return args;
}

/**
 * Pull the current Terraform state file from the remote backend.
 * Outputs raw JSON that parseTfStatePull() can parse.
 */
export function buildTfStatePullArgs(): string[] {
    return ['terraform', 'state', 'pull'];
}

/**
 * Push a local state file to the remote backend.
 * HIGH RISK — can overwrite remote state.
 */
export function buildTfStatePushArgs(localStatePath: string, force = false): string[] {
    const args = ['terraform', 'state', 'push'];
    if (force) args.push('-force');
    args.push(localStatePath);
    return args;
}

/**
 * Force-unlock a stuck Terraform state lock.
 * Requires the LOCK_ID from the error message.
 */
export function buildTfStateUnlockArgs(lockId: string, force = true): string[] {
    const args = ['terraform', 'force-unlock', '-no-color'];
    if (force) args.push('-force');
    args.push(lockId);
    return args;
}

/**
 * List all resources currently tracked in Terraform state.
 */
export function buildTfStateListArgs(address?: string): string[] {
    const args = ['terraform', 'state', 'list'];
    if (address) args.push(address);
    return args;
}

/**
 * Show a specific resource in state (full attributes).
 */
export function buildTfStateShowArgs(address: string): string[] {
    return ['terraform', 'state', 'show', '-no-color', address];
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

/**
 * Parse `terraform state list` output into resource addresses.
 */
export function parseTfStateList(raw: string): string[] {
    return raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Parse `terraform state pull` JSON output into a structured state file.
 */
export function parseTfStatePull(raw: string): TfStateFile | null {
    try {
        const json = JSON.parse(raw) as {
            version?: number;
            terraform_version?: string;
            serial?: number;
            lineage?: string;
            resources?: Array<{
                module?: string;
                mode?: string;
                type?: string;
                name?: string;
                provider?: string;
                instances?: unknown[];
            }>;
        };
        const resources: TfStateResource[] = (json.resources ?? [])
            .filter((r) => r.mode !== 'data')  // exclude data sources
            .map((r) => ({
                address: [r.module, r.type, r.name].filter(Boolean).join('.'),
                type:    r.type ?? '',
                name:    r.name ?? '',
                module:  r.module,
            }));
        return {
            version:           json.version ?? 0,
            terraform_version: json.terraform_version ?? '',
            serial:            json.serial ?? 0,
            lineage:           json.lineage ?? '',
            resources,
        };
    } catch {
        return null;
    }
}

/**
 * Extract a lock ID from a Terraform state lock error message.
 * Matches: "Lock Info: ... ID: <uuid>"
 */
export function extractLockId(errorOutput: string): string | null {
    const match = errorOutput.match(/ID:\s+([a-f0-9-]{36})/i);
    return match?.[1] ?? null;
}

/**
 * Build an LLM prompt that explains the state operation to perform and asks
 * for the correct Terraform addresses. Used when the user describes what they
 * want to do in plain English.
 */
export function buildTfStateOpPrompt(params: {
    userIntent:   string;   // e.g. "move the RDS instance into the database module"
    stateList:    string[]; // current terraform state list output
    operation:    'mv' | 'rm' | 'import';
}): string {
    return [
        `You are a Terraform state expert. Given the user's intent and the current state resources, determine the exact terraform state ${params.operation} command(s) needed.`,
        ``,
        `User intent: ${params.userIntent}`,
        ``,
        `Current state resources (terraform state list):`,
        params.stateList.slice(0, 200).map((r) => `  ${r}`).join('\n'),
        ``,
        `Requirements:`,
        `  - For 'mv': provide source and destination addresses`,
        `  - For 'rm': provide the exact address to remove`,
        `  - For 'import': provide the resource address AND the real cloud resource ID`,
        `  - If multiple operations are needed, list them in order`,
        `  - Only use addresses that appear in the state list above (for source)`,
        ``,
        `Return JSON: { "operations": [{ "source": string, "destination"?: string, "id"?: string }], "explanation": string }`,
    ].join('\n');
}

export interface TfStateOpPlan {
    operations:  Array<{ source: string; destination?: string; id?: string }>;
    explanation: string;
}

export function parseTfStateOpPlan(raw: string): TfStateOpPlan {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const json    = JSON.parse(cleaned) as Partial<TfStateOpPlan>;
        return {
            operations:  Array.isArray(json.operations) ? json.operations as TfStateOpPlan['operations'] : [],
            explanation: typeof json.explanation === 'string' ? json.explanation : '',
        };
    } catch {
        return { operations: [], explanation: raw.slice(0, 200) };
    }
}
