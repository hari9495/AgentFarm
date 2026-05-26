// ============================================================================
// DEVOPS HELM BUILDER
//
// Pure utility functions for building Helm CLI command arrays and parsing
// Helm output. No side effects — all functions are pure builders / parsers.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HelmReleaseStatus =
    | 'deployed'
    | 'failed'
    | 'pending-install'
    | 'pending-upgrade'
    | 'pending-rollback'
    | 'uninstalling'
    | 'superseded'
    | 'unknown';

export interface HelmRelease {
    name:       string;
    namespace:  string;
    revision:   number;
    status:     HelmReleaseStatus;
    chart:      string;
    appVersion: string;
    updatedAt:  string;
}

export interface HelmDiffResult {
    hasChanges:    boolean;
    addedCount:    number;
    removedCount:  number;
    modifiedCount: number;
    summary:       string;
    rawDiff:       string;
}

export interface HelmChartFile {
    filename: string;
    content:  string;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

/**
 * Build the `helm upgrade --install` (idempotent install/upgrade) args array.
 * Using upgrade --install is preferred over separate install/upgrade because it
 * is idempotent — safe to call on both first-time installs and re-deploys.
 */
export function buildHelmInstallArgs(params: {
    releaseName:     string;
    chart:           string;
    namespace?:      string;
    version?:        string;
    valuesFiles?:    string[];
    setValues?:      Record<string, string>;
    createNamespace?: boolean;
    atomic?:         boolean;       // roll back automatically on failure
    wait?:           boolean;       // wait until all pods are ready
    timeout?:        string;        // default: 5m0s
    dryRun?:         boolean;
    reuseValues?:    boolean;       // carry over previous release values
}): string[] {
    const args: string[] = ['helm', 'upgrade', '--install', params.releaseName, params.chart];

    if (params.namespace)       args.push('--namespace', params.namespace);
    if (params.version)         args.push('--version', params.version);
    if (params.createNamespace) args.push('--create-namespace');
    if (params.atomic)          args.push('--atomic');
    if (params.wait ?? true)    args.push('--wait');
    if (params.timeout)         args.push('--timeout', params.timeout);
    if (params.dryRun)          args.push('--dry-run');
    if (params.reuseValues)     args.push('--reuse-values');

    for (const vf of params.valuesFiles ?? []) {
        args.push('--values', vf);
    }
    for (const [k, v] of Object.entries(params.setValues ?? {})) {
        args.push('--set', `${k}=${v}`);
    }

    args.push('--output', 'json');
    return args;
}

/** Build `helm rollback` args. Omitting revision rolls back to previous. */
export function buildHelmRollbackArgs(params: {
    releaseName: string;
    namespace?:  string;
    revision?:   number;
    wait?:       boolean;
    timeout?:    string;
}): string[] {
    const args: string[] = ['helm', 'rollback', params.releaseName];
    if (params.revision !== undefined) args.push(String(params.revision));
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.wait ?? true) args.push('--wait');
    if (params.timeout) args.push('--timeout', params.timeout);
    return args;
}

/**
 * Build `helm diff upgrade` args.
 * Requires the helm-diff plugin: `helm plugin install https://github.com/databus23/helm-diff`
 */
export function buildHelmDiffArgs(params: {
    releaseName:  string;
    chart:        string;
    namespace?:   string;
    version?:     string;
    valuesFiles?: string[];
    setValues?:   Record<string, string>;
}): string[] {
    const args: string[] = ['helm', 'diff', 'upgrade', params.releaseName, params.chart];
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.version)   args.push('--version', params.version);
    for (const vf of params.valuesFiles ?? []) {
        args.push('--values', vf);
    }
    for (const [k, v] of Object.entries(params.setValues ?? {})) {
        args.push('--set', `${k}=${v}`);
    }
    args.push('--no-color');
    return args;
}

/** `helm list --namespace X --output json` */
export function buildHelmListArgs(namespace?: string): string[] {
    const args = ['helm', 'list', '--output', 'json'];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

/** `helm status RELEASE --namespace X --output json` */
export function buildHelmStatusArgs(releaseName: string, namespace?: string): string[] {
    const args = ['helm', 'status', releaseName, '--output', 'json'];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

/** `helm uninstall RELEASE --namespace X` */
export function buildHelmUninstallArgs(releaseName: string, namespace?: string): string[] {
    const args = ['helm', 'uninstall', releaseName];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

/** Parse `helm status --output json` output into a typed HelmRelease. */
export function parseHelmStatus(raw: string): HelmRelease | null {
    try {
        const json = JSON.parse(raw) as Record<string, unknown>;
        const info = json['info'] as Record<string, unknown> | undefined;
        const chart = json['chart'] as Record<string, unknown> | undefined;
        const metadata = chart?.['metadata'] as Record<string, unknown> | undefined;
        return {
            name:       String(json['name']              ?? ''),
            namespace:  String(json['namespace']         ?? 'default'),
            revision:   Number(json['version']           ?? 0),
            status:     (String(info?.['status'] ?? 'unknown')) as HelmReleaseStatus,
            chart:      String(metadata?.['name']        ?? ''),
            appVersion: String(metadata?.['appVersion']  ?? ''),
            updatedAt:  String(info?.['last_deployed']   ?? ''),
        };
    } catch {
        return null;
    }
}

/** Parse `helm diff upgrade` coloured output into a structured diff result. */
export function parseHelmDiff(raw: string): HelmDiffResult {
    if (!raw.trim()) {
        return { hasChanges: false, addedCount: 0, removedCount: 0, modifiedCount: 0, summary: 'No changes detected.', rawDiff: '' };
    }

    const lines        = raw.split('\n');
    let addedCount     = 0;
    let removedCount   = 0;
    let modifiedCount  = 0;

    for (const line of lines) {
        const stripped = line.replace(/\x1b\[[0-9;]*m/g, ''); // strip ANSI codes
        if (stripped.startsWith('+') && !stripped.startsWith('+++')) addedCount++;
        if (stripped.startsWith('-') && !stripped.startsWith('---')) removedCount++;
    }

    // Count modified resources (lines matching "has changed:")
    modifiedCount = (raw.match(/has changed:/gi) ?? []).length;

    const hasChanges = addedCount > 0 || removedCount > 0 || modifiedCount > 0;
    const summary    = hasChanges
        ? `${addedCount} line(s) added, ${removedCount} line(s) removed, ${modifiedCount} resource(s) modified.`
        : 'No changes detected.';

    return { hasChanges, addedCount, removedCount, modifiedCount, summary, rawDiff: raw.slice(0, 5000) };
}

// ---------------------------------------------------------------------------
// LLM prompt builders for Helm chart generation
// ---------------------------------------------------------------------------

/** Build the LLM prompt for generating a complete Helm chart from a description. */
export function buildHelmChartPrompt(params: {
    appName:     string;
    description: string;
    image:       string;
    port:        number;
    replicas:    number;
    namespace:   string;
    environment: string;
    ingress:     boolean;
    hpa?:        boolean;    // Horizontal Pod Autoscaler
    pdb?:        boolean;    // Pod Disruption Budget
}): string {
    return [
        `Generate a complete, production-ready Helm chart for a Kubernetes application.`,
        ``,
        `Application: ${params.appName}`,
        `Description: ${params.description}`,
        `Image: ${params.image}`,
        `Port: ${params.port}`,
        `Default replicas: ${params.replicas}`,
        `Namespace: ${params.namespace}`,
        `Environment: ${params.environment}`,
        `Include Ingress: ${params.ingress}`,
        params.hpa ? `Include HorizontalPodAutoscaler: yes` : '',
        params.pdb ? `Include PodDisruptionBudget: yes` : '',
        ``,
        `Return a JSON array of objects, each with { "filename": string, "content": string }.`,
        `Required files:`,
        `  - Chart.yaml (apiVersion v2, type application)`,
        `  - values.yaml (image repo/tag, service type, resources, ingress config)`,
        `  - templates/deployment.yaml (with resource limits, liveness/readiness probes)`,
        `  - templates/service.yaml`,
        `  - templates/serviceaccount.yaml`,
        params.ingress ? `  - templates/ingress.yaml` : '',
        params.hpa    ? `  - templates/hpa.yaml` : '',
        params.pdb    ? `  - templates/pdb.yaml` : '',
        `  - templates/_helpers.tpl`,
        `  - templates/NOTES.txt`,
        `  - .helmignore`,
        ``,
        `Best practices:`,
        `  - Use {{ .Release.Name }}-{{ .Chart.Name }} naming`,
        `  - Set resource requests and limits`,
        `  - Include proper labels (app.kubernetes.io/*)`,
        `  - Use imagePullPolicy: IfNotPresent`,
        `  - Configure liveness probe on /healthz, readiness on /ready`,
        `  - Return ONLY the JSON array, no markdown code fences.`,
    ].filter(Boolean).join('\n');
}

/** Parse the LLM output for Helm chart generation into typed file objects. */
export function parseHelmChartOutput(raw: string): HelmChartFile[] {
    try {
        // Strip markdown code fences if present
        const cleaned = raw
            .replace(/^```(?:json)?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item['filename'] === 'string' && typeof item['content'] === 'string')
            .map((item) => ({ filename: item['filename'] as string, content: item['content'] as string }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Environment-specific values file builder
// ---------------------------------------------------------------------------

/** Generate a Helm values override file content for a specific environment. */
export function buildEnvValuesContent(params: {
    environment: string;
    replicas:    number;
    imageTag:    string;
    ingressHost?: string;
    resources?:  { cpu: string; memory: string };
    extraValues?: Record<string, unknown>;
}): string {
    const { environment, replicas, imageTag, ingressHost, resources, extraValues } = params;
    const lines: string[] = [
        `# Values for environment: ${environment}`,
        `# Generated by DevOps Agent`,
        ``,
        `replicaCount: ${replicas}`,
        ``,
        `image:`,
        `  tag: "${imageTag}"`,
        ``,
    ];

    if (resources) {
        lines.push(
            `resources:`,
            `  requests:`,
            `    cpu: "${resources.cpu}"`,
            `    memory: "${resources.memory}"`,
            `  limits:`,
            `    cpu: "${resources.cpu}"`,
            `    memory: "${resources.memory}"`,
            ``,
        );
    }

    if (ingressHost) {
        lines.push(
            `ingress:`,
            `  enabled: true`,
            `  hosts:`,
            `    - host: ${ingressHost}`,
            `      paths:`,
            `        - path: /`,
            `          pathType: Prefix`,
            ``,
        );
    }

    if (extraValues) {
        for (const [k, v] of Object.entries(extraValues)) {
            lines.push(`${k}: ${JSON.stringify(v)}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
