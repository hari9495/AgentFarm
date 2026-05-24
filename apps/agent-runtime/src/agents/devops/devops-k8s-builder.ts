// ============================================================================
// DEVOPS KUBERNETES + DOCKER BUILDER
// K8s manifest generation, log analysis, Docker helpers.
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface K8sManifestFile {
    filename: string;
    content:  string;   // YAML
    kind:     string;   // Deployment | Service | Ingress | …
}

export interface K8sRolloutStatus {
    deployment:  string;
    namespace:   string;
    ready:       boolean;
    desired:     number;
    available:   number;
    message:     string;
}

export interface DockerBuildParams {
    imageName:   string;
    tag:         string;
    registry?:   string;
    dockerfile?: string;
    buildArgs?:  Record<string, string>;
}

// ---------------------------------------------------------------------------
// buildK8sGeneratePrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt to generate Kubernetes YAML manifests from a description.
 * Pure function.
 */
export function buildK8sGeneratePrompt(params: {
    description: string;
    appName:     string;
    image:       string;
    namespace?:  string;
    port?:       number;
    replicas?:   number;
    ingress?:    boolean;
    environment?: string;
}): string {
    return [
        `You are a senior Kubernetes/DevOps engineer generating production-ready manifests.`,
        ``,
        `App: ${params.appName}`,
        `Image: ${params.image}`,
        `Namespace: ${params.namespace ?? 'default'}`,
        `Port: ${params.port ?? 8080}`,
        `Replicas: ${params.replicas ?? 2}`,
        `Include Ingress: ${params.ingress ? 'yes' : 'no'}`,
        `Environment: ${params.environment ?? 'production'}`,
        ``,
        `Requirement:`,
        params.description,
        ``,
        `Generate complete Kubernetes YAML manifests. Include:`,
        `  - Deployment with resource requests/limits, liveness and readiness probes`,
        `  - Service (ClusterIP or LoadBalancer as appropriate)`,
        `  - HorizontalPodAutoscaler`,
        `  - Ingress (if requested)`,
        `  - ConfigMap for non-secret config`,
        `  - Appropriate labels: app, version, environment, managed-by=kubectl`,
        ``,
        `Return a JSON array where each element has:`,
        `  filename  — e.g. "deployment.yaml", "service.yaml"`,
        `  content   — the YAML as a string`,
        `  kind      — Kubernetes resource kind`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].join('\n');
}

/**
 * Parses the LLM manifest output into K8sManifestFile[]. Pure function.
 */
export function parseK8sManifests(raw: string): K8sManifestFile[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    try {
        const items = JSON.parse(cleaned.slice(start, end + 1)) as Array<{
            filename?: unknown; content?: unknown; kind?: unknown;
        }>;
        return items
            .filter((i) => typeof i.filename === 'string' && typeof i.content === 'string')
            .map((i)  => ({
                filename: i.filename as string,
                content:  i.content  as string,
                kind:     typeof i.kind === 'string' ? i.kind : 'Unknown',
            }));
    } catch { return []; }
}

// ---------------------------------------------------------------------------
// parseK8sRolloutStatus
// ---------------------------------------------------------------------------

/**
 * Parses `kubectl rollout status` or `kubectl get deployment` output.
 * Pure function.
 */
export function parseK8sRolloutStatus(
    raw:        string,
    deployment: string,
    namespace:  string,
): K8sRolloutStatus {
    const readyRe    = /(\d+)\/(\d+) up-to-date/i;
    const availRe    = /(\d+) available/i;
    const successRe  = /successfully rolled out/i;

    const readyMatch = readyRe.exec(raw);
    const availMatch = availRe.exec(raw);
    const ready      = successRe.test(raw);

    return {
        deployment,
        namespace,
        ready,
        desired:   readyMatch ? parseInt(readyMatch[2] ?? '0', 10) : 0,
        available: availMatch ? parseInt(availMatch[1] ?? '0', 10) : 0,
        message:   raw.split('\n').find((l) => l.trim().length > 0) ?? raw.slice(0, 120),
    };
}

// ---------------------------------------------------------------------------
// buildK8sLogAnalysisPrompt
// ---------------------------------------------------------------------------

/**
 * LLM prompt for structured log analysis and root-cause identification.
 * Pure function.
 */
export function buildK8sLogAnalysisPrompt(logs: string, appName: string): string {
    return [
        `You are a senior SRE analysing Kubernetes pod logs for the service "${appName}".`,
        ``,
        `Logs (last 200 lines):`,
        '```',
        logs.slice(-6000),
        '```',
        ``,
        `Identify:`,
        `  1. Error patterns and their frequency`,
        `  2. Most likely root cause`,
        `  3. Services or dependencies that appear unhealthy`,
        `  4. Concrete remediation steps`,
        ``,
        `Return a JSON object with:`,
        `  errorCount     — number of ERROR/FATAL lines`,
        `  rootCause      — one-sentence root cause`,
        `  affectedDeps   — string[] of affected services/databases`,
        `  remediations   — string[] of specific fix steps`,
        `  severity       — critical | high | medium | low`,
        ``,
        `No markdown fences, no prose — only the JSON object.`,
    ].join('\n');
}

/**
 * Parses log analysis LLM response. Pure function.
 */
export function parseLogAnalysis(raw: string): {
    errorCount:   number;
    rootCause:    string;
    affectedDeps: string[];
    remediations: string[];
    severity:     'critical' | 'high' | 'medium' | 'low';
} {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');
    const fallback = { errorCount: 0, rootCause: '', affectedDeps: [], remediations: [], severity: 'low' as const };
    if (start === -1 || end === -1) return fallback;
    try {
        const p = JSON.parse(cleaned.slice(start, end + 1)) as typeof fallback;
        return {
            errorCount:   typeof p.errorCount === 'number' ? p.errorCount : 0,
            rootCause:    typeof p.rootCause  === 'string' ? p.rootCause  : '',
            affectedDeps: Array.isArray(p.affectedDeps) ? p.affectedDeps as string[] : [],
            remediations: Array.isArray(p.remediations) ? p.remediations as string[] : [],
            severity:     (['critical', 'high', 'medium', 'low'] as const).includes(p.severity)
                ? p.severity : 'low',
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Docker helpers
// ---------------------------------------------------------------------------

/**
 * Builds the docker build + push command sequence. Pure function.
 */
export function buildDockerCommands(params: DockerBuildParams): {
    buildCmd: string[];
    tagCmd?:  string[];
    pushCmd:  string[];
    fullImage: string;
} {
    const tag       = params.tag || 'latest';
    const baseImage = `${params.imageName}:${tag}`;
    const fullImage = params.registry ? `${params.registry}/${baseImage}` : baseImage;
    const dockerfile = params.dockerfile ?? 'Dockerfile';

    const buildArgs = Object.entries(params.buildArgs ?? {})
        .flatMap(([k, v]) => ['--build-arg', `${k}=${v}`]);

    const buildCmd = ['docker', 'build', '-f', dockerfile, '-t', baseImage, ...buildArgs, '.'];
    const tagCmd   = params.registry ? ['docker', 'tag', baseImage, fullImage] : undefined;
    const pushCmd  = ['docker', 'push', fullImage];

    return { buildCmd, tagCmd, pushCmd, fullImage };
}

/**
 * Builds a prompt for Dockerfile generation. Pure function.
 */
export function buildDockerfilePrompt(params: {
    appType:     string;   // 'node' | 'python' | 'go' | 'java'
    description: string;
    port?:       number;
    hasTests?:   boolean;
}): string {
    return [
        `You are a senior DevOps engineer writing an optimised, secure Dockerfile.`,
        ``,
        `App type: ${params.appType}`,
        `Port: ${params.port ?? 8080}`,
        `Description: ${params.description}`,
        ``,
        `Requirements:`,
        `  - Multi-stage build to minimise final image size`,
        `  - Non-root user for runtime stage`,
        `  - Layer caching optimised (copy dependencies first, then source)`,
        `  - HEALTHCHECK instruction`,
        `  - No secrets or credentials in the image`,
        `  - .dockerignore compatible (assume node_modules, .git excluded)`,
        ``,
        `Return ONLY the Dockerfile content — no explanation, no fences.`,
    ].join('\n');
}
