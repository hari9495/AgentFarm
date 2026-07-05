/**
 * GitHub repo configuration for the autonomous PR loop.
 *
 * Resolves the token/owner/repo/base-branch the loop needs to clone a repo
 * into the workspace and open a PR — preferring explicit task input over the
 * runtime's environment — and builds an authenticated clone URL. Keeping this
 * pure makes the precedence rules and (critically) token redaction testable.
 */

export type GithubConfigInput = {
    token?: string;
    owner?: string;
    repo?: string;
    baseBranch?: string;
};

export type ResolvedGithubConfig = {
    token: string;
    owner: string;
    repo: string;
    baseBranch: string;
    /** true when token+owner+repo are all present (ready to clone + open a PR). */
    complete: boolean;
};

const firstNonEmpty = (...vals: Array<string | undefined>): string => {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
};

/** Resolve GitHub config, preferring explicit input over env vars. */
export function resolveGithubConfig(
    input: GithubConfigInput | undefined,
    env: Record<string, string | undefined>,
): ResolvedGithubConfig {
    const token = firstNonEmpty(input?.token, env['GITHUB_TOKEN']);
    const owner = firstNonEmpty(input?.owner, env['GITHUB_OWNER']);
    const repo = firstNonEmpty(input?.repo, env['GITHUB_REPO']);
    const baseBranch = firstNonEmpty(input?.baseBranch, env['GITHUB_DEFAULT_BASE_BRANCH']) || 'main';
    return { token, owner, repo, baseBranch, complete: Boolean(token && owner && repo) };
}

/**
 * Build a clone URL. With a token, embeds it as `x-access-token:<token>` so
 * `git clone` (and the resulting `origin` remote) are authenticated for push.
 * Without a token, returns a plain public URL.
 */
export function buildAuthenticatedCloneUrl(cfg: { token?: string; owner: string; repo: string }): string {
    const base = `github.com/${cfg.owner}/${cfg.repo}.git`;
    if (cfg.token && cfg.token.trim()) {
        return `https://x-access-token:${encodeURIComponent(cfg.token.trim())}@${base}`;
    }
    return `https://${base}`;
}

/** Mask an embedded credential so a clone URL is safe to log. */
export function redactToken(url: string): string {
    return url.replace(/(https:\/\/[^:/@]+:)[^@]+(@)/, '$1***$2');
}
