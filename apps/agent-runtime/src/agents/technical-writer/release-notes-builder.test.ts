import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReleaseNotes, classifyPrByLabel } from './release-notes-builder.js';
import type { PullRequest } from './release-notes-builder.js';

describe('classifyPrByLabel', () => {
    it('returns Breaking Changes for breaking label', () => {
        assert.equal(classifyPrByLabel(['breaking-change']), 'Breaking Changes');
    });

    it('returns Bug Fixes for fix label', () => {
        assert.equal(classifyPrByLabel(['fix']), 'Bug Fixes');
    });

    it('returns Features for feature label', () => {
        assert.equal(classifyPrByLabel(['feature']), 'Features');
    });

    it('returns Chores for unlabelled PR', () => {
        assert.equal(classifyPrByLabel([]), 'Chores');
    });

    it('returns Chores for chore label', () => {
        assert.equal(classifyPrByLabel(['chore']), 'Chores');
    });

    it('Breaking Changes takes priority over Bug Fixes', () => {
        assert.equal(classifyPrByLabel(['bug', 'breaking']), 'Breaking Changes');
    });

    it('Bug Fixes takes priority over Features', () => {
        assert.equal(classifyPrByLabel(['feature', 'bugfix']), 'Bug Fixes');
    });
});

describe('buildReleaseNotes', () => {
    it('empty PR list returns minimal output', () => {
        const result = buildReleaseNotes([]);
        assert.ok(result.includes('No changes recorded'), 'Should note no changes');
    });

    it('single feature PR appears in Features section', () => {
        const prs: PullRequest[] = [
            { title: 'Add OAuth login', number: 42, labels: ['feature'] },
        ];
        const result = buildReleaseNotes(prs, { version: '1.2.0' });
        assert.ok(result.includes('## ✨ Features'), 'Should include Features heading');
        assert.ok(result.includes('Add OAuth login'), 'Should include PR title');
        assert.ok(result.includes('#42'), 'Should include PR number');
        assert.ok(!result.includes('## 🐛 Bug Fixes'), 'Should omit empty Bug Fixes section');
    });

    it('PRs split across multiple categories renders all sections', () => {
        const prs: PullRequest[] = [
            { title: 'Fix null pointer crash', number: 10, labels: ['bug'] },
            { title: 'New dashboard widget', number: 11, labels: ['feature'] },
            { title: 'Remove deprecated endpoint', number: 12, labels: ['breaking'] },
            { title: 'Update CI config', number: 13, labels: ['chore'] },
        ];
        const result = buildReleaseNotes(prs);
        assert.ok(result.includes('## ⚠️ Breaking Changes'), 'Should include Breaking Changes');
        assert.ok(result.includes('## ✨ Features'), 'Should include Features');
        assert.ok(result.includes('## 🐛 Bug Fixes'), 'Should include Bug Fixes');
        assert.ok(result.includes('## 🔧 Chores'), 'Should include Chores');
    });

    it('unlabelled PR goes to Chores', () => {
        const prs: PullRequest[] = [
            { title: 'Misc cleanup', number: 99, labels: [] },
        ];
        const result = buildReleaseNotes(prs);
        assert.ok(result.includes('## 🔧 Chores'), 'Unlabelled PR should go to Chores');
        assert.ok(result.includes('Misc cleanup'), 'Should include PR title');
    });

    it('breaking-change label creates Breaking Changes section', () => {
        const prs: PullRequest[] = [
            { title: 'Rename auth API', number: 7, labels: ['breaking-change'] },
        ];
        const result = buildReleaseNotes(prs, { version: '2.0.0' });
        assert.ok(result.includes('## ⚠️ Breaking Changes'), 'Should have Breaking Changes section');
        assert.ok(result.includes('Rename auth API'), 'Should include PR title');
    });

    it('includes repo URL in PR links when provided', () => {
        const prs: PullRequest[] = [
            { title: 'Add search', number: 5, labels: ['feature'] },
        ];
        const result = buildReleaseNotes(prs, { repoUrl: 'https://github.com/org/repo' });
        assert.ok(
            result.includes('https://github.com/org/repo/pull/5'),
            'Should include full PR link',
        );
    });
});
