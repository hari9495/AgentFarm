// ============================================================================
// DEVOPS SECRET MANAGER
//
// CLI command builders and parsers for:
//   - Kubernetes secret rotation (kubectl)
//   - HashiCorp Vault secret rotation
//   - AWS Secrets Manager rotation
//   - cert-manager TLS certificate renewal
//
// Pure builders / parsers — no network I/O.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecretBackend = 'kubernetes' | 'vault' | 'aws_secrets_manager' | 'cert_manager';

export interface SecretRotationResult {
    backend:      SecretBackend;
    secretName:   string;
    namespace?:   string;
    ok:           boolean;
    newVersion?:  string;
    expiresAt?:   string;   // ISO timestamp
    output:       string;
    summary:      string;
}

export interface CertRenewalResult {
    certName:       string;
    namespace:      string;
    ok:             boolean;
    notBefore?:     string;
    notAfter?:      string;
    daysRemaining?: number;
    output:         string;
    summary:        string;
}

export interface K8sSecretInfo {
    name:       string;
    namespace:  string;
    type:       string;
    createdAt:  string;
    dataKeys:   string[];
}

// ---------------------------------------------------------------------------
// Kubernetes secret commands
// ---------------------------------------------------------------------------

/**
 * Build `kubectl create secret generic` args for creating/updating a secret.
 * Uses --dry-run=client | kubectl apply to patch existing secrets idempotently.
 */
export function buildK8sSecretApplyArgs(params: {
    name:       string;
    namespace?: string;
    data:       Record<string, string>;   // key → base64-encoded value
    secretType?: string;                  // default: Opaque
}): string[] {
    const args = [
        'kubectl', 'create', 'secret', 'generic',
        params.name,
        '--namespace', params.namespace ?? 'default',
        '--dry-run=client',
        '-o', 'yaml',
    ];
    for (const [k, v] of Object.entries(params.data)) {
        args.push(`--from-literal=${k}=${v}`);
    }
    if (params.secretType) args.push(`--type=${params.secretType}`);
    // Caller must pipe output to: kubectl apply -f -
    return args;
}

/** Build `kubectl delete secret` args. */
export function buildK8sDeleteSecretArgs(name: string, namespace = 'default'): string[] {
    return ['kubectl', 'delete', 'secret', name, '--namespace', namespace, '--ignore-not-found'];
}

/** Build `kubectl get secret` args to retrieve current secret metadata. */
export function buildK8sGetSecretArgs(name: string, namespace = 'default'): string[] {
    return ['kubectl', 'get', 'secret', name, '--namespace', namespace, '-o', 'json'];
}

/** Build `kubectl annotate secret` args — useful for tagging rotation timestamp. */
export function buildK8sAnnotateSecretArgs(params: {
    name:       string;
    namespace?: string;
    annotations: Record<string, string>;
}): string[] {
    const args = ['kubectl', 'annotate', 'secret', params.name, '--namespace', params.namespace ?? 'default', '--overwrite'];
    for (const [k, v] of Object.entries(params.annotations)) {
        args.push(`${k}=${v}`);
    }
    return args;
}

/** Parse `kubectl get secret -o json` output into typed metadata. */
export function parseK8sSecretInfo(raw: string): K8sSecretInfo | null {
    try {
        const json = JSON.parse(raw) as {
            metadata?: { name?: string; namespace?: string; creationTimestamp?: string };
            type?:     string;
            data?:     Record<string, string>;
        };
        return {
            name:      json.metadata?.name ?? '',
            namespace: json.metadata?.namespace ?? 'default',
            type:      json.type ?? 'Opaque',
            createdAt: json.metadata?.creationTimestamp ?? '',
            dataKeys:  Object.keys(json.data ?? {}),
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// cert-manager certificate commands
// ---------------------------------------------------------------------------

/** Build `kubectl get certificate` args to inspect cert status. */
export function buildCertGetArgs(certName: string, namespace = 'default'): string[] {
    return ['kubectl', 'get', 'certificate', certName, '--namespace', namespace, '-o', 'json'];
}

/**
 * Build `kubectl annotate certificate` args to trigger a manual renewal.
 * cert-manager watches for cert-manager.io/issuer-group annotation changes.
 */
export function buildCertRenewArgs(certName: string, namespace = 'default'): string[] {
    // The cmctl tool is the preferred way; fall back to annotation approach
    return [
        'cmctl', 'renew', certName,
        '--namespace', namespace,
    ];
}

/** Build `cmctl status certificate` args. */
export function buildCertStatusArgs(certName: string, namespace = 'default'): string[] {
    return ['cmctl', 'status', 'certificate', certName, '--namespace', namespace];
}

export function parseCertInfo(raw: string): CertRenewalResult {
    try {
        const json = JSON.parse(raw) as {
            metadata?: { name?: string; namespace?: string };
            status?: {
                notBefore?: string;
                notAfter?:  string;
                conditions?: Array<{ type: string; status: string; message?: string }>;
            };
        };
        const name      = json.metadata?.name ?? '';
        const namespace = json.metadata?.namespace ?? 'default';
        const notAfter  = json.status?.notAfter;
        const notBefore = json.status?.notBefore;
        const readyCond = (json.status?.conditions ?? []).find((c) => c.type === 'Ready');
        const ok        = readyCond?.status === 'True';

        let daysRemaining: number | undefined;
        if (notAfter) {
            const ms = new Date(notAfter).getTime() - Date.now();
            daysRemaining = Math.floor(ms / (1000 * 60 * 60 * 24));
        }

        return {
            certName:  name, namespace, ok,
            notBefore, notAfter, daysRemaining,
            output:    raw.slice(0, 500),
            summary:   ok
                ? `Certificate "${name}" is ready.${daysRemaining !== undefined ? ` Expires in ${daysRemaining} day(s).` : ''}`
                : `Certificate "${name}" is NOT ready: ${readyCond?.message ?? 'unknown reason'}`,
        };
    } catch {
        return { certName: '', namespace: 'default', ok: false, output: raw.slice(0, 200), summary: 'Failed to parse certificate info' };
    }
}

// ---------------------------------------------------------------------------
// HashiCorp Vault secret commands
// ---------------------------------------------------------------------------

/** Build `vault kv put` args — write/rotate a KV secret. */
export function buildVaultKvPutArgs(params: {
    path:    string;   // e.g. secret/myapp/db
    data:    Record<string, string>;
    mount?:  string;   // default: secret
}): string[] {
    const mount = params.mount ?? 'secret';
    const kvPath = params.path.startsWith(mount + '/') ? params.path : `${mount}/${params.path}`;
    const args   = ['vault', 'kv', 'put', kvPath];
    for (const [k, v] of Object.entries(params.data)) {
        args.push(`${k}=${v}`);
    }
    return args;
}

/** Build `vault kv get` args — retrieve current version metadata. */
export function buildVaultKvGetArgs(path: string, mount = 'secret'): string[] {
    const kvPath = path.startsWith(mount + '/') ? path : `${mount}/${path}`;
    return ['vault', 'kv', 'get', '-format=json', kvPath];
}

/** Build `vault kv metadata get` args — get version history. */
export function buildVaultKvMetadataArgs(path: string, mount = 'secret'): string[] {
    const kvPath = path.startsWith(mount + '/') ? path : `${mount}/${path}`;
    return ['vault', 'kv', 'metadata', 'get', '-format=json', kvPath];
}

/** Build `vault token renew` args. */
export function buildVaultTokenRenewArgs(increment = '24h'): string[] {
    return ['vault', 'token', 'renew', `-increment=${increment}`];
}

export interface VaultSecretMetadata {
    version:    number;
    createdAt:  string;
    deletedAt?: string;
    destroyed?: boolean;
}

export function parseVaultKvGetOutput(raw: string): VaultSecretMetadata | null {
    try {
        const json = JSON.parse(raw) as {
            data?: { metadata?: { version?: number; created_time?: string; deletion_time?: string; destroyed?: boolean } };
        };
        const meta = json.data?.metadata;
        if (!meta) return null;
        return {
            version:   meta.version ?? 0,
            createdAt: meta.created_time ?? '',
            deletedAt: meta.deletion_time || undefined,
            destroyed: meta.destroyed ?? false,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// AWS Secrets Manager commands
// ---------------------------------------------------------------------------

/** Build `aws secretsmanager rotate-secret` args. */
export function buildAwsRotateSecretArgs(params: {
    secretId:             string;
    rotationLambdaArn?:   string;
    rotationDays?:        number;
    region?:              string;
}): string[] {
    const args = ['aws', 'secretsmanager', 'rotate-secret', '--secret-id', params.secretId];
    if (params.rotationLambdaArn) args.push('--rotation-lambda-arn', params.rotationLambdaArn);
    if (params.rotationDays)      args.push('--rotation-rules', `AutomaticallyAfterDays=${params.rotationDays}`);
    if (params.region)            args.push('--region', params.region);
    args.push('--output', 'json');
    return args;
}

/** Build `aws secretsmanager put-secret-value` args — manual rotation. */
export function buildAwsPutSecretValueArgs(params: {
    secretId:    string;
    secretValue: string;   // JSON string or plain string
    region?:     string;
}): string[] {
    const args = [
        'aws', 'secretsmanager', 'put-secret-value',
        '--secret-id',    params.secretId,
        '--secret-string', params.secretValue,
    ];
    if (params.region) args.push('--region', params.region);
    args.push('--output', 'json');
    return args;
}

/** Build `aws secretsmanager describe-secret` args. */
export function buildAwsDescribeSecretArgs(secretId: string, region?: string): string[] {
    const args = ['aws', 'secretsmanager', 'describe-secret', '--secret-id', secretId, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export interface AwsSecretMetadata {
    name:              string;
    arn:               string;
    lastChangedDate?:  string;
    lastRotatedDate?:  string;
    rotationEnabled:   boolean;
    nextRotationDate?: string;
    versionIds:        string[];
}

export function parseAwsDescribeSecretOutput(raw: string): AwsSecretMetadata | null {
    try {
        const json = JSON.parse(raw) as {
            Name?:            string;
            ARN?:             string;
            LastChangedDate?: number;
            LastRotatedDate?: number;
            RotationEnabled?: boolean;
            NextRotationDate?: number;
            VersionIdsToStages?: Record<string, string[]>;
        };
        return {
            name:             json.Name ?? '',
            arn:              json.ARN ?? '',
            lastChangedDate:  json.LastChangedDate ? new Date(json.LastChangedDate * 1000).toISOString() : undefined,
            lastRotatedDate:  json.LastRotatedDate ? new Date(json.LastRotatedDate * 1000).toISOString() : undefined,
            rotationEnabled:  json.RotationEnabled ?? false,
            nextRotationDate: json.NextRotationDate ? new Date(json.NextRotationDate * 1000).toISOString() : undefined,
            versionIds:       Object.keys(json.VersionIdsToStages ?? {}),
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Rotation report formatter
// ---------------------------------------------------------------------------

export function formatRotationReport(results: SecretRotationResult[]): string {
    const ok    = results.filter((r) => r.ok).length;
    const fail  = results.length - ok;
    const icon  = fail > 0 ? '⚠️' : '✅';
    const lines: string[] = [
        `## Secret Rotation Report — ${icon} ${ok}/${results.length} Rotated`,
        ``,
    ];

    for (const r of results) {
        const rowIcon = r.ok ? '✅' : '❌';
        lines.push(`### ${rowIcon} ${r.secretName} (${r.backend})`);
        if (r.namespace) lines.push(`**Namespace:** ${r.namespace}`);
        if (r.newVersion) lines.push(`**New version:** ${r.newVersion}`);
        if (r.expiresAt) lines.push(`**Expires:** ${r.expiresAt}`);
        lines.push(r.summary, '');
    }

    return lines.join('\n');
}

export function formatCertReport(results: CertRenewalResult[]): string {
    const ok   = results.filter((r) => r.ok).length;
    const icon = ok === results.length ? '✅' : '⚠️';
    const lines: string[] = [
        `## Certificate Renewal Report — ${icon} ${ok}/${results.length} Ready`,
        ``,
        `| Certificate | Namespace | Status | Expires | Days Left |`,
        `|-------------|-----------|--------|---------|-----------|`,
    ];

    for (const r of results) {
        const status = r.ok ? '✅ Ready' : '❌ Not Ready';
        const exp    = r.notAfter ? r.notAfter.slice(0, 10) : '—';
        const days   = r.daysRemaining !== undefined ? String(r.daysRemaining) : '—';
        lines.push(`| ${r.certName} | ${r.namespace} | ${status} | ${exp} | ${days} |`);
    }
    lines.push('');
    return lines.join('\n');
}
