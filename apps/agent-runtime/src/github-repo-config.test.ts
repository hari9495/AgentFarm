import test from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveGithubConfig,
    buildAuthenticatedCloneUrl,
    redactToken,
} from './github-repo-config.js';

// ---------------------------------------------------------------------------
// resolveGithubConfig — payload input takes precedence over env
// ---------------------------------------------------------------------------

test('resolveGithubConfig prefers explicit input over env', () => {
    const cfg = resolveGithubConfig(
        { token: 'tok-input', owner: 'acme', repo: 'web', baseBranch: 'develop' },
        { GITHUB_TOKEN: 'tok-env', GITHUB_OWNER: 'env-owner', GITHUB_REPO: 'env-repo' },
    );
    assert.deepEqual(cfg, { token: 'tok-input', owner: 'acme', repo: 'web', baseBranch: 'develop', complete: true });
});

test('resolveGithubConfig falls back to env when input is partial/absent', () => {
    const cfg = resolveGithubConfig(
        { owner: 'acme' },
        { GITHUB_TOKEN: 'tok-env', GITHUB_OWNER: 'env-owner', GITHUB_REPO: 'env-repo', GITHUB_DEFAULT_BASE_BRANCH: 'main' },
    );
    assert.equal(cfg.token, 'tok-env');
    assert.equal(cfg.owner, 'acme'); // input wins
    assert.equal(cfg.repo, 'env-repo');
    assert.equal(cfg.baseBranch, 'main');
});

test('resolveGithubConfig defaults baseBranch to main when unset', () => {
    const cfg = resolveGithubConfig({ token: 't', owner: 'o', repo: 'r' }, {});
    assert.equal(cfg.baseBranch, 'main');
});

test('resolveGithubConfig reports completeness for clone/PR readiness', () => {
    assert.equal(resolveGithubConfig({ token: 't', owner: 'o', repo: 'r' }, {}).complete, true);
    assert.equal(resolveGithubConfig({ owner: 'o', repo: 'r' }, {}).complete, false); // no token
    assert.equal(resolveGithubConfig({ token: 't', repo: 'r' }, {}).complete, false); // no owner
});

// ---------------------------------------------------------------------------
// buildAuthenticatedCloneUrl
// ---------------------------------------------------------------------------

test('buildAuthenticatedCloneUrl embeds the token via x-access-token', () => {
    const url = buildAuthenticatedCloneUrl({ token: 'ghp_secret', owner: 'acme', repo: 'web' });
    assert.equal(url, 'https://x-access-token:ghp_secret@github.com/acme/web.git');
});

test('buildAuthenticatedCloneUrl url-encodes a token with special characters', () => {
    const url = buildAuthenticatedCloneUrl({ token: 'a/b:c@d', owner: 'acme', repo: 'web' });
    assert.ok(url.includes('x-access-token:a%2Fb%3Ac%40d@github.com'));
});

test('buildAuthenticatedCloneUrl falls back to an unauthenticated url with no token', () => {
    const url = buildAuthenticatedCloneUrl({ owner: 'acme', repo: 'web' });
    assert.equal(url, 'https://github.com/acme/web.git');
});

// ---------------------------------------------------------------------------
// redactToken — never log the token
// ---------------------------------------------------------------------------

test('redactToken masks the credential in an authenticated url', () => {
    const url = 'https://x-access-token:ghp_secret@github.com/acme/web.git';
    assert.equal(redactToken(url), 'https://x-access-token:***@github.com/acme/web.git');
});

test('redactToken leaves an unauthenticated url unchanged', () => {
    assert.equal(redactToken('https://github.com/acme/web.git'), 'https://github.com/acme/web.git');
});
