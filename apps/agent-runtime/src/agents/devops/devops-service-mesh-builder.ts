// ============================================================================
// DEVOPS SERVICE MESH BUILDER
//
// Builders for Istio and Linkerd service mesh configuration:
//
// Istio CRDs:
//   VirtualService       — routing rules, retries, timeouts, fault injection
//   DestinationRule      — load balancing, circuit breaker, mTLS, subsets
//   PeerAuthentication   — mTLS mode per namespace/workload
//   AuthorizationPolicy  — fine-grained access control
//   ServiceEntry         — register external services in the mesh
//   Gateway              — expose services outside the mesh
//
// Linkerd:
//   ServiceProfile        — per-route metrics, retries, timeouts
//   linkerd check          — verify mesh health
//   linkerd inject         — inject sidecar via annotation
//
// Also includes istioctl CLI builders and LLM prompt for mesh config generation.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeshProvider = 'istio' | 'linkerd';
export type IstioMtlsMode = 'STRICT' | 'PERMISSIVE' | 'DISABLE';
export type IstioLoadBalancer = 'ROUND_ROBIN' | 'LEAST_CONN' | 'RANDOM' | 'PASSTHROUGH';

export interface IstioRetryPolicy {
    attempts:         number;        // number of retries
    perTryTimeout?:   string;        // e.g. '2s'
    retryOn?:         string;        // comma-separated: '5xx,gateway-error,reset'
}

export interface IstioCircuitBreaker {
    consecutiveGatewayErrors?: number;    // default: 5
    interval?:                  string;   // default: '10s'
    baseEjectionTime?:          string;   // default: '30s'
    maxEjectionPercent?:        number;   // default: 10 (%)
    minHealthPercent?:          number;   // default: 50
}

export interface IstioFaultInjection {
    abort?: { httpStatus: number; percentage: number };
    delay?: { fixedDelay: string;  percentage: number };
}

export interface IstioRouteDestination {
    host:      string;
    subset?:   string;
    port?:     number;
    weight?:   number;
}

// ---------------------------------------------------------------------------
// Istio VirtualService builder
// ---------------------------------------------------------------------------

export function buildIstioVirtualServiceYaml(params: {
    name:             string;
    namespace:        string;
    hosts:            string[];
    gateways?:        string[];      // attach to Gateway(s)
    timeout?:         string;        // e.g. '30s'
    retries?:         IstioRetryPolicy;
    fault?:           IstioFaultInjection;
    routes:           Array<{
        match?:       Array<{ uri?: { prefix?: string; exact?: string }; headers?: Record<string, { exact?: string; regex?: string }> }>;
        destinations: IstioRouteDestination[];
    }>;
}): string {
    const gatewaysYaml = params.gateways?.length
        ? `  gateways:\n${params.gateways.map((g) => `    - ${g}`).join('\n')}`
        : '';

    const routesYaml = params.routes.map((route) => {
        const matchYaml = (route.match ?? []).map((m) => {
            const lines: string[] = ['    - match:'];
            if (m.uri?.prefix) lines.push(`        uri:\n          prefix: ${m.uri.prefix}`);
            if (m.uri?.exact)  lines.push(`        uri:\n          exact: ${m.uri.exact}`);
            if (m.headers)     lines.push(...Object.entries(m.headers).map(([h, v]) =>
                `        headers:\n          ${h}:\n            ${v.exact ? `exact: ${v.exact}` : `regex: ${v.regex}`}`));
            return lines.join('\n');
        }).join('\n');

        const destYaml = route.destinations.map((d) => [
            `      - destination:`,
            `          host: ${d.host}`,
            d.subset    ? `          subset: ${d.subset}`   : '',
            d.port      ? `          port:\n            number: ${d.port}` : '',
            d.weight !== undefined ? `        weight: ${d.weight}` : '',
        ].filter(Boolean).join('\n')).join('\n');

        const retryYaml = params.retries
            ? `      retries:\n        attempts: ${params.retries.attempts}\n${params.retries.perTryTimeout ? `        perTryTimeout: ${params.retries.perTryTimeout}\n` : ''}${params.retries.retryOn ? `        retryOn: ${params.retries.retryOn}` : ''}`
            : '';

        const timeoutLine = params.timeout ? `      timeout: ${params.timeout}` : '';
        return [matchYaml, `    - route:`, destYaml, retryYaml, timeoutLine].filter(Boolean).join('\n');
    }).join('\n');

    return `apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  hosts:
${params.hosts.map((h) => `    - ${h}`).join('\n')}
${gatewaysYaml}
  http:
${routesYaml}`;
}

// ---------------------------------------------------------------------------
// Istio DestinationRule builder
// ---------------------------------------------------------------------------

export function buildIstioDestinationRuleYaml(params: {
    name:            string;
    namespace:       string;
    host:            string;
    loadBalancer?:   IstioLoadBalancer;
    circuitBreaker?: IstioCircuitBreaker;
    mtls?:           IstioMtlsMode;
    subsets?:        Array<{ name: string; labels: Record<string, string>; trafficPolicy?: { connectionPool?: { tcp?: { maxConnections?: number } } } }>;
}): string {
    const cbYaml = params.circuitBreaker ? `    outlierDetection:
      consecutive5xxErrors: ${params.circuitBreaker.consecutiveGatewayErrors ?? 5}
      interval: ${params.circuitBreaker.interval ?? '10s'}
      baseEjectionTime: ${params.circuitBreaker.baseEjectionTime ?? '30s'}
      maxEjectionPercent: ${params.circuitBreaker.maxEjectionPercent ?? 10}
      minHealthPercent: ${params.circuitBreaker.minHealthPercent ?? 50}` : '';

    const lbYaml   = params.loadBalancer ? `    loadBalancer:\n      simple: ${params.loadBalancer}` : '';
    const mtlsYaml = params.mtls ? `    tls:\n      mode: ${params.mtls}` : '';

    const subsetsYaml = (params.subsets ?? []).map((s) => {
        const labelsYaml = Object.entries(s.labels).map(([k, v]) => `      ${k}: ${v}`).join('\n');
        return [`  - name: ${s.name}`, `    labels:`, labelsYaml].join('\n');
    }).join('\n');

    return `apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  host: ${params.host}
  trafficPolicy:
${[lbYaml, cbYaml, mtlsYaml].filter(Boolean).join('\n')}
${subsetsYaml ? `  subsets:\n${subsetsYaml}` : ''}`;
}

// ---------------------------------------------------------------------------
// Istio PeerAuthentication (mTLS) builder
// ---------------------------------------------------------------------------

export function buildIstioPeerAuthYaml(params: {
    name:       string;
    namespace:  string;
    mode:       IstioMtlsMode;
    selector?:  Record<string, string>;   // workload selector (omit for namespace-wide)
}): string {
    const selectorYaml = params.selector
        ? `  selector:\n    matchLabels:\n${Object.entries(params.selector).map(([k, v]) => `      ${k}: ${v}`).join('\n')}`
        : '';

    return `apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
${selectorYaml}
  mtls:
    mode: ${params.mode}`;
}

// ---------------------------------------------------------------------------
// Istio AuthorizationPolicy builder
// ---------------------------------------------------------------------------

export function buildIstioAuthzPolicyYaml(params: {
    name:       string;
    namespace:  string;
    action:     'ALLOW' | 'DENY' | 'AUDIT' | 'CUSTOM';
    selector?:  Record<string, string>;
    rules: Array<{
        from?: Array<{ principals?: string[]; namespaces?: string[] }>;
        to?:   Array<{ operation?: { methods?: string[]; paths?: string[] } }>;
    }>;
}): string {
    const selectorYaml = params.selector
        ? `  selector:\n    matchLabels:\n${Object.entries(params.selector).map(([k, v]) => `      ${k}: ${v}`).join('\n')}`
        : '';

    const rulesYaml = params.rules.map((rule) => {
        const parts: string[] = ['  - '];
        if (rule.from?.length) {
            parts.push(`    from:`);
            rule.from.forEach((f) => {
                parts.push(`      - source:`);
                if (f.principals?.length)  parts.push(`          principals: [${f.principals.map((p) => `"${p}"`).join(', ')}]`);
                if (f.namespaces?.length)  parts.push(`          namespaces: [${f.namespaces.map((n) => `"${n}"`).join(', ')}]`);
            });
        }
        if (rule.to?.length) {
            parts.push(`    to:`);
            rule.to.forEach((t) => {
                parts.push(`      - operation:`);
                if (t.operation?.methods?.length) parts.push(`          methods: [${t.operation.methods.map((m) => `"${m}"`).join(', ')}]`);
                if (t.operation?.paths?.length)   parts.push(`          paths: [${t.operation.paths.map((p) => `"${p}"`).join(', ')}]`);
            });
        }
        return parts.join('\n');
    }).join('\n');

    return `apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
${selectorYaml}
  action: ${params.action}
  rules:
${rulesYaml}`;
}

// ---------------------------------------------------------------------------
// Istio Gateway builder
// ---------------------------------------------------------------------------

export function buildIstioGatewayYaml(params: {
    name:       string;
    namespace:  string;
    selector:   Record<string, string>;  // e.g. { istio: 'ingressgateway' }
    hosts:      string[];
    port?:      number;
    protocol?:  'HTTP' | 'HTTPS' | 'GRPC' | 'HTTP2';
    tlsSecret?: string;
    httpsRedirect?: boolean;
}): string {
    const port     = params.port     ?? (params.tlsSecret ? 443 : 80);
    const protocol = params.protocol ?? (params.tlsSecret ? 'HTTPS' : 'HTTP');
    const tlsYaml  = params.tlsSecret ? `\n        tls:\n          mode: SIMPLE\n          credentialName: ${params.tlsSecret}` : '';
    const redirectYaml = params.httpsRedirect ? `\n        tls:\n          httpsRedirect: true` : '';
    const selectorYaml = Object.entries(params.selector).map(([k, v]) => `      ${k}: ${v}`).join('\n');

    return `apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  selector:
${selectorYaml}
  servers:
    - port:
        number: ${port}
        name: ${protocol.toLowerCase()}
        protocol: ${protocol}${tlsYaml}${redirectYaml}
      hosts:
${params.hosts.map((h) => `        - "${h}"`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// Linkerd ServiceProfile builder
// ---------------------------------------------------------------------------

export function buildLinkerdServiceProfileYaml(params: {
    name:       string;        // should match the Service FQDN
    namespace:  string;
    routes?: Array<{
        name:          string;
        condition:     { method?: string; pathRegex?: string };
        timeout?:      string;
        isRetryable?:  boolean;
    }>;
}): string {
    const routesYaml = (params.routes ?? []).map((r) => [
        `  - name: ${r.name}`,
        `    condition:`,
        r.condition.method    ? `      method: ${r.condition.method}`            : '',
        r.condition.pathRegex ? `      pathRegex: "${r.condition.pathRegex}"`    : '',
        r.timeout     ? `    timeout: ${r.timeout}`      : '',
        r.isRetryable ? `    isRetryable: true`           : '',
    ].filter(Boolean).join('\n')).join('\n');

    return `apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  routes:
${routesYaml}`;
}

// ---------------------------------------------------------------------------
// istioctl CLI builders
// ---------------------------------------------------------------------------

export function buildIstioCtlAnalyzeArgs(namespace?: string, files?: string[]): string[] {
    const args = ['istioctl', 'analyze'];
    if (namespace) args.push('-n', namespace);
    if (files?.length) args.push(...files);
    return args;
}

export function buildIstioCtlProxyStatusArgs(pod?: string, namespace?: string): string[] {
    const args = ['istioctl', 'proxy-status'];
    if (pod && namespace) args.push(`${pod}.${namespace}`);
    else if (pod)         args.push(pod);
    return args;
}

export function buildIstioCtlProxyConfigArgs(pod: string, namespace: string, configType: 'listener' | 'route' | 'cluster' | 'endpoint' | 'all' = 'all'): string[] {
    return ['istioctl', 'proxy-config', configType, `${pod}.${namespace}`, '-o', 'json'];
}

export function buildIstioCtlInstallArgs(profile: 'default' | 'minimal' | 'demo' | 'empty' = 'default', set?: Record<string, string>): string[] {
    const args = ['istioctl', 'install', '--profile', profile, '-y'];
    for (const [k, v] of Object.entries(set ?? {})) args.push('--set', `${k}=${v}`);
    return args;
}

// ---------------------------------------------------------------------------
// Linkerd CLI builders
// ---------------------------------------------------------------------------

export function buildLinkerdCheckArgs(preInstall = false): string[] {
    const args = ['linkerd', 'check'];
    if (preInstall) args.push('--pre');
    return args;
}

export function buildLinkerdInjectArgs(manifestPath: string, ignoreInboundPorts?: number[]): string[] {
    const args = ['linkerd', 'inject', manifestPath];
    if (ignoreInboundPorts?.length) args.push('--ignore-inbound-ports', ignoreInboundPorts.join(','));
    return args;
}

export function buildLinkerdStatArgs(resourceType: 'deployment' | 'pod' | 'namespace' | 'daemonset', namespace?: string, resourceName?: string): string[] {
    const args = ['linkerd', 'stat', resourceType];
    if (resourceName) args.push(resourceName);
    if (namespace)    args.push('-n', namespace);
    return args;
}

export function buildLinkerdTopArgs(namespace: string, deployment?: string): string[] {
    const args = ['linkerd', 'top', 'deployment'];
    if (deployment) args.push(deployment);
    args.push('-n', namespace);
    return args;
}

// ---------------------------------------------------------------------------
// LLM prompt for mesh config generation
// ---------------------------------------------------------------------------

export function buildServiceMeshPrompt(params: {
    provider:      MeshProvider;
    appName:       string;
    namespace:     string;
    description:   string;
    services:      Array<{ name: string; port: number; version?: string }>;
    features: {
        retries?:       boolean;
        circuitBreaker?: boolean;
        mtls?:          boolean;
        rateLimiting?:  boolean;
        canaryTraffic?: { stablePercent: number; canaryPercent: number };
        faultInjection?: boolean;
    };
}): string {
    const featureList = [
        params.features.retries         ? '- Retry policy (3 attempts, 2s per-try timeout, on: 5xx,gateway-error,reset)' : '',
        params.features.circuitBreaker  ? '- Circuit breaker (eject after 5 consecutive errors, 30s base ejection time)'  : '',
        params.features.mtls            ? '- mTLS STRICT mode (PeerAuthentication + DestinationRule tls: ISTIO_MUTUAL)'   : '',
        params.features.rateLimiting    ? '- Rate limiting via EnvoyFilter / Linkerd ServiceProfile'                       : '',
        params.features.faultInjection  ? '- Fault injection (0.1% abort, 1% delay) for chaos testing'                   : '',
        params.features.canaryTraffic
            ? `- Canary traffic split: ${params.features.canaryTraffic.stablePercent}% stable / ${params.features.canaryTraffic.canaryPercent}% canary` : '',
    ].filter(Boolean).join('\n');

    const serviceList = params.services.map((s) =>
        `  - ${s.name} (port ${s.port}${s.version ? `, version: ${s.version}` : ''})`).join('\n');

    return [
        `Generate ${params.provider === 'istio' ? 'Istio' : 'Linkerd'} service mesh configuration for the following application.`,
        ``,
        `App: ${params.appName}`,
        `Namespace: ${params.namespace}`,
        `Description: ${params.description}`,
        `Mesh provider: ${params.provider}`,
        ``,
        `Services:`,
        serviceList,
        ``,
        `Required features:`,
        featureList,
        ``,
        params.provider === 'istio' ? [
            `Istio requirements:`,
            `  - Use apiVersion: networking.istio.io/v1alpha3 for VirtualService/DestinationRule`,
            `  - Use apiVersion: security.istio.io/v1beta1 for PeerAuthentication/AuthorizationPolicy`,
            `  - All YAML must be valid for Istio 1.18+`,
        ].join('\n') : [
            `Linkerd requirements:`,
            `  - Use apiVersion: linkerd.io/v1alpha2 for ServiceProfile`,
            `  - Add linkerd.io/inject: enabled annotation to namespace or deployments`,
        ].join('\n'),
        ``,
        `Return a JSON array: [{ "filename": "...", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseServiceMeshOutput(raw: string): Array<{ filename: string; content: string }> {
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
