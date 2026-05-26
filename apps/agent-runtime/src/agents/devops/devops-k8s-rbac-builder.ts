// ============================================================================
// DEVOPS K8S RBAC BUILDER
//
// Generates and applies Kubernetes RBAC manifests:
//   Role / ClusterRole         — what actions are allowed on which resources
//   RoleBinding / ClusterRoleBinding — who gets which Role
//   ServiceAccount             — identity for pods
//   IRSA annotation             — AWS IAM Role for Service Account
//
// Also exposes an LLM prompt for generating RBAC from a plain-English
// description of what a service needs to do.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RbacRule {
    apiGroups:  string[];   // e.g. [''], ['apps'], ['batch']
    resources:  string[];   // e.g. ['pods', 'deployments']
    verbs:      string[];   // e.g. ['get', 'list', 'watch']
    resourceNames?: string[];
}

export interface RbacManifestFile {
    filename: string;
    content:  string;   // YAML
}

// ---------------------------------------------------------------------------
// Kubernetes manifest builders
// ---------------------------------------------------------------------------

/** Generate a namespaced Role YAML. */
export function buildRoleYaml(params: {
    name:       string;
    namespace:  string;
    rules:      RbacRule[];
    labels?:    Record<string, string>;
}): string {
    const labelsYaml = Object.entries(params.labels ?? {})
        .map(([k, v]) => `    ${k}: "${v}"`)
        .join('\n');

    const rulesYaml = params.rules.map((rule) => [
        `  - apiGroups: [${rule.apiGroups.map((g) => `"${g}"`).join(', ')}]`,
        `    resources: [${rule.resources.map((r) => `"${r}"`).join(', ')}]`,
        `    verbs: [${rule.verbs.map((v) => `"${v}"`).join(', ')}]`,
        rule.resourceNames ? `    resourceNames: [${rule.resourceNames.map((n) => `"${n}"`).join(', ')}]` : '',
    ].filter(Boolean).join('\n')).join('\n');

    return [
        `apiVersion: rbac.authorization.k8s.io/v1`,
        `kind: Role`,
        `metadata:`,
        `  name: ${params.name}`,
        `  namespace: ${params.namespace}`,
        ...(labelsYaml ? [`  labels:`, labelsYaml] : []),
        `rules:`,
        rulesYaml,
    ].join('\n');
}

/** Generate a cluster-wide ClusterRole YAML. */
export function buildClusterRoleYaml(params: {
    name:    string;
    rules:   RbacRule[];
    labels?: Record<string, string>;
}): string {
    const labelsYaml = Object.entries(params.labels ?? {})
        .map(([k, v]) => `    ${k}: "${v}"`)
        .join('\n');

    const rulesYaml = params.rules.map((rule) => [
        `  - apiGroups: [${rule.apiGroups.map((g) => `"${g}"`).join(', ')}]`,
        `    resources: [${rule.resources.map((r) => `"${r}"`).join(', ')}]`,
        `    verbs: [${rule.verbs.map((v) => `"${v}"`).join(', ')}]`,
    ].join('\n')).join('\n');

    return [
        `apiVersion: rbac.authorization.k8s.io/v1`,
        `kind: ClusterRole`,
        `metadata:`,
        `  name: ${params.name}`,
        ...(labelsYaml ? [`  labels:`, labelsYaml] : []),
        `rules:`,
        rulesYaml,
    ].join('\n');
}

/** Generate a namespaced RoleBinding YAML. */
export function buildRoleBindingYaml(params: {
    name:        string;
    namespace:   string;
    roleName:    string;
    roleKind?:   'Role' | 'ClusterRole';   // default: Role
    subjects:    Array<{ kind: 'ServiceAccount' | 'User' | 'Group'; name: string; namespace?: string }>;
    labels?:     Record<string, string>;
}): string {
    const roleKind = params.roleKind ?? 'Role';
    const subjectsYaml = params.subjects.map((s) => [
        `  - kind: ${s.kind}`,
        `    name: ${s.name}`,
        `    apiGroup: rbac.authorization.k8s.io`,
        s.namespace ? `    namespace: ${s.namespace}` : '',
    ].filter(Boolean).join('\n')).join('\n');

    return [
        `apiVersion: rbac.authorization.k8s.io/v1`,
        `kind: RoleBinding`,
        `metadata:`,
        `  name: ${params.name}`,
        `  namespace: ${params.namespace}`,
        `roleRef:`,
        `  apiGroup: rbac.authorization.k8s.io`,
        `  kind: ${roleKind}`,
        `  name: ${params.roleName}`,
        `subjects:`,
        subjectsYaml,
    ].join('\n');
}

/** Generate a ClusterRoleBinding YAML. */
export function buildClusterRoleBindingYaml(params: {
    name:         string;
    clusterRole:  string;
    subjects:     Array<{ kind: 'ServiceAccount' | 'User' | 'Group'; name: string; namespace?: string }>;
    labels?:      Record<string, string>;
}): string {
    const subjectsYaml = params.subjects.map((s) => [
        `  - kind: ${s.kind}`,
        `    name: ${s.name}`,
        `    apiGroup: rbac.authorization.k8s.io`,
        s.namespace ? `    namespace: ${s.namespace}` : '',
    ].filter(Boolean).join('\n')).join('\n');

    return [
        `apiVersion: rbac.authorization.k8s.io/v1`,
        `kind: ClusterRoleBinding`,
        `metadata:`,
        `  name: ${params.name}`,
        `roleRef:`,
        `  apiGroup: rbac.authorization.k8s.io`,
        `  kind: ClusterRole`,
        `  name: ${params.clusterRole}`,
        `subjects:`,
        subjectsYaml,
    ].join('\n');
}

/** Generate a ServiceAccount YAML, optionally annotated for IRSA (AWS IAM role). */
export function buildServiceAccountYaml(params: {
    name:            string;
    namespace:       string;
    awsRoleArn?:     string;   // for IRSA: eks.amazonaws.com/role-arn annotation
    labels?:         Record<string, string>;
    extraAnnotations?: Record<string, string>;
}): string {
    const annotations: Record<string, string> = {};
    if (params.awsRoleArn) {
        annotations['eks.amazonaws.com/role-arn'] = params.awsRoleArn;
    }
    Object.assign(annotations, params.extraAnnotations ?? {});

    const annotationsYaml = Object.entries(annotations)
        .map(([k, v]) => `    ${k}: "${v}"`)
        .join('\n');

    const labelsYaml = Object.entries(params.labels ?? {})
        .map(([k, v]) => `    ${k}: "${v}"`)
        .join('\n');

    return [
        `apiVersion: v1`,
        `kind: ServiceAccount`,
        `metadata:`,
        `  name: ${params.name}`,
        `  namespace: ${params.namespace}`,
        ...(annotationsYaml ? [`  annotations:`, annotationsYaml] : []),
        ...(labelsYaml ? [`  labels:`, labelsYaml] : []),
    ].join('\n');
}

// ---------------------------------------------------------------------------
// kubectl command builders
// ---------------------------------------------------------------------------

/** Build `kubectl apply -f -` args (caller pipes the manifest on stdin or writes to a temp file). */
export function buildKubectlApplyArgs(manifestPath: string, namespace?: string): string[] {
    const args = ['kubectl', 'apply', '-f', manifestPath];
    if (namespace) args.push('-n', namespace);
    return args;
}

/** Build `kubectl get <kind> -n <ns> -o json` args. */
export function buildKubectlGetRbacArgs(kind: 'roles' | 'clusterroles' | 'rolebindings' | 'clusterrolebindings' | 'serviceaccounts', namespace?: string): string[] {
    const args = ['kubectl', 'get', kind, '-o', 'json'];
    if (namespace) args.push('-n', namespace);
    return args;
}

/** Build `kubectl auth can-i` — check what a service account can do. */
export function buildKubectlCanIArgs(params: {
    verb:           string;        // e.g. 'get', 'create', 'delete'
    resource:       string;        // e.g. 'pods', 'deployments'
    namespace?:     string;
    serviceAccount?: string;       // e.g. 'my-app' in namespace 'default'
    saNamespace?:   string;
}): string[] {
    const args = ['kubectl', 'auth', 'can-i', params.verb, params.resource];
    if (params.namespace) args.push('-n', params.namespace);
    if (params.serviceAccount) {
        const saRef = `system:serviceaccount:${params.saNamespace ?? 'default'}:${params.serviceAccount}`;
        args.push('--as', saRef);
    }
    return args;
}

// ---------------------------------------------------------------------------
// LLM prompt for generating RBAC from a plain-English service description
// ---------------------------------------------------------------------------

export function buildRbacGeneratePrompt(params: {
    serviceName:  string;
    namespace:    string;
    description:  string;   // what this service does / what it needs to access
    awsRoleArn?:  string;   // if provided, generate IRSA-annotated ServiceAccount
    clusterWide?: boolean;  // needs ClusterRole vs namespaced Role
}): string {
    return [
        `Generate Kubernetes RBAC manifests for the following service.`,
        ``,
        `Service name: ${params.serviceName}`,
        `Namespace: ${params.namespace}`,
        `Description: ${params.description}`,
        params.awsRoleArn ? `AWS IAM Role ARN for IRSA: ${params.awsRoleArn}` : '',
        params.clusterWide ? `Scope: ClusterRole (needs cluster-wide access)` : `Scope: Namespaced Role (namespace: ${params.namespace})`,
        ``,
        `Generate:`,
        `  1. ServiceAccount manifest${params.awsRoleArn ? ' with IRSA annotation' : ''}`,
        `  2. ${params.clusterWide ? 'ClusterRole' : 'Role'} with least-privilege rules`,
        `  3. ${params.clusterWide ? 'ClusterRoleBinding' : 'RoleBinding'} binding the SA to the Role`,
        ``,
        `Best practices:`,
        `  - Apply principle of least privilege`,
        `  - Use standard labels: app.kubernetes.io/name, app.kubernetes.io/component`,
        `  - Never grant wildcard verbs (*) unless explicitly required`,
        `  - Never grant wildcard resources (*) unless explicitly required`,
        ``,
        `Return a JSON array: [{ "filename": "rbac-serviceaccount.yaml", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseRbacManifests(raw: string): RbacManifestFile[] {
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

// ---------------------------------------------------------------------------
// Audit helper: list what a ServiceAccount can do
// ---------------------------------------------------------------------------

/** Build a batch of `kubectl auth can-i` checks for common verbs/resources. */
export function buildRbacAuditChecks(serviceAccount: string, namespace: string): Array<{ verb: string; resource: string; args: string[] }> {
    const checks = [
        { verb: 'get',    resource: 'pods' },
        { verb: 'list',   resource: 'secrets' },
        { verb: 'create', resource: 'pods' },
        { verb: 'delete', resource: 'pods' },
        { verb: 'get',    resource: 'configmaps' },
        { verb: 'update', resource: 'deployments' },
        { verb: 'create', resource: 'clusterroles' },
    ];
    return checks.map((c) => ({
        ...c,
        args: buildKubectlCanIArgs({ ...c, namespace, serviceAccount, saNamespace: namespace }),
    }));
}
