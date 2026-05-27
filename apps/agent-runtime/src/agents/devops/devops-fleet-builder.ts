// ============================================================================
// DEVOPS FLEET / MULTI-CLUSTER BUILDER
//
// Multi-cluster and fleet management operations:
//
//   ArgoCD multi-cluster  — cluster add/rm/list, ApplicationSet CRD
//   App-of-Apps pattern   — root Application that manages child Applications
//   Cluster API (CAPI)    — Cluster object + MachineDeployment YAML
//   kubectl multi-context — run any kubectl command against a named kubeconfig context
//   Fleet (Rancher)       — GitRepo + Bundle status
//
// All LLM-generated content (App-of-Apps, ApplicationSet) is returned as
// a JSON array of { filename, content } pairs for writing to disk.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterInfo {
    name:       string;
    server:     string;
    status?:    'Successful' | 'Failed' | 'Unknown';
    version?:   string;
    namespace?: string;
}

export interface ApplicationSetSpec {
    name:       string;
    namespace:  string;             // ArgoCD namespace, usually 'argocd'
    repoUrl:    string;
    revision:   string;             // branch / tag
    pathTemplate: string;           // e.g. 'apps/{{cluster}}'
    clusterSelector?: Record<string, string>;  // matchLabels
    destNamespace?: string;
    syncPolicy?: 'automated' | 'manual';
    prune?:     boolean;
    selfHeal?:  boolean;
    generators: Array<
        | { type: 'clusters'; labelMatch?: Record<string, string> }
        | { type: 'list'; elements: Array<Record<string, string>> }
        | { type: 'git'; directories?: boolean; files?: boolean }
    >;
}

export interface AppOfAppsSpec {
    name:        string;
    namespace:   string;
    repoUrl:     string;
    revision:    string;
    appsPath:    string;            // path in repo containing child Application YAMLs
    syncPolicy?: 'automated' | 'manual';
    prune?:      boolean;
}

// ---------------------------------------------------------------------------
// ArgoCD cluster management
// ---------------------------------------------------------------------------

export function buildArgoCdClusterListArgs(namespace?: string): string[] {
    const args = ['argocd', 'cluster', 'list', '--output', 'json'];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

export function buildArgoCdClusterAddArgs(params: {
    context:      string;           // kubectl context name
    name?:        string;           // override cluster name in ArgoCD
    namespace?:   string;           // ArgoCD namespace
    inCluster?:   boolean;          // use in-cluster config
    upsert?:      boolean;
}): string[] {
    const args = ['argocd', 'cluster', 'add', params.context];
    if (params.name)      args.push('--name', params.name);
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.inCluster) args.push('--in-cluster');
    if (params.upsert)    args.push('--upsert');
    return args;
}

export function buildArgoCdClusterRemoveArgs(clusterName: string, namespace?: string): string[] {
    const args = ['argocd', 'cluster', 'rm', clusterName];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

export function buildArgoCdClusterGetArgs(clusterName: string): string[] {
    return ['argocd', 'cluster', 'get', clusterName, '--output', 'json'];
}

// ---------------------------------------------------------------------------
// Multi-context kubectl
// ---------------------------------------------------------------------------

/** Run any kubectl command against a specific kubeconfig context. */
export function buildKubectlMultiContextArgs(params: {
    context:    string;
    args:       string[];           // e.g. ['get', 'pods', '-n', 'default']
    kubeconfig?: string;
}): string[] {
    const cmd = ['kubectl', `--context=${params.context}`];
    if (params.kubeconfig) cmd.push(`--kubeconfig=${params.kubeconfig}`);
    cmd.push(...params.args);
    return cmd;
}

/** List all contexts available in the kubeconfig. */
export function buildKubectlGetContextsArgs(kubeconfig?: string): string[] {
    const args = ['kubectl', 'config', 'get-contexts', '--output=name'];
    if (kubeconfig) args.push(`--kubeconfig=${kubeconfig}`);
    return args;
}

/** Get cluster health across all contexts — runs kubectl cluster-info on each. */
export function buildKubectlClusterInfoArgs(context: string, kubeconfig?: string): string[] {
    const args = ['kubectl', `--context=${context}`, 'cluster-info'];
    if (kubeconfig) args.push(`--kubeconfig=${kubeconfig}`);
    return args;
}

// ---------------------------------------------------------------------------
// ApplicationSet YAML builder
// ---------------------------------------------------------------------------

export function buildApplicationSetYaml(spec: ApplicationSetSpec): string {
    const syncPolicyBlock = spec.syncPolicy === 'automated'
        ? `
      syncPolicy:
        automated:
          prune: ${spec.prune ?? true}
          selfHeal: ${spec.selfHeal ?? true}`
        : '';

    const generatorsYaml = spec.generators.map((g) => {
        if (g.type === 'clusters') {
            const matchLabels = g.labelMatch
                ? '\n        matchLabels:\n' + Object.entries(g.labelMatch).map(([k, v]) => `          ${k}: "${v}"`).join('\n')
                : '';
            return `    - clusters:
        selector:${matchLabels || '\n          {}'}`;
        }
        if (g.type === 'list') {
            const elements = g.elements.map((el) =>
                '      - ' + Object.entries(el).map(([k, v]) => `${k}: "${v}"`).join('\n        ')
            ).join('\n');
            return `    - list:
      elements:
${elements}`;
        }
        if (g.type === 'git') {
            return g.directories
                ? `    - git:
        repoURL: ${spec.repoUrl}
        revision: ${spec.revision}
        directories:
          - path: "${spec.pathTemplate}"`
                : `    - git:
        repoURL: ${spec.repoUrl}
        revision: ${spec.revision}
        files:
          - path: "${spec.pathTemplate}"`;
        }
        return '';
    }).join('\n');

    return `apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: ${spec.name}
  namespace: ${spec.namespace}
  labels:
    app.kubernetes.io/name: ${spec.name}
    app.kubernetes.io/component: applicationset
spec:
  generators:
${generatorsYaml}
  template:
    metadata:
      name: "{{name}}-${spec.name}"
    spec:
      project: default
      source:
        repoURL: ${spec.repoUrl}
        targetRevision: ${spec.revision}
        path: "${spec.pathTemplate}"
      destination:
        server: "{{server}}"
        namespace: ${spec.destNamespace ?? 'default'}${syncPolicyBlock}`;
}

// ---------------------------------------------------------------------------
// App-of-Apps YAML builder
// ---------------------------------------------------------------------------

export function buildAppOfAppsYaml(spec: AppOfAppsSpec): string {
    const syncPolicyBlock = spec.syncPolicy === 'automated'
        ? `
  syncPolicy:
    automated:
      prune: ${spec.prune ?? true}
      selfHeal: true`
        : '';
    return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${spec.name}
  namespace: ${spec.namespace}
  labels:
    app.kubernetes.io/name: ${spec.name}
    app.kubernetes.io/component: app-of-apps
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
spec:
  project: default
  source:
    repoURL: ${spec.repoUrl}
    targetRevision: ${spec.revision}
    path: ${spec.appsPath}
  destination:
    server: https://kubernetes.default.svc
    namespace: ${spec.namespace}${syncPolicyBlock}`;
}

// ---------------------------------------------------------------------------
// Cluster API (CAPI) basic cluster YAML
// ---------------------------------------------------------------------------

export function buildCapiClusterYaml(params: {
    name:          string;
    namespace:     string;
    k8sVersion:    string;         // e.g. 'v1.29.2'
    controlPlaneCount?: number;
    workerCount?:  number;
    region?:       string;
    provider?:     'aws' | 'azure' | 'gcp';
}): string {
    return `apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  clusterNetwork:
    pods:
      cidrBlocks:
        - 192.168.0.0/16
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: KubeadmControlPlane
    name: ${params.name}-control-plane
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
    kind: ${params.provider === 'aws' ? 'AWSCluster' : params.provider === 'azure' ? 'AzureCluster' : 'GCPCluster'}
    name: ${params.name}
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: ${params.name}-workers
  namespace: ${params.namespace}
spec:
  clusterName: ${params.name}
  replicas: ${params.workerCount ?? 3}
  selector:
    matchLabels:
      cluster.x-k8s.io/cluster-name: ${params.name}
  template:
    spec:
      clusterName: ${params.name}
      version: "${params.k8sVersion}"
      bootstrap:
        configRef:
          apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
          kind: KubeadmConfigTemplate
          name: ${params.name}-workers
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
        kind: ${params.provider === 'aws' ? 'AWSMachineTemplate' : params.provider === 'azure' ? 'AzureMachineTemplate' : 'GCPMachineTemplate'}
        name: ${params.name}-workers`;
}

// ---------------------------------------------------------------------------
// Rancher Fleet builders
// ---------------------------------------------------------------------------

export function buildFleetGitRepoYaml(params: {
    name:       string;
    namespace:  string;           // fleet-local for management cluster, fleet-default for downstream
    repoUrl:    string;
    revision:   string;
    paths?:     string[];
    targets?:   Array<{ name?: string; clusterSelector?: Record<string, string> }>;
}): string {
    const pathsYaml = (params.paths ?? ['.']).map((p) => `  - ${p}`).join('\n');
    const targetsYaml = (params.targets ?? [{ name: 'default' }]).map((t) => {
        const sel = t.clusterSelector
            ? '\n    clusterSelector:\n      matchLabels:\n' + Object.entries(t.clusterSelector).map(([k, v]) => `        ${k}: "${v}"`).join('\n')
            : '';
        return `  - name: ${t.name ?? 'default'}${sel}`;
    }).join('\n');

    return `apiVersion: fleet.cattle.io/v1alpha1
kind: GitRepo
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  repo: ${params.repoUrl}
  revision: ${params.revision}
  paths:
${pathsYaml}
  targets:
${targetsYaml}`;
}

export function buildFleetStatusArgs(namespace = 'fleet-default'): string[] {
    return ['kubectl', 'get', 'gitrepo', '-n', namespace, '-o', 'json'];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseArgoCdClusterList(raw: string): ClusterInfo[] {
    try {
        const json = JSON.parse(raw) as Array<{ name?: string; server?: string; connectionState?: { status?: string }; serverVersion?: string; namespace?: string }>;
        return json.map((c) => ({
            name:      c.name      ?? '',
            server:    c.server    ?? '',
            status:    (c.connectionState?.status ?? 'Unknown') as ClusterInfo['status'],
            version:   c.serverVersion,
            namespace: c.namespace,
        }));
    } catch {
        return [];
    }
}

export function formatFleetStatus(clusters: ClusterInfo[]): string {
    if (!clusters.length) return 'No clusters registered.';
    const lines = [`Fleet status — ${clusters.length} cluster(s):`];
    for (const c of clusters) {
        lines.push(`  ${c.name}: ${c.status ?? 'Unknown'}  server=${c.server}${c.version ? `  k8s=${c.version}` : ''}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

export function buildFleetPrompt(params: {
    description:  string;
    clusters:     Array<{ name: string; environment: string; region?: string }>;
    repoUrl:      string;
    appsBasePath?: string;
}): string {
    const clusterList = params.clusters.map((c) =>
        `  - name: ${c.name}, env: ${c.environment}${c.region ? `, region: ${c.region}` : ''}`
    ).join('\n');
    return [
        `You are a GitOps engineer. Design an ArgoCD App-of-Apps and ApplicationSet structure for the following fleet.`,
        ``,
        `Description: ${params.description}`,
        `Git repository: ${params.repoUrl}`,
        `Apps base path: ${params.appsBasePath ?? 'apps/'}`,
        ``,
        `Clusters:`,
        clusterList,
        ``,
        `Requirements:`,
        `  - App-of-Apps root Application that manages all cluster-specific Applications`,
        `  - ApplicationSet that targets all clusters using clusters generator`,
        `  - Per-cluster overrides via values files (apps/<cluster-name>/values.yaml)`,
        `  - Automated sync with prune and self-heal`,
        ``,
        `Return a JSON array: [{ "filename": string, "content": string }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].join('\n');
}

export function parseFleetOutput(raw: string): Array<{ filename: string; content: string }> {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
            .filter((f) => typeof f['filename'] === 'string' && typeof f['content'] === 'string')
            .map((f) => ({ filename: f['filename'] as string, content: f['content'] as string }));
    } catch {
        return [];
    }
}
