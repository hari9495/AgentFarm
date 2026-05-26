// ============================================================================
// DEVOPS CLOUD CLI BUILDER
//
// Pure command builders and output parsers for AWS CLI, Azure CLI, and
// Google Cloud SDK (gcloud). Covers the read-heavy operations a DevOps
// engineer runs many times a day.
//
// Safety: destructive operations (terminate, delete, destroy) require an
// explicit allow_destructive: true flag in the payload.  All builders
// default to --output json / --format json for parseable output.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface CloudCommandResult {
    provider:  CloudProvider;
    service:   string;
    operation: string;
    rawJson:   string;
    parsed:    unknown;
    ok:        boolean;
    error?:    string;
}

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

/** Destructive AWS CLI sub-commands that require explicit opt-in. */
const AWS_DESTRUCTIVE_OPERATIONS = new Set([
    'terminate-instances', 'delete-cluster', 'delete-nodegroup',
    'delete-bucket', 'delete-object', 'delete-secret',
    'delete-stack', 'delete-role', 'delete-policy',
    'deregister-image', 'release-address',
]);

/** Destructive Azure CLI sub-commands. */
const AZ_DESTRUCTIVE_OPERATIONS = new Set([
    'delete', 'remove', 'terminate', 'stop',
]);

/** Destructive gcloud sub-commands. */
const GCLOUD_DESTRUCTIVE_OPERATIONS = new Set([
    'delete', 'remove', 'terminate', 'stop', 'destroy',
]);

export function isDestructiveAws(operation: string): boolean {
    return AWS_DESTRUCTIVE_OPERATIONS.has(operation.toLowerCase());
}
export function isDestructiveAz(subcommand: string): boolean {
    return AZ_DESTRUCTIVE_OPERATIONS.has(subcommand.toLowerCase());
}
export function isDestructiveGcloud(subcommand: string): boolean {
    return GCLOUD_DESTRUCTIVE_OPERATIONS.has(subcommand.toLowerCase());
}

// ---------------------------------------------------------------------------
// AWS CLI command builder
// ---------------------------------------------------------------------------

/**
 * Build an `aws <service> <operation>` command.
 *
 * @param service   - AWS service slug (e.g. 'ec2', 's3', 'iam', 'eks', 'rds')
 * @param operation - Operation (e.g. 'describe-instances', 'list-clusters')
 * @param flags     - Extra flags as key→value map (e.g. { '--region': 'us-east-1' })
 * @param args      - Positional arguments appended after all flags
 */
export function buildAwsCliArgs(params: {
    service:    string;
    operation:  string;
    flags?:     Record<string, string>;
    args?:      string[];
    region?:    string;
    profile?:   string;
}): string[] {
    const cmd: string[] = ['aws', params.service, params.operation, '--output', 'json'];
    if (params.region)  cmd.push('--region', params.region);
    if (params.profile) cmd.push('--profile', params.profile);
    for (const [k, v] of Object.entries(params.flags ?? {})) {
        cmd.push(k, v);
    }
    cmd.push(...(params.args ?? []));
    return cmd;
}

// Pre-built AWS builders for the most common operations

/** aws ec2 describe-instances (optionally filtered by tag or id) */
export function buildAwsDescribeInstancesArgs(params?: {
    instanceIds?: string[];
    filters?:     Array<{ name: string; values: string[] }>;
    region?:      string;
}): string[] {
    const args: string[] = ['aws', 'ec2', 'describe-instances', '--output', 'json'];
    if (params?.region) args.push('--region', params.region);
    if (params?.instanceIds?.length) {
        args.push('--instance-ids', ...params.instanceIds);
    }
    if (params?.filters?.length) {
        const filterStr = params.filters
            .map((f) => `Name=${f.name},Values=${f.values.join(',')}`)
            .join(' ');
        args.push('--filters', filterStr);
    }
    return args;
}

/** aws eks list-clusters / describe-cluster */
export function buildAwsEksArgs(operation: 'list-clusters' | 'describe-cluster', clusterName?: string, region?: string): string[] {
    const args = ['aws', 'eks', operation, '--output', 'json'];
    if (region) args.push('--region', region);
    if (clusterName && operation === 'describe-cluster') args.push('--name', clusterName);
    return args;
}

/** aws s3 ls [s3://bucket[/prefix]] */
export function buildAwsS3LsArgs(path?: string, recursive = false): string[] {
    const args = ['aws', 's3', 'ls'];
    if (path) args.push(path);
    if (recursive) args.push('--recursive');
    return args;
}

/** aws iam list-roles / list-policies / get-role */
export function buildAwsIamArgs(operation: string, extra?: Record<string, string>): string[] {
    const args = ['aws', 'iam', operation, '--output', 'json'];
    for (const [k, v] of Object.entries(extra ?? {})) args.push(k, v);
    return args;
}

/** aws rds describe-db-instances */
export function buildAwsRdsListArgs(region?: string): string[] {
    const args = ['aws', 'rds', 'describe-db-instances', '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

/** aws cloudformation describe-stacks */
export function buildAwsCfnDescribeArgs(stackName?: string, region?: string): string[] {
    const args = ['aws', 'cloudformation', 'describe-stacks', '--output', 'json'];
    if (region)    args.push('--region', region);
    if (stackName) args.push('--stack-name', stackName);
    return args;
}

/** aws acm list-certificates / describe-certificate */
export function buildAwsAcmArgs(operation: 'list-certificates' | 'describe-certificate', certArn?: string, region?: string): string[] {
    const args = ['aws', 'acm', operation, '--output', 'json'];
    if (region) args.push('--region', region);
    if (certArn && operation === 'describe-certificate') args.push('--certificate-arn', certArn);
    return args;
}

// ---------------------------------------------------------------------------
// Azure CLI command builder
// ---------------------------------------------------------------------------

/**
 * Build an `az <group> <subcommand>` command.
 */
export function buildAzCliArgs(params: {
    group:       string;    // e.g. 'vm', 'aks', 'storage account', 'network'
    subcommand:  string;    // e.g. 'list', 'show', 'create'
    flags?:      Record<string, string>;
    args?:       string[];
    subscription?: string;
}): string[] {
    const cmd: string[] = ['az', ...params.group.split(' '), params.subcommand, '--output', 'json'];
    if (params.subscription) cmd.push('--subscription', params.subscription);
    for (const [k, v] of Object.entries(params.flags ?? {})) {
        cmd.push(k, v);
    }
    cmd.push(...(params.args ?? []));
    return cmd;
}

/** az aks list / show */
export function buildAzAksArgs(operation: 'list' | 'show', params?: {
    resourceGroup?: string;
    clusterName?:   string;
    subscription?:  string;
}): string[] {
    const args = ['az', 'aks', operation, '--output', 'json'];
    if (params?.subscription)  args.push('--subscription', params.subscription);
    if (params?.resourceGroup) args.push('--resource-group', params.resourceGroup);
    if (params?.clusterName && operation === 'show') args.push('--name', params.clusterName);
    return args;
}

/** az vm list / show / start / stop */
export function buildAzVmArgs(operation: 'list' | 'show' | 'start' | 'stop', params?: {
    resourceGroup?: string;
    vmName?:        string;
    subscription?:  string;
}): string[] {
    const args = ['az', 'vm', operation, '--output', 'json'];
    if (params?.subscription)  args.push('--subscription', params.subscription);
    if (params?.resourceGroup) args.push('--resource-group', params.resourceGroup);
    if (params?.vmName)        args.push('--name', params.vmName);
    return args;
}

/** az storage account list */
export function buildAzStorageListArgs(resourceGroup?: string, subscription?: string): string[] {
    const args = ['az', 'storage', 'account', 'list', '--output', 'json'];
    if (subscription)  args.push('--subscription', subscription);
    if (resourceGroup) args.push('--resource-group', resourceGroup);
    return args;
}

/** az network dns record-set list */
export function buildAzDnsListArgs(zone: string, resourceGroup: string, subscription?: string): string[] {
    const args = ['az', 'network', 'dns', 'record-set', 'list',
        '--zone-name', zone, '--resource-group', resourceGroup, '--output', 'json'];
    if (subscription) args.push('--subscription', subscription);
    return args;
}

// ---------------------------------------------------------------------------
// Google Cloud SDK command builder
// ---------------------------------------------------------------------------

/**
 * Build a `gcloud <component> <subcommand>` command.
 */
export function buildGcloudArgs(params: {
    component:  string;    // e.g. 'compute', 'container', 'storage', 'iam'
    subcommand: string;    // e.g. 'instances list', 'clusters list'
    flags?:     Record<string, string>;
    args?:      string[];
    project?:   string;
    zone?:      string;
    region?:    string;
}): string[] {
    const cmd: string[] = ['gcloud', params.component, ...params.subcommand.split(' '), '--format=json'];
    if (params.project) cmd.push('--project', params.project);
    if (params.zone)    cmd.push('--zone',    params.zone);
    if (params.region)  cmd.push('--region',  params.region);
    for (const [k, v] of Object.entries(params.flags ?? {})) {
        cmd.push(k, v);
    }
    cmd.push(...(params.args ?? []));
    return cmd;
}

/** gcloud compute instances list */
export function buildGcloudComputeListArgs(project?: string, zone?: string): string[] {
    const args = ['gcloud', 'compute', 'instances', 'list', '--format=json'];
    if (project) args.push('--project', project);
    if (zone)    args.push('--zones', zone);
    return args;
}

/** gcloud container clusters list / describe */
export function buildGcloudGkeArgs(operation: 'list' | 'describe', params?: {
    clusterName?: string;
    project?:     string;
    zone?:        string;
    region?:      string;
}): string[] {
    const args = ['gcloud', 'container', 'clusters', operation, '--format=json'];
    if (params?.project) args.push('--project', params.project);
    if (params?.zone)    args.push('--zone',    params.zone);
    if (params?.region)  args.push('--region',  params.region);
    if (params?.clusterName && operation === 'describe') args.push(params.clusterName);
    return args;
}

/** gcloud storage ls gs://[bucket] */
export function buildGcloudStorageLsArgs(bucket?: string, project?: string): string[] {
    const args = ['gcloud', 'storage', 'ls'];
    if (bucket) args.push(bucket);
    if (project) args.push('--project', project);
    return args;
}

/** gcloud dns record-sets list */
export function buildGcloudDnsListArgs(zone: string, project?: string): string[] {
    const args = ['gcloud', 'dns', 'record-sets', 'list', '--zone', zone, '--format=json'];
    if (project) args.push('--project', project);
    return args;
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

/**
 * Parse JSON output from any cloud CLI command.
 * Returns the parsed object (array or object) and a formatted summary.
 */
export function parseCloudCliOutput(raw: string, provider: CloudProvider, service: string, operation: string): CloudCommandResult {
    try {
        const parsed = JSON.parse(raw) as unknown;
        return { provider, service, operation, rawJson: raw, parsed, ok: true };
    } catch {
        return {
            provider, service, operation,
            rawJson: raw.slice(0, 2000),
            parsed:  null,
            ok:      false,
            error:   `Failed to parse ${provider} CLI output as JSON`,
        };
    }
}

/**
 * Summarise a cloud CLI result to a short human-readable string.
 */
export function summariseCloudResult(result: CloudCommandResult): string {
    if (!result.ok) return `${result.provider} ${result.service} ${result.operation} failed: ${result.error ?? 'unknown error'}`;
    if (Array.isArray(result.parsed)) {
        return `${result.provider} ${result.service} ${result.operation}: ${result.parsed.length} result(s)`;
    }
    return `${result.provider} ${result.service} ${result.operation}: completed`;
}
