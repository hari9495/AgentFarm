export type InternalLoginPolicyConfig = {
    allowedDomains: string[];
    adminRoles: string[];
};

type InternalLoginIdentity = {
    email: string;
    role: string;
};

const parseCsv = (value: string | undefined): string[] => {
    const parsed = (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);

    return Array.from(new Set(parsed));
};

const getEmailDomain = (email: string): string | null => {
    const atIndex = email.lastIndexOf('@');
    if (atIndex < 0 || atIndex === email.length - 1) {
        return null;
    }
    return email.slice(atIndex + 1).toLowerCase();
};

export const getInternalLoginPolicyConfig = (
    env: NodeJS.ProcessEnv = process.env,
): InternalLoginPolicyConfig => ({
    allowedDomains: parseCsv(env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS),
    adminRoles: parseCsv(env.API_INTERNAL_LOGIN_ADMIN_ROLES),
});

export const isInternalLoginPolicyEmpty = (config: InternalLoginPolicyConfig): boolean =>
    config.allowedDomains.length === 0 && config.adminRoles.length === 0;

export const isInternalAccessAllowed = (
    identity: InternalLoginIdentity,
    config: InternalLoginPolicyConfig = getInternalLoginPolicyConfig(),
): boolean => {
    const domain = getEmailDomain(identity.email);
    const normalizedRole = identity.role.toLowerCase();

    const isDomainAllowed = domain !== null && config.allowedDomains.includes(domain);
    const isAdminRole = config.adminRoles.includes(normalizedRole);

    return isDomainAllowed || isAdminRole;
};

export const buildSanitizedInternalLoginPolicyReport = (
    config: InternalLoginPolicyConfig,
): {
    allowed_domains: string[];
    admin_roles: string[];
    allowed_domains_count: number;
    admin_roles_count: number;
    deny_all_mode: boolean;
} => ({
    allowed_domains: config.allowedDomains,
    admin_roles: config.adminRoles,
    allowed_domains_count: config.allowedDomains.length,
    admin_roles_count: config.adminRoles.length,
    deny_all_mode: isInternalLoginPolicyEmpty(config),
});
