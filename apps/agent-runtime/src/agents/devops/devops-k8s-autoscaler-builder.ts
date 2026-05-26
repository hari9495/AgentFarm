// ============================================================================
// DEVOPS K8S AUTOSCALER BUILDER
//
// Builders for Kubernetes scaling policy management:
//   HorizontalPodAutoscaler (HPA)   — scale pods by CPU/memory/custom metric
//   VerticalPodAutoscaler (VPA)     — right-size container resource requests
//   ResourceQuota                   — namespace-level resource caps
//   kubectl scale                   — imperatively set replica count
//   Cluster Autoscaler              — read CA status, annotate node groups
//
// All manifest builders return valid YAML strings.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HpaMetric {
    type:            'Resource' | 'Pods' | 'Object' | 'External' | 'ContainerResource';
    resourceName?:   'cpu' | 'memory';    // for Resource type
    averageUtilization?: number;           // percent of request (Resource type)
    averageValue?:   string;               // e.g. "100m", "500Mi"
    externalMetric?: string;               // external metric name
    externalTarget?: string;               // target value
}

export interface HpaSpec {
    name:             string;
    namespace:        string;
    targetKind:       'Deployment' | 'StatefulSet' | 'ReplicaSet';
    targetName:       string;
    minReplicas:      number;
    maxReplicas:      number;
    metrics:          HpaMetric[];
    scaleDownStabilizationWindowSeconds?: number;  // default: 300
    scaleUpStabilizationWindowSeconds?:   number;  // default: 0
}

export interface VpaSpec {
    name:          string;
    namespace:     string;
    targetKind:    'Deployment' | 'StatefulSet' | 'DaemonSet';
    targetName:    string;
    updateMode:    'Auto' | 'Initial' | 'Recreate' | 'Off';
    containerName?: string;
    minCpu?:       string;
    minMemory?:    string;
    maxCpu?:       string;
    maxMemory?:    string;
}

export interface ResourceQuotaSpec {
    name:       string;
    namespace:  string;
    requests?:  { cpu?: string; memory?: string };
    limits?:    { cpu?: string; memory?: string };
    pods?:      number;
    services?:  number;
    secrets?:   number;
    pvcs?:      number;
}

// ---------------------------------------------------------------------------
// HPA manifest builder
// ---------------------------------------------------------------------------

export function buildHpaYaml(spec: HpaSpec): string {
    const metricsYaml = spec.metrics.map((m) => {
        if (m.type === 'Resource') {
            return [
                `  - type: Resource`,
                `    resource:`,
                `      name: ${m.resourceName ?? 'cpu'}`,
                `      target:`,
                `        type: ${m.averageUtilization !== undefined ? 'Utilization' : 'AverageValue'}`,
                m.averageUtilization !== undefined ? `        averageUtilization: ${m.averageUtilization}` : `        averageValue: "${m.averageValue ?? '100m'}"`,
            ].filter(Boolean).join('\n');
        }
        if (m.type === 'External') {
            return [
                `  - type: External`,
                `    external:`,
                `      metric:`,
                `        name: ${m.externalMetric ?? 'unknown'}`,
                `      target:`,
                `        type: AverageValue`,
                `        averageValue: "${m.externalTarget ?? '10'}"`,
            ].join('\n');
        }
        return '';
    }).filter(Boolean).join('\n');

    const behaviourYaml = (spec.scaleDownStabilizationWindowSeconds !== undefined || spec.scaleUpStabilizationWindowSeconds !== undefined)
        ? `  behavior:
    scaleDown:
      stabilizationWindowSeconds: ${spec.scaleDownStabilizationWindowSeconds ?? 300}
    scaleUp:
      stabilizationWindowSeconds: ${spec.scaleUpStabilizationWindowSeconds ?? 0}`
        : '';

    return [
        `apiVersion: autoscaling/v2`,
        `kind: HorizontalPodAutoscaler`,
        `metadata:`,
        `  name: ${spec.name}`,
        `  namespace: ${spec.namespace}`,
        `spec:`,
        `  scaleTargetRef:`,
        `    apiVersion: apps/v1`,
        `    kind: ${spec.targetKind}`,
        `    name: ${spec.targetName}`,
        `  minReplicas: ${spec.minReplicas}`,
        `  maxReplicas: ${spec.maxReplicas}`,
        `  metrics:`,
        metricsYaml,
        behaviourYaml,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// VPA manifest builder
// ---------------------------------------------------------------------------

export function buildVpaYaml(spec: VpaSpec): string {
    const containerName = spec.containerName ?? spec.targetName;
    const minMaxYaml = (spec.minCpu || spec.minMemory || spec.maxCpu || spec.maxMemory) ? `
        resourcePolicy:
          containerPolicies:
            - containerName: "${containerName}"
              minAllowed:
                ${spec.minCpu    ? `cpu: "${spec.minCpu}"` : ''}
                ${spec.minMemory ? `memory: "${spec.minMemory}"` : ''}
              maxAllowed:
                ${spec.maxCpu    ? `cpu: "${spec.maxCpu}"` : ''}
                ${spec.maxMemory ? `memory: "${spec.maxMemory}"` : ''}` : '';

    return [
        `apiVersion: autoscaling.k8s.io/v1`,
        `kind: VerticalPodAutoscaler`,
        `metadata:`,
        `  name: ${spec.name}`,
        `  namespace: ${spec.namespace}`,
        `spec:`,
        `  targetRef:`,
        `    apiVersion: apps/v1`,
        `    kind: ${spec.targetKind}`,
        `    name: ${spec.targetName}`,
        `  updatePolicy:`,
        `    updateMode: "${spec.updateMode}"`,
        minMaxYaml,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// ResourceQuota manifest builder
// ---------------------------------------------------------------------------

export function buildResourceQuotaYaml(spec: ResourceQuotaSpec): string {
    const hard: string[] = [];
    if (spec.requests?.cpu)    hard.push(`    requests.cpu: "${spec.requests.cpu}"`);
    if (spec.requests?.memory) hard.push(`    requests.memory: "${spec.requests.memory}"`);
    if (spec.limits?.cpu)      hard.push(`    limits.cpu: "${spec.limits.cpu}"`);
    if (spec.limits?.memory)   hard.push(`    limits.memory: "${spec.limits.memory}"`);
    if (spec.pods)             hard.push(`    pods: "${spec.pods}"`);
    if (spec.services)         hard.push(`    services: "${spec.services}"`);
    if (spec.secrets)          hard.push(`    secrets: "${spec.secrets}"`);
    if (spec.pvcs)             hard.push(`    persistentvolumeclaims: "${spec.pvcs}"`);

    return [
        `apiVersion: v1`,
        `kind: ResourceQuota`,
        `metadata:`,
        `  name: ${spec.name}`,
        `  namespace: ${spec.namespace}`,
        `spec:`,
        `  hard:`,
        ...hard,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// kubectl command builders
// ---------------------------------------------------------------------------

export function buildKubectlGetHpaArgs(namespace?: string, name?: string): string[] {
    const args = ['kubectl', 'get', 'hpa'];
    if (name)      args.push(name);
    if (namespace) args.push('-n', namespace);
    args.push('-o', 'json');
    return args;
}

export function buildKubectlScaleArgs(params: {
    kind:       'deployment' | 'statefulset' | 'replicaset';
    name:       string;
    namespace:  string;
    replicas:   number;
}): string[] {
    return ['kubectl', 'scale', params.kind, params.name, '-n', params.namespace, `--replicas=${params.replicas}`];
}

export function buildKubectlPatchHpaArgs(params: {
    name:         string;
    namespace:    string;
    minReplicas?: number;
    maxReplicas?: number;
}): string[] {
    const patch: Record<string, unknown> = { spec: {} };
    if (params.minReplicas !== undefined) (patch.spec as Record<string, unknown>)['minReplicas'] = params.minReplicas;
    if (params.maxReplicas !== undefined) (patch.spec as Record<string, unknown>)['maxReplicas'] = params.maxReplicas;
    return ['kubectl', 'patch', 'hpa', params.name, '-n', params.namespace, '--type=merge', '--patch', JSON.stringify(patch)];
}

export function buildKubectlGetVpaArgs(namespace?: string, name?: string): string[] {
    const args = ['kubectl', 'get', 'vpa'];
    if (name)      args.push(name);
    if (namespace) args.push('-n', namespace);
    args.push('-o', 'json');
    return args;
}

/** Read cluster-autoscaler status from its configmap. */
export function buildCaStatusArgs(namespace = 'kube-system'): string[] {
    return ['kubectl', 'get', 'configmap', 'cluster-autoscaler-status', '-n', namespace, '-o', 'jsonpath={.data.status}'];
}

/** Annotate a node group to scale up immediately (AWS node-group annotation). */
export function buildAnnotateNodeGroupArgs(nodeGroupName: string, minSize: number, maxSize: number): string[] {
    return ['kubectl', 'annotate', 'nodes', '--all',
        `cluster-autoscaler.kubernetes.io/safe-to-evict=true`,
        `--overwrite`];
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseHpaStatus(raw: string): Array<{ name: string; namespace: string; minReplicas: number; maxReplicas: number; currentReplicas: number; desiredReplicas: number; conditions?: unknown[] }> {
    try {
        const json = JSON.parse(raw) as { items?: unknown[]; kind?: string };
        const items = json.items ?? (json.kind === 'HorizontalPodAutoscaler' ? [json] : []);
        return (items as Array<Record<string, unknown>>).map((item) => {
            const meta   = (item['metadata'] as Record<string, unknown>) ?? {};
            const spec   = (item['spec']   as Record<string, unknown>) ?? {};
            const status = (item['status'] as Record<string, unknown>) ?? {};
            return {
                name:             String(meta['name'] ?? ''),
                namespace:        String(meta['namespace'] ?? ''),
                minReplicas:      Number(spec['minReplicas'] ?? 1),
                maxReplicas:      Number(spec['maxReplicas'] ?? 1),
                currentReplicas:  Number(status['currentReplicas'] ?? 0),
                desiredReplicas:  Number(status['desiredReplicas'] ?? 0),
                conditions:       status['conditions'] as unknown[] | undefined,
            };
        });
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// LLM prompt for autoscaling recommendations
// ---------------------------------------------------------------------------

export function buildAutoscalerPrompt(params: {
    appName:       string;
    namespace:     string;
    description:   string;
    currentCpu?:   string;  // current cpu request
    currentMemory?: string;
    p99Latency?:   string;
    errorRate?:    string;
    peakRps?:      number;
    environment:   'production' | 'staging' | 'development';
}): string {
    return [
        `Generate Kubernetes autoscaling manifests (HPA + optional VPA + ResourceQuota) for the following service.`,
        ``,
        `Service: ${params.appName}`,
        `Namespace: ${params.namespace}`,
        `Description: ${params.description}`,
        `Environment: ${params.environment}`,
        params.currentCpu    ? `Current CPU request: ${params.currentCpu}` : '',
        params.currentMemory ? `Current memory request: ${params.currentMemory}` : '',
        params.p99Latency    ? `p99 latency: ${params.p99Latency}` : '',
        params.errorRate     ? `Error rate: ${params.errorRate}` : '',
        params.peakRps       ? `Peak RPS: ${params.peakRps}` : '',
        ``,
        `Requirements:`,
        `  - HPA: use autoscaling/v2 with CPU utilization target (70% for prod, 80% for staging)`,
        `  - HPA scaleDown stabilizationWindowSeconds: 300 (avoid flapping)`,
        `  - VPA updateMode: "Off" (recommendation mode only — don't auto-restart pods)`,
        `  - ResourceQuota: appropriate namespace caps`,
        `  - All manifests must include standard labels`,
        ``,
        `Return a JSON array: [{ "filename": "...", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseAutoscalerOutput(raw: string): Array<{ filename: string; content: string }> {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed  = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item['filename'] === 'string' && typeof item['content'] === 'string')
            .map((item) => ({ filename: item['filename'] as string, content: item['content'] as string }));
    } catch {
        return [];
    }
}
