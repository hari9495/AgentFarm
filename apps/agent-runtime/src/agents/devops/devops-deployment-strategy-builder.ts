// ============================================================================
// DEVOPS DEPLOYMENT STRATEGY BUILDER
//
// Generates and applies production-safe deployment strategies:
//   Blue/Green  — two identical environments; traffic switches atomically
//   Canary      — progressive traffic shift via Argo Rollouts or Istio weights
//
// Both strategies are generated as Kubernetes manifests (YAML).
// Argo Rollouts integration: uses the `Rollout` CRD.
// Istio integration: uses VirtualService + DestinationRule.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeploymentStrategyFile {
    filename: string;
    content:  string;   // YAML
}

export type DeploymentStrategy = 'blue_green' | 'canary' | 'rolling';

export interface CanaryStep {
    setWeight?:  number;   // percentage of traffic (0-100)
    pause?:      { duration?: string };  // e.g. { duration: '30m' }
    analysis?:   { templateName: string };
}

// ---------------------------------------------------------------------------
// Blue / Green builders
// ---------------------------------------------------------------------------

/**
 * Generate blue/green deployment manifests:
 *   - blue Deployment (current stable version)
 *   - green Deployment (new version)
 *   - active Service (points to blue initially)
 *   - preview Service (points to green for smoke-testing)
 */
export function buildBlueGreenManifests(params: {
    appName:        string;
    namespace:      string;
    blueImage:      string;   // e.g. myapp:v1.2.0
    greenImage:     string;   // e.g. myapp:v1.3.0
    replicas?:      number;
    port:           number;
    labels?:        Record<string, string>;
    resources?:     { cpu: string; memory: string };
}): DeploymentStrategyFile[] {
    const { appName, namespace, blueImage, greenImage, port } = params;
    const replicas  = params.replicas  ?? 2;
    const cpuReq    = params.resources?.cpu    ?? '100m';
    const memReq    = params.resources?.memory ?? '128Mi';

    const deploymentBase = (color: 'blue' | 'green', image: string): string => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}-${color}
  namespace: ${namespace}
  labels:
    app: ${appName}
    version: ${color}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
      version: ${color}
  strategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: ${appName}
        version: ${color}
    spec:
      containers:
        - name: ${appName}
          image: ${image}
          ports:
            - containerPort: ${port}
          resources:
            requests:
              cpu: "${cpuReq}"
              memory: "${memReq}"
            limits:
              cpu: "${cpuReq}"
              memory: "${memReq}"
          readinessProbe:
            httpGet:
              path: /ready
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: ${port}
            initialDelaySeconds: 15
            periodSeconds: 15`;

    const activeService = `apiVersion: v1
kind: Service
metadata:
  name: ${appName}-active
  namespace: ${namespace}
  labels:
    app: ${appName}
    role: active
spec:
  selector:
    app: ${appName}
    version: blue
  ports:
    - port: 80
      targetPort: ${port}
  type: ClusterIP`;

    const previewService = `apiVersion: v1
kind: Service
metadata:
  name: ${appName}-preview
  namespace: ${namespace}
  labels:
    app: ${appName}
    role: preview
spec:
  selector:
    app: ${appName}
    version: green
  ports:
    - port: 80
      targetPort: ${port}
  type: ClusterIP`;

    return [
        { filename: `${appName}-blue-deployment.yaml`,    content: deploymentBase('blue',  blueImage) },
        { filename: `${appName}-green-deployment.yaml`,   content: deploymentBase('green', greenImage) },
        { filename: `${appName}-active-service.yaml`,     content: activeService },
        { filename: `${appName}-preview-service.yaml`,    content: previewService },
    ];
}

/**
 * Build `kubectl patch service` args to switch the active service selector
 * from one color to the other (the atomic blue/green switchover).
 */
export function buildBlueGreenSwitchArgs(params: {
    appName:    string;
    namespace:  string;
    toColor:    'blue' | 'green';
}): string[] {
    const patch = JSON.stringify({ spec: { selector: { app: params.appName, version: params.toColor } } });
    return [
        'kubectl', 'patch', 'service', `${params.appName}-active`,
        '-n', params.namespace,
        '--type=merge',
        '--patch', patch,
    ];
}

/** Build `kubectl scale` args to scale down the old color after switchover. */
export function buildScaleDownArgs(appName: string, color: 'blue' | 'green', namespace: string): string[] {
    return ['kubectl', 'scale', 'deployment', `${appName}-${color}`, '-n', namespace, '--replicas=0'];
}

// ---------------------------------------------------------------------------
// Argo Rollouts canary builder
// ---------------------------------------------------------------------------

/**
 * Generate an Argo Rollouts `Rollout` CRD YAML with a canary strategy.
 * Requires the Argo Rollouts controller installed in the cluster.
 */
export function buildArgoRolloutsManifest(params: {
    appName:       string;
    namespace:     string;
    image:         string;
    port:          number;
    replicas?:     number;
    steps?:        CanaryStep[];
    analysisTemplate?: string;  // AnalysisTemplate name for automated checks
    resources?:    { cpu: string; memory: string };
}): string {
    const { appName, namespace, image, port } = params;
    const replicas = params.replicas ?? 3;
    const cpuReq   = params.resources?.cpu    ?? '100m';
    const memReq   = params.resources?.memory ?? '128Mi';

    const defaultSteps: CanaryStep[] = params.steps ?? [
        { setWeight: 10 },
        { pause: { duration: '5m' } },
        { setWeight: 25 },
        { pause: { duration: '10m' } },
        { setWeight: 50 },
        { pause: { duration: '10m' } },
        { setWeight: 75 },
        { pause: { duration: '5m' } },
        { setWeight: 100 },
    ];

    const stepsYaml = defaultSteps.map((step) => {
        if (step.setWeight !== undefined) return `        - setWeight: ${step.setWeight}`;
        if (step.pause !== undefined) {
            return step.pause.duration
                ? `        - pause:\n            duration: ${step.pause.duration}`
                : `        - pause: {}`;
        }
        if (step.analysis !== undefined) {
            return `        - analysis:\n            templates:\n              - templateName: ${step.analysis.templateName}`;
        }
        return '';
    }).filter(Boolean).join('\n');

    return `apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
        - name: ${appName}
          image: ${image}
          ports:
            - containerPort: ${port}
          resources:
            requests:
              cpu: "${cpuReq}"
              memory: "${memReq}"
            limits:
              cpu: "${cpuReq}"
              memory: "${memReq}"
          readinessProbe:
            httpGet:
              path: /ready
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 5
  strategy:
    canary:
      steps:
${stepsYaml}`;
}

/** Build `kubectl argo rollouts promote` args — advance a paused canary. */
export function buildArgoRolloutsPromoteArgs(rolloutName: string, namespace: string, fullPromote = false): string[] {
    const args = ['kubectl', 'argo', 'rollouts', 'promote', rolloutName, '-n', namespace];
    if (fullPromote) args.push('--full');
    return args;
}

/** Build `kubectl argo rollouts abort` args — abort and roll back the canary. */
export function buildArgoRolloutsAbortArgs(rolloutName: string, namespace: string): string[] {
    return ['kubectl', 'argo', 'rollouts', 'abort', rolloutName, '-n', namespace];
}

/** Build `kubectl argo rollouts status` args — watch rollout progress. */
export function buildArgoRolloutsStatusArgs(rolloutName: string, namespace: string, watch = false): string[] {
    const args = ['kubectl', 'argo', 'rollouts', 'status', rolloutName, '-n', namespace];
    if (watch) args.push('--watch');
    return args;
}

// ---------------------------------------------------------------------------
// Istio VirtualService / DestinationRule traffic split
// ---------------------------------------------------------------------------

/**
 * Generate Istio VirtualService + DestinationRule for canary traffic splitting.
 */
export function buildIstioTrafficSplitManifests(params: {
    appName:      string;
    namespace:    string;
    stableWeight: number;   // 0-100
    canaryWeight: number;   // 0-100 (stableWeight + canaryWeight = 100)
    stableVersion?: string; // label value for stable subset
    canaryVersion?: string; // label value for canary subset
    port:         number;
}): DeploymentStrategyFile[] {
    const { appName, namespace, stableWeight, canaryWeight, port } = params;
    const stableVersion = params.stableVersion ?? 'stable';
    const canaryVersion = params.canaryVersion ?? 'canary';

    const destinationRule = `apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  host: ${appName}
  subsets:
    - name: ${stableVersion}
      labels:
        version: ${stableVersion}
    - name: ${canaryVersion}
      labels:
        version: ${canaryVersion}`;

    const virtualService = `apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  hosts:
    - ${appName}
  http:
    - route:
        - destination:
            host: ${appName}
            subset: ${stableVersion}
            port:
              number: ${port}
          weight: ${stableWeight}
        - destination:
            host: ${appName}
            subset: ${canaryVersion}
            port:
              number: ${port}
          weight: ${canaryWeight}`;

    return [
        { filename: `${appName}-destination-rule.yaml`, content: destinationRule },
        { filename: `${appName}-virtual-service.yaml`,  content: virtualService },
    ];
}

// ---------------------------------------------------------------------------
// LLM prompt for generating a deployment strategy from description
// ---------------------------------------------------------------------------

export function buildDeploymentStrategyPrompt(params: {
    appName:     string;
    description: string;
    strategy:    DeploymentStrategy;
    image:       string;
    port:        number;
    namespace:   string;
    currentImage?: string;
    replicas?:   number;
    useIstio?:   boolean;
    useArgoRollouts?: boolean;
}): string {
    const { appName, description, strategy, image, port, namespace } = params;
    return [
        `Generate a production-ready ${strategy.replace('_', '/')} deployment strategy for the following application.`,
        ``,
        `App: ${appName}`,
        `Description: ${description}`,
        `New image: ${image}`,
        params.currentImage ? `Current image: ${params.currentImage}` : '',
        `Port: ${port}`,
        `Namespace: ${namespace}`,
        `Replicas: ${params.replicas ?? 2}`,
        params.useIstio ? `Traffic management: Istio VirtualService + DestinationRule` : '',
        params.useArgoRollouts ? `Rollout controller: Argo Rollouts` : '',
        ``,
        strategy === 'blue_green' ? [
            `Blue/Green requirements:`,
            `  - Two identical deployments: ${appName}-blue (current) and ${appName}-green (new)`,
            `  - active Service selector points to blue initially`,
            `  - preview Service selector points to green for smoke-testing`,
            `  - Switch is atomic: patch active Service selector to green`,
        ].join('\n') : '',
        strategy === 'canary' ? [
            `Canary requirements:`,
            `  - Progressive traffic increase: 10% → 25% → 50% → 75% → 100%`,
            `  - Pause between steps for observation`,
            `  - Auto-rollback on error rate spike`,
            params.useArgoRollouts ? `  - Use Argo Rollouts Rollout CRD` : '',
            params.useIstio ? `  - Use Istio VirtualService weights for traffic splitting` : '',
        ].join('\n') : '',
        ``,
        `Return a JSON array: [{ "filename": "...", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseDeploymentStrategyOutput(raw: string): DeploymentStrategyFile[] {
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
