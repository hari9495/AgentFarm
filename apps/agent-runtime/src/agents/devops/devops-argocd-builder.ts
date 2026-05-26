// ============================================================================
// DEVOPS ARGOCD BUILDER
//
// CLI command builders and output parsers for ArgoCD GitOps workflows:
//   argocd app sync         — sync an application (pull from Git, apply to cluster)
//   argocd app rollback     — roll back to a previous history revision
//   argocd app get          — retrieve app status and health
//   argocd app list         — list all apps in a project/namespace
//   argocd app diff         — show what would change on next sync
//   argocd app set          — update app parameters (image tag, helm values, etc.)
//   argocd app wait         — wait for app to reach a target health/sync state
//
// Also generates Application CRD YAML for bootstrapping new apps via GitOps.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArgoCdSyncPolicy = 'auto' | 'none';
export type ArgoCdHealthStatus = 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown';
export type ArgoCdSyncStatus  = 'Synced' | 'OutOfSync' | 'Unknown';

export interface ArgoCdApp {
    name:         string;
    namespace:    string;
    project:      string;
    repoUrl:      string;
    targetRevision: string;
    path:         string;
    destServer:   string;
    destNamespace: string;
    health:       ArgoCdHealthStatus;
    sync:         ArgoCdSyncStatus;
    images?:      string[];
}

export interface ArgoCdSyncResult {
    app:          string;
    ok:           boolean;
    syncStatus:   ArgoCdSyncStatus;
    healthStatus: ArgoCdHealthStatus;
    message:      string;
    resources?:   Array<{ kind: string; name: string; status: string }>;
}

// ---------------------------------------------------------------------------
// argocd app sync
// ---------------------------------------------------------------------------

/**
 * Build `argocd app sync` args.
 * Supports prune (remove orphaned resources), force (replace), async, and dry-run.
 */
export function buildArgoCdSyncArgs(params: {
    appName:     string;
    namespace?:  string;           // ArgoCD server namespace (usually argocd)
    prune?:      boolean;          // remove resources no longer in Git
    force?:      boolean;          // replace resources (kubectl replace)
    async?:      boolean;          // don't wait for sync completion
    dryRun?:     boolean;          // show what would happen without syncing
    revision?:   string;           // sync to a specific Git revision/tag/branch
    resources?:  Array<{ group?: string; kind: string; name: string }>;
}): string[] {
    const args = ['argocd', 'app', 'sync', params.appName];
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.prune)     args.push('--prune');
    if (params.force)     args.push('--force');
    if (params.async)     args.push('--async');
    if (params.dryRun)    args.push('--dry-run');
    if (params.revision)  args.push('--revision', params.revision);
    for (const r of params.resources ?? []) {
        const ref = [r.group, r.kind, r.name].filter(Boolean).join('/');
        args.push('--resource', ref);
    }
    return args;
}

// ---------------------------------------------------------------------------
// argocd app rollback
// ---------------------------------------------------------------------------

/**
 * Roll back an ArgoCD application to a previous deployed revision.
 * historyId comes from `argocd app history <appName>`.
 */
export function buildArgoCdRollbackArgs(params: {
    appName:    string;
    historyId:  number;    // ID from argocd app history
    prune?:     boolean;
    namespace?: string;
}): string[] {
    const args = ['argocd', 'app', 'rollback', params.appName, String(params.historyId)];
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.prune)     args.push('--prune');
    return args;
}

/** Get deployment history for an app. */
export function buildArgoCdHistoryArgs(appName: string, namespace?: string): string[] {
    const args = ['argocd', 'app', 'history', appName];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

// ---------------------------------------------------------------------------
// argocd app get / list / diff
// ---------------------------------------------------------------------------

export function buildArgoCdGetArgs(appName: string, namespace?: string, output: 'json' | 'yaml' | 'wide' = 'json'): string[] {
    const args = ['argocd', 'app', 'get', appName, '-o', output];
    if (namespace) args.push('--namespace', namespace);
    return args;
}

export function buildArgoCdListArgs(params?: {
    project?:       string;
    namespace?:     string;
    labelSelector?: string;
    output?:        'json' | 'yaml' | 'wide';
}): string[] {
    const args = ['argocd', 'app', 'list', '-o', params?.output ?? 'json'];
    if (params?.project)       args.push('--project',       params.project);
    if (params?.namespace)     args.push('--namespace',     params.namespace);
    if (params?.labelSelector) args.push('-l',              params.labelSelector);
    return args;
}

export function buildArgoCdDiffArgs(appName: string, params?: {
    revision?: string;
    localPath?: string;
    namespace?: string;
}): string[] {
    const args = ['argocd', 'app', 'diff', appName];
    if (params?.revision)  args.push('--revision',  params.revision);
    if (params?.localPath) args.push('--local',     params.localPath);
    if (params?.namespace) args.push('--namespace', params.namespace);
    return args;
}

// ---------------------------------------------------------------------------
// argocd app set (update image, helm values, etc.)
// ---------------------------------------------------------------------------

/**
 * Update parameters on an ArgoCD application in place.
 * Commonly used to bump the image tag without editing Git.
 */
export function buildArgoCdSetArgs(params: {
    appName:          string;
    namespace?:       string;
    image?:           string;    // new image incl. tag, e.g. myapp:v1.4.0
    helmValues?:      Array<{ name: string; value: string }>;  // --helm-set
    helmValueFiles?:  string[];  // --values
    kustomizeImage?:  string;    // --kustomize-image
    targetRevision?:  string;    // --target-revision
}): string[] {
    const args = ['argocd', 'app', 'set', params.appName];
    if (params.namespace)      args.push('--namespace',        params.namespace);
    if (params.image)          args.push('--helm-set',         `image.tag=${params.image.split(':')[1] ?? params.image}`);
    if (params.kustomizeImage) args.push('--kustomize-image',  params.kustomizeImage);
    if (params.targetRevision) args.push('--target-revision',  params.targetRevision);
    for (const v of params.helmValues ?? []) args.push('--helm-set', `${v.name}=${v.value}`);
    for (const f of params.helmValueFiles ?? []) args.push('--values', f);
    return args;
}

// ---------------------------------------------------------------------------
// argocd app wait
// ---------------------------------------------------------------------------

export function buildArgoCdWaitArgs(params: {
    appName:     string;
    namespace?:  string;
    timeout?:    number;   // seconds
    health?:     boolean;  // wait for healthy
    sync?:       boolean;  // wait for synced
    operation?:  boolean;  // wait for current operation to complete
}): string[] {
    const args = ['argocd', 'app', 'wait', params.appName];
    if (params.namespace) args.push('--namespace', params.namespace);
    if (params.timeout)   args.push('--timeout',   String(params.timeout));
    if (params.health)    args.push('--health');
    if (params.sync)      args.push('--sync');
    if (params.operation) args.push('--operation');
    return args;
}

// ---------------------------------------------------------------------------
// ArgoCD Application CRD YAML builder
// ---------------------------------------------------------------------------

/**
 * Generate an ArgoCD Application CRD YAML for bootstrapping new apps via GitOps.
 */
export function buildArgoCdApplicationYaml(params: {
    appName:          string;
    project?:         string;       // ArgoCD project name (default: default)
    repoUrl:          string;       // Git repo URL
    targetRevision:   string;       // branch/tag/commit
    path:             string;       // path inside the repo
    destServer?:      string;       // default: https://kubernetes.default.svc
    destNamespace:    string;
    syncPolicy?:      ArgoCdSyncPolicy;
    prune?:           boolean;
    selfHeal?:        boolean;
    helmValues?:      Record<string, string>;
    namespace?:       string;       // ArgoCD server namespace
}): string {
    const project    = params.project    ?? 'default';
    const destServer = params.destServer ?? 'https://kubernetes.default.svc';
    const syncPolicyYaml = params.syncPolicy === 'auto' ? `
  syncPolicy:
    automated:
      prune: ${params.prune ?? true}
      selfHeal: ${params.selfHeal ?? true}
    syncOptions:
      - CreateNamespace=true` : '';

    const helmValuesYaml = params.helmValues && Object.keys(params.helmValues).length > 0
        ? `\n      helm:\n        parameters:\n${Object.entries(params.helmValues).map(([k, v]) => `          - name: ${k}\n            value: "${v}"`).join('\n')}`
        : '';

    return `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${params.appName}
  namespace: ${params.namespace ?? 'argocd'}
spec:
  project: ${project}
  source:
    repoURL: ${params.repoUrl}
    targetRevision: ${params.targetRevision}
    path: ${params.path}${helmValuesYaml}
  destination:
    server: ${destServer}
    namespace: ${params.destNamespace}${syncPolicyYaml}`;
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseArgoCdAppStatus(raw: string): ArgoCdApp | null {
    try {
        const json = JSON.parse(raw) as {
            metadata?: { name?: string; namespace?: string };
            spec?: {
                project?: string;
                source?: { repoURL?: string; targetRevision?: string; path?: string };
                destination?: { server?: string; namespace?: string };
            };
            status?: {
                health?: { status?: string };
                sync?: { status?: string };
                summary?: { images?: string[] };
            };
        };
        return {
            name:            json.metadata?.name ?? '',
            namespace:       json.metadata?.namespace ?? 'argocd',
            project:         json.spec?.project ?? 'default',
            repoUrl:         json.spec?.source?.repoURL ?? '',
            targetRevision:  json.spec?.source?.targetRevision ?? 'HEAD',
            path:            json.spec?.source?.path ?? '',
            destServer:      json.spec?.destination?.server ?? '',
            destNamespace:   json.spec?.destination?.namespace ?? '',
            health:          (json.status?.health?.status ?? 'Unknown') as ArgoCdHealthStatus,
            sync:            (json.status?.sync?.status   ?? 'Unknown') as ArgoCdSyncStatus,
            images:          json.status?.summary?.images ?? [],
        };
    } catch {
        return null;
    }
}

export function parseArgoCdAppList(raw: string): ArgoCdApp[] {
    try {
        const json = JSON.parse(raw) as unknown;
        const items = Array.isArray(json) ? json : (json as { items?: unknown[] }).items ?? [];
        return items
            .map((item) => parseArgoCdAppStatus(JSON.stringify(item)))
            .filter((a): a is ArgoCdApp => a !== null);
    } catch {
        return [];
    }
}

/** Summarise the health of a list of ArgoCD apps. */
export function summariseArgoCdApps(apps: ArgoCdApp[]): string {
    const healthy    = apps.filter((a) => a.health === 'Healthy').length;
    const synced     = apps.filter((a) => a.sync  === 'Synced').length;
    const degraded   = apps.filter((a) => a.health === 'Degraded').length;
    const outOfSync  = apps.filter((a) => a.sync  === 'OutOfSync').length;
    return `${apps.length} app(s): ${healthy} healthy, ${synced} synced, ${degraded} degraded, ${outOfSync} out-of-sync.`;
}

// ---------------------------------------------------------------------------
// LLM prompt for GitOps application manifest generation
// ---------------------------------------------------------------------------

export function buildArgoCdAppPrompt(params: {
    appName:       string;
    description:   string;
    repoUrl:       string;
    targetRevision: string;
    destNamespace: string;
    syncPolicy?:   ArgoCdSyncPolicy;
    helmChart?:    boolean;
    kustomize?:    boolean;
}): string {
    return [
        `Generate a production-ready ArgoCD Application CRD YAML for the following service.`,
        ``,
        `App name: ${params.appName}`,
        `Description: ${params.description}`,
        `Git repo: ${params.repoUrl}`,
        `Target branch/tag: ${params.targetRevision}`,
        `Destination namespace: ${params.destNamespace}`,
        `Sync policy: ${params.syncPolicy ?? 'auto'}`,
        params.helmChart ? `Source type: Helm chart` : '',
        params.kustomize ? `Source type: Kustomize` : '',
        ``,
        `Requirements:`,
        `  - apiVersion: argoproj.io/v1alpha1, kind: Application`,
        `  - namespace: argocd`,
        `  - syncPolicy.automated.prune: true, selfHeal: true`,
        `  - syncOptions: [CreateNamespace=true]`,
        `  - Add labels: app.kubernetes.io/name, app.kubernetes.io/managed-by: argocd`,
        ``,
        `Return a JSON array: [{ "filename": "${params.appName}-argocd-app.yaml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}
