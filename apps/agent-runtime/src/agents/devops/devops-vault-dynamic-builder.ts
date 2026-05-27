// ============================================================================
// DEVOPS VAULT DYNAMIC SECRETS BUILDER
//
// Builders for HashiCorp Vault dynamic secret operations used by the
// workspace_devops_vault_dynamic action.
//
// Sub-actions:
//   lease_renew         — vault lease renew
//   lease_revoke        — vault lease revoke
//   lease_lookup        — vault lease lookup
//   lease_revoke_prefix — vault lease revoke -prefix
//   lease_list          — vault list sys/leases/lookup/<prefix>
//   read_dynamic        — vault read <path> (generic dynamic read)
//   aws_creds           — vault read aws/creds/<role>
//   db_creds            — vault read database/creds/<role>
//   pki_issue           — vault write pki/issue/<role>
//   ssh_sign            — vault write ssh/sign/<role>
//   kv_metadata         — vault kv metadata get <path>
//   token_create        — vault token create
//   token_renew         — vault token renew
//   token_revoke        — vault token revoke
//   token_lookup        — vault token lookup
//   token_capabilities  — vault token capabilities <path>
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultLease {
    lease_id:     string;
    renewable:    boolean;
    lease_duration: number;
    expire_time?:  string;
}

export interface VaultDynamicCreds {
    lease_id:       string;
    lease_duration: number;
    renewable:      boolean;
    data:           Record<string, string>;
}

export interface VaultTokenInfo {
    accessor:       string;
    display_name?:  string;
    policies:       string[];
    ttl:            number;
    expire_time?:   string;
    renewable:      boolean;
    entity_id?:     string;
}

export interface VaultPkiCert {
    serial_number:   string;
    certificate:     string;
    issuing_ca:      string;
    ca_chain:        string[];
    private_key:     string;
    private_key_type: string;
    expiration:      number;
}

// ---------------------------------------------------------------------------
// Lease management builders
// ---------------------------------------------------------------------------

function vaultEnv(token?: string, addr?: string): string[] {
    const env: string[] = [];
    if (token) { env.push(`VAULT_TOKEN=${token}`); }
    if (addr)  { env.push(`VAULT_ADDR=${addr}`);   }
    return env;
}

function vaultCmd(subcommands: string[], token?: string, addr?: string): string[] {
    const envParts = vaultEnv(token, addr);
    if (envParts.length > 0) {
        return ['sh', '-c', `${envParts.join(' ')} vault ${subcommands.join(' ')}`];
    }
    return ['vault', ...subcommands];
}

export function buildVaultLeaseRenewArgs(params: {
    leaseId:    string;
    increment?: number;
    token?:     string;
    addr?:      string;
}): string[] {
    const args = ['lease', 'renew'];
    if (params.increment) { args.push('-increment', String(params.increment)); }
    args.push(params.leaseId);
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultLeaseRevokeArgs(params: {
    leaseId: string;
    force?:  boolean;
    token?:  string;
    addr?:   string;
}): string[] {
    const args = ['lease', 'revoke'];
    if (params.force) { args.push('-force'); }
    args.push(params.leaseId);
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultLeaseLookupArgs(params: {
    leaseId: string;
    token?:  string;
    addr?:   string;
}): string[] {
    return vaultCmd(['lease', 'lookup', params.leaseId], params.token, params.addr);
}

export function buildVaultLeaseRevokeByPrefixArgs(params: {
    prefix: string;
    force?: boolean;
    token?: string;
    addr?:  string;
}): string[] {
    const args = ['lease', 'revoke', '-prefix'];
    if (params.force) { args.push('-force'); }
    args.push(params.prefix);
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultLeaseListArgs(params: {
    prefix: string;
    token?: string;
    addr?:  string;
}): string[] {
    return vaultCmd(['list', `sys/leases/lookup/${params.prefix.replace(/^\//, '')}`], params.token, params.addr);
}

// ---------------------------------------------------------------------------
// Dynamic credential builders
// ---------------------------------------------------------------------------

export function buildVaultDynamicReadArgs(params: {
    path:   string;
    token?: string;
    addr?:  string;
    format?: 'json' | 'table';
}): string[] {
    const args = ['read'];
    if (params.format === 'json') { args.push('-format=json'); }
    args.push(params.path);
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultAwsCredsArgs(params: {
    role:   string;
    mount?: string;
    token?: string;
    addr?:  string;
    ttl?:   string;
}): string[] {
    const mount = (params.mount ?? 'aws').replace(/\/$/, '');
    const args  = ['read', '-format=json'];
    if (params.ttl) { args.push(`-ttl=${params.ttl}`); }
    args.push(`${mount}/creds/${params.role}`);
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultDbCredsArgs(params: {
    role:   string;
    mount?: string;
    token?: string;
    addr?:  string;
}): string[] {
    const mount = (params.mount ?? 'database').replace(/\/$/, '');
    return vaultCmd(['read', '-format=json', `${mount}/creds/${params.role}`], params.token, params.addr);
}

export function buildVaultPkiIssueArgs(params: {
    role:        string;
    commonName:  string;
    mount?:      string;
    ttl?:        string;
    altNames?:   string[];
    ipSans?:     string[];
    token?:      string;
    addr?:       string;
}): string[] {
    const mount = (params.mount ?? 'pki').replace(/\/$/, '');
    const args  = ['write', '-format=json', `${mount}/issue/${params.role}`,
        `common_name=${params.commonName}`];
    if (params.ttl)                       { args.push(`ttl=${params.ttl}`); }
    if (params.altNames?.length)          { args.push(`alt_names=${params.altNames.join(',')}`); }
    if (params.ipSans?.length)            { args.push(`ip_sans=${params.ipSans.join(',')}`); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultSshSignArgs(params: {
    role:          string;
    publicKeyPath: string;
    mount?:        string;
    validPrincipals?: string[];
    ttl?:          string;
    token?:        string;
    addr?:         string;
}): string[] {
    const mount = (params.mount ?? 'ssh').replace(/\/$/, '');
    const args  = ['write', '-format=json', `${mount}/sign/${params.role}`,
        `public_key=@${params.publicKeyPath}`];
    if (params.validPrincipals?.length) { args.push(`valid_principals=${params.validPrincipals.join(',')}`); }
    if (params.ttl)                     { args.push(`ttl=${params.ttl}`); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultKvMetadataArgs(params: {
    path:   string;
    mount?: string;
    token?: string;
    addr?:  string;
}): string[] {
    const mount = params.mount ?? 'secret';
    return vaultCmd(['kv', 'metadata', 'get', '-mount', mount, '-format=json', params.path], params.token, params.addr);
}

// ---------------------------------------------------------------------------
// Token builders
// ---------------------------------------------------------------------------

export function buildVaultTokenCreateArgs(params: {
    policies?:     string[];
    ttl?:          string;
    displayName?:  string;
    numUses?:      number;
    renewable?:    boolean;
    noParent?:     boolean;
    token?:        string;
    addr?:         string;
}): string[] {
    const args = ['token', 'create', '-format=json'];
    if (params.policies?.length)    { args.push(`-policy=${params.policies.join(',')}`); }
    if (params.ttl)                 { args.push(`-ttl=${params.ttl}`); }
    if (params.displayName)         { args.push(`-display-name=${params.displayName}`); }
    if (params.numUses)             { args.push(`-use-limit=${params.numUses}`); }
    if (params.renewable === false) { args.push('-no-default-policy'); }
    if (params.noParent)            { args.push('-no-parent'); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultTokenRenewArgs(params: {
    token?:     string;
    self?:      boolean;
    increment?: string;
    addr?:      string;
}): string[] {
    const args = ['token', 'renew', '-format=json'];
    if (params.increment) { args.push(`-increment=${params.increment}`); }
    if (!params.self && params.token) { args.push(params.token); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultTokenRevokeArgs(params: {
    token:  string;
    self?:  boolean;
    addr?:  string;
}): string[] {
    const args = ['token', 'revoke', '-format=json'];
    if (params.self) { args.push('-self'); } else { args.push(params.token); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultTokenLookupArgs(params: {
    token?: string;
    self?:  boolean;
    addr?:  string;
}): string[] {
    const args = ['token', 'lookup', '-format=json'];
    if (!params.self && params.token) { args.push(params.token); }
    return vaultCmd(args, params.token, params.addr);
}

export function buildVaultTokenCapabilitiesArgs(params: {
    path:   string;
    token?: string;
    addr?:  string;
}): string[] {
    return vaultCmd(['token', 'capabilities', params.path], params.token, params.addr);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseVaultLease(raw: string): VaultLease | null {
    try {
        const j = JSON.parse(raw);
        return {
            lease_id:       j.lease_id       ?? j.data?.lease_id       ?? '',
            renewable:      j.renewable       ?? j.data?.renewable       ?? false,
            lease_duration: j.lease_duration  ?? j.data?.lease_duration  ?? 0,
            expire_time:    j.expire_time     ?? j.data?.expire_time,
        };
    } catch { return null; }
}

export function parseVaultDynamicCreds(raw: string): VaultDynamicCreds | null {
    try {
        const j = JSON.parse(raw);
        return {
            lease_id:       j.lease_id       ?? '',
            lease_duration: j.lease_duration ?? 0,
            renewable:      j.renewable      ?? false,
            data:           j.data           ?? {},
        };
    } catch { return null; }
}

export function parseVaultTokenInfo(raw: string): VaultTokenInfo | null {
    try {
        const j    = JSON.parse(raw);
        const data = j.data ?? j;
        return {
            accessor:      data.accessor      ?? '',
            display_name:  data.display_name  || undefined,
            policies:      data.policies      ?? [],
            ttl:           data.ttl           ?? 0,
            expire_time:   data.expire_time   || undefined,
            renewable:     data.renewable     ?? false,
            entity_id:     data.entity_id     || undefined,
        };
    } catch { return null; }
}

export function parseVaultPkiCert(raw: string): VaultPkiCert | null {
    try {
        const j    = JSON.parse(raw);
        const data = j.data ?? {};
        return {
            serial_number:    data.serial_number    ?? '',
            certificate:      data.certificate      ?? '',
            issuing_ca:       data.issuing_ca        ?? '',
            ca_chain:         data.ca_chain          ?? [],
            private_key:      data.private_key       ?? '',
            private_key_type: data.private_key_type  ?? '',
            expiration:       data.expiration        ?? 0,
        };
    } catch { return null; }
}

export function formatVaultLeaseReport(lease: VaultLease): string {
    const expiry  = lease.expire_time ? new Date(lease.expire_time).toISOString() : `${lease.lease_duration}s TTL`;
    const renew   = lease.renewable ? '✅ Renewable' : '❌ Non-renewable';
    return [`# Vault Lease`, `- **ID:** \`${lease.lease_id}\``, `- **Expires:** ${expiry}`, `- **Status:** ${renew}`].join('\n');
}
