// ============================================================================
// DEVOPS DNS & LOAD BALANCER BUILDER
//
// CLI command builders for DNS and load balancer management:
//
// DNS:
//   AWS Route53   — change-resource-record-sets, list-resource-record-sets
//   CloudFlare    — DNS record CRUD via REST API (curl)
//   Azure DNS     — az network dns record-set {A|CNAME|TXT|MX}
//   GCP Cloud DNS — gcloud dns record-sets transaction / import
//
// Load Balancer / Ingress:
//   AWS ELBv2     — ALB/NLB listener rule management
//   Kubernetes    — kubectl patch Ingress annotations
//   ACM           — aws acm request-certificate, describe-certificate
//
// Destructive operations (delete record, remove rule) require
// allow_destructive: true in the payload.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DnsProvider  = 'route53' | 'cloudflare' | 'azure' | 'gcp';
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'PTR';

export interface DnsRecord {
    provider:    DnsProvider;
    name:        string;    // FQDN
    type:        DnsRecordType;
    value:       string;    // IP / CNAME target / TXT value
    ttl?:        number;    // seconds
    proxied?:    boolean;   // CloudFlare: orange-cloud proxy
}

// ---------------------------------------------------------------------------
// AWS Route53 builders
// ---------------------------------------------------------------------------

/**
 * Build `aws route53 change-resource-record-sets` args.
 * The change batch JSON is returned separately and should be piped or written to a temp file.
 */
export function buildRoute53ChangeBatch(params: {
    action:         'UPSERT' | 'CREATE' | 'DELETE';
    name:           string;     // FQDN (must end with .)
    type:           DnsRecordType;
    value:          string;
    ttl?:           number;
    comment?:       string;
    aliasTarget?:   { dnsName: string; hostedZoneId: string; evaluateHealthCheck?: boolean };
}): Record<string, unknown> {
    const fqdn  = params.name.endsWith('.') ? params.name : `${params.name}.`;
    const batch: Record<string, unknown> = {
        Comment: params.comment ?? `Managed by AgentFarm DevOps agent`,
        Changes: [{
            Action: params.action,
            ResourceRecordSet: params.aliasTarget
                ? {
                    Name: fqdn,
                    Type: params.type,
                    AliasTarget: {
                        DNSName:              params.aliasTarget.dnsName,
                        HostedZoneId:         params.aliasTarget.hostedZoneId,
                        EvaluateTargetHealth: params.aliasTarget.evaluateHealthCheck ?? false,
                    },
                }
                : {
                    Name:            fqdn,
                    Type:            params.type,
                    TTL:             params.ttl ?? 300,
                    ResourceRecords: [{ Value: params.value }],
                },
        }],
    };
    return batch;
}

export function buildRoute53ChangeArgs(hostedZoneId: string, changeBatchJson: string): string[] {
    return ['aws', 'route53', 'change-resource-record-sets',
        '--hosted-zone-id', hostedZoneId,
        '--change-batch', changeBatchJson,
        '--output', 'json'];
}

export function buildRoute53ListRecordsArgs(hostedZoneId: string, maxItems = 100, startRecordName?: string): string[] {
    const args = ['aws', 'route53', 'list-resource-record-sets',
        '--hosted-zone-id', hostedZoneId,
        '--max-items', String(maxItems),
        '--output', 'json'];
    if (startRecordName) args.push('--start-record-name', startRecordName);
    return args;
}

export function buildRoute53ListZonesArgs(): string[] {
    return ['aws', 'route53', 'list-hosted-zones', '--output', 'json'];
}

// ---------------------------------------------------------------------------
// CloudFlare DNS builders (REST API via curl)
// ---------------------------------------------------------------------------

export function buildCloudFlareDnsArgs(params: {
    operation:  'create' | 'update' | 'delete' | 'list';
    zoneId:     string;
    apiToken:   string;
    name?:      string;
    type?:      DnsRecordType;
    content?:   string;
    ttl?:       number;
    proxied?:   boolean;
    recordId?:  string;   // required for update/delete
}): string[] {
    const baseUrl = `https://api.cloudflare.com/client/v4/zones/${params.zoneId}/dns_records`;
    const headers = ['-H', `Authorization: Bearer ${params.apiToken}`, '-H', 'Content-Type: application/json'];

    if (params.operation === 'list') {
        return ['curl', '-s', '-X', 'GET', baseUrl, ...headers];
    }
    if (params.operation === 'create') {
        const body = JSON.stringify({ type: params.type, name: params.name, content: params.content, ttl: params.ttl ?? 1, proxied: params.proxied ?? false });
        return ['curl', '-s', '-X', 'POST', baseUrl, ...headers, '-d', body];
    }
    if (params.operation === 'update') {
        const body = JSON.stringify({ type: params.type, name: params.name, content: params.content, ttl: params.ttl ?? 1, proxied: params.proxied ?? false });
        return ['curl', '-s', '-X', 'PUT', `${baseUrl}/${params.recordId}`, ...headers, '-d', body];
    }
    // delete
    return ['curl', '-s', '-X', 'DELETE', `${baseUrl}/${params.recordId}`, ...headers];
}

// ---------------------------------------------------------------------------
// Azure DNS builders
// ---------------------------------------------------------------------------

export function buildAzDnsArgs(params: {
    operation:     'create' | 'update' | 'delete' | 'list';
    zone:          string;
    resourceGroup: string;
    type:          DnsRecordType;
    name?:         string;   // relative record name (@ for apex)
    ipv4Address?:  string;   // A record
    cname?:        string;   // CNAME record
    txtValue?:     string;   // TXT record
    ttl?:          number;
    subscription?: string;
}): string[] {
    const typeSlug = params.type.toLowerCase();
    const base = ['az', 'network', 'dns', 'record-set', typeSlug, params.operation];

    const common: string[] = ['--zone-name', params.zone, '--resource-group', params.resourceGroup];
    if (params.subscription) common.push('--subscription', params.subscription);

    if (params.operation === 'list') {
        return [...base, ...common, '--output', 'json'];
    }

    common.push('--name', params.name ?? '@');
    if (params.ttl) common.push('--ttl', String(params.ttl));

    if (params.operation === 'create' || params.operation === 'update') {
        if (params.type === 'A'     && params.ipv4Address) common.push('--ipv4-address', params.ipv4Address);
        if (params.type === 'CNAME' && params.cname)       common.push('--cname',        params.cname);
        if (params.type === 'TXT'   && params.txtValue)    common.push('--value',         params.txtValue);
    }

    return [...base, ...common, '--output', 'json'];
}

// ---------------------------------------------------------------------------
// GCP Cloud DNS builders
// ---------------------------------------------------------------------------

export function buildGcloudDnsArgs(params: {
    operation:  'add-record-set' | 'delete' | 'list' | 'describe';
    zone:       string;         // managed zone name
    name?:      string;         // FQDN (must end with .)
    type?:      DnsRecordType;
    ttl?:       number;
    data?:      string;         // rrdatas value
    project?:   string;
}): string[] {
    const args = ['gcloud', 'dns', 'record-sets'];

    if (params.operation === 'list') {
        args.push('list', '--zone', params.zone, '--format=json');
        if (params.project) args.push('--project', params.project);
        return args;
    }

    if (params.operation === 'add-record-set') {
        args.push('create', params.name ?? '',
            '--zone', params.zone,
            '--type', params.type ?? 'A',
            '--ttl',  String(params.ttl ?? 300),
            '--rrdatas', params.data ?? '');
        if (params.project) args.push('--project', params.project);
        return args;
    }

    if (params.operation === 'delete') {
        args.push('delete', params.name ?? '',
            '--zone', params.zone,
            '--type', params.type ?? 'A');
        if (params.project) args.push('--project', params.project);
        args.push('--quiet');
        return args;
    }

    return args;
}

// ---------------------------------------------------------------------------
// AWS ELBv2 (ALB / NLB) builders
// ---------------------------------------------------------------------------

export function buildAlbListenerRuleArgs(params: {
    operation:      'create' | 'modify' | 'delete' | 'describe';
    listenerArn:    string;
    priority?:      number;
    conditionField?: 'host-header' | 'path-pattern' | 'http-header' | 'query-string';
    conditionValues?: string[];
    targetGroupArn?: string;
    redirectUrl?:   string;
    ruleArn?:       string;   // for modify/delete
    region?:        string;
}): string[] {
    const args = ['aws', 'elbv2', `${params.operation}-rule`, '--output', 'json'];
    if (params.region) args.push('--region', params.region);

    if (params.operation === 'describe') {
        args.push('--listener-arn', params.listenerArn);
        return args;
    }

    if (params.operation === 'delete') {
        args.push('--rule-arn', params.ruleArn ?? '');
        return args;
    }

    if (params.operation === 'create') {
        args.push('--listener-arn', params.listenerArn);
        args.push('--priority',     String(params.priority ?? 100));

        if (params.conditionField && params.conditionValues) {
            args.push('--conditions',
                JSON.stringify([{ Field: params.conditionField, Values: params.conditionValues }]));
        }

        const actions = params.targetGroupArn
            ? [{ Type: 'forward', TargetGroupArn: params.targetGroupArn }]
            : [{ Type: 'redirect', RedirectConfig: { Protocol: 'HTTPS', StatusCode: 'HTTP_301' } }];
        args.push('--actions', JSON.stringify(actions));
        return args;
    }

    // modify
    args.push('--rule-arn', params.ruleArn ?? '');
    if (params.conditionField && params.conditionValues) {
        args.push('--conditions',
            JSON.stringify([{ Field: params.conditionField, Values: params.conditionValues }]));
    }
    return args;
}

export function buildAlbDescribeListenersArgs(loadBalancerArn: string, region?: string): string[] {
    const args = ['aws', 'elbv2', 'describe-listeners', '--load-balancer-arn', loadBalancerArn, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildAlbDescribeTargetGroupHealthArgs(targetGroupArn: string, region?: string): string[] {
    const args = ['aws', 'elbv2', 'describe-target-health', '--target-group-arn', targetGroupArn, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

// ---------------------------------------------------------------------------
// Kubernetes Ingress patch builder
// ---------------------------------------------------------------------------

/**
 * Generate a kubectl patch command to add/update annotations on an Ingress.
 * Common use: nginx.ingress.kubernetes.io/rewrite-target, ssl-redirect,
 * rate limiting, CORS headers, etc.
 */
export function buildKubectlPatchIngressArgs(params: {
    name:        string;
    namespace:   string;
    annotations: Record<string, string>;
}): string[] {
    const patch = { metadata: { annotations: params.annotations } };
    return ['kubectl', 'patch', 'ingress', params.name,
        '-n', params.namespace,
        '--type=merge',
        '--patch', JSON.stringify(patch)];
}

/** Build a full Ingress YAML with custom annotations. */
export function buildIngressYaml(params: {
    name:         string;
    namespace:    string;
    host:         string;
    serviceName:  string;
    servicePort:  number;
    tlsSecretName?: string;
    annotations?: Record<string, string>;
    ingressClass?: string;   // default: nginx
    pathPrefix?:  string;    // default: /
}): string {
    const annotations = {
        'kubernetes.io/ingress.class':  params.ingressClass ?? 'nginx',
        ...(params.annotations ?? {}),
    };
    const annotationsYaml = Object.entries(annotations)
        .map(([k, v]) => `    ${k}: "${v}"`).join('\n');

    const tlsYaml = params.tlsSecretName ? `
  tls:
    - hosts:
        - ${params.host}
      secretName: ${params.tlsSecretName}` : '';

    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
  annotations:
${annotationsYaml}
spec${tlsYaml}:
  rules:
    - host: ${params.host}
      http:
        paths:
          - path: ${params.pathPrefix ?? '/'}
            pathType: Prefix
            backend:
              service:
                name: ${params.serviceName}
                port:
                  number: ${params.servicePort}`;
}

// ---------------------------------------------------------------------------
// AWS ACM (Certificate Manager) builders
// ---------------------------------------------------------------------------

export function buildAcmRequestCertArgs(params: {
    domain:             string;
    alternateNames?:    string[];
    validationMethod?:  'DNS' | 'EMAIL';   // default: DNS
    region?:            string;
    idempotencyToken?:  string;
}): string[] {
    const args = ['aws', 'acm', 'request-certificate',
        '--domain-name', params.domain,
        '--validation-method', params.validationMethod ?? 'DNS',
        '--output', 'json'];
    if (params.alternateNames?.length) args.push('--subject-alternative-names', ...params.alternateNames);
    if (params.region)            args.push('--region', params.region);
    if (params.idempotencyToken)  args.push('--idempotency-token', params.idempotencyToken);
    return args;
}

export function buildAcmDescribeCertArgs(certArn: string, region?: string): string[] {
    const args = ['aws', 'acm', 'describe-certificate', '--certificate-arn', certArn, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseRoute53Records(raw: string): DnsRecord[] {
    try {
        const json = JSON.parse(raw) as { ResourceRecordSets?: Array<{ Name?: string; Type?: string; TTL?: number; ResourceRecords?: Array<{ Value: string }> }> };
        return (json.ResourceRecordSets ?? []).map((r) => ({
            provider: 'route53' as DnsProvider,
            name:     r.Name ?? '',
            type:     (r.Type ?? 'A') as DnsRecordType,
            value:    r.ResourceRecords?.[0]?.Value ?? '',
            ttl:      r.TTL,
        }));
    } catch {
        return [];
    }
}

export function parseCloudFlareDnsRecords(raw: string): DnsRecord[] {
    try {
        const json = JSON.parse(raw) as { result?: Array<{ name?: string; type?: string; content?: string; ttl?: number; proxied?: boolean }> };
        return (json.result ?? []).map((r) => ({
            provider: 'cloudflare' as DnsProvider,
            name:     r.name ?? '',
            type:     (r.type ?? 'A') as DnsRecordType,
            value:    r.content ?? '',
            ttl:      r.ttl,
            proxied:  r.proxied,
        }));
    } catch {
        return [];
    }
}

export function parseAcmCertStatus(raw: string): { certArn: string; domainName: string; status: string; validationRecords?: Array<{ name: string; value: string; type: string }> } | null {
    try {
        const json = JSON.parse(raw) as { Certificate?: { CertificateArn?: string; DomainName?: string; Status?: string; DomainValidationOptions?: Array<{ ResourceRecord?: { Name?: string; Value?: string; Type?: string } }> } };
        const cert = json.Certificate;
        return {
            certArn:    cert?.CertificateArn ?? '',
            domainName: cert?.DomainName ?? '',
            status:     cert?.Status ?? '',
            validationRecords: (cert?.DomainValidationOptions ?? [])
                .filter((d) => d.ResourceRecord)
                .map((d) => ({ name: d.ResourceRecord!.Name ?? '', value: d.ResourceRecord!.Value ?? '', type: d.ResourceRecord!.Type ?? '' })),
        };
    } catch {
        return null;
    }
}
