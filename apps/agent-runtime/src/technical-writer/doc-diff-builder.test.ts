import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocUpdateFromDiff } from './doc-diff-builder.js';

describe('buildDocUpdateFromDiff', () => {
    it('returns empty array for empty diff', () => {
        const result = buildDocUpdateFromDiff('', ['Authentication', 'createUser function']);
        assert.deepEqual(result, []);
    });

    it('returns empty array for whitespace-only diff', () => {
        const result = buildDocUpdateFromDiff('   \n\n  ', ['Authentication']);
        assert.deepEqual(result, []);
    });

    it('diff with renamed function flags matching doc section', () => {
        const diff = `
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,7 +10,7 @@
-export function createUser(name: string) {
+export function createAccount(name: string) {
`;
        const sections = ['createUser function', 'Authentication Overview', 'API Reference'];
        const result = buildDocUpdateFromDiff(diff, sections);
        assert.ok(result.length > 0, 'Expected at least one update');
        const sectionTitles = result.map((r) => r.sectionTitle);
        assert.ok(
            sectionTitles.some((t) => t.toLowerCase().includes('createuser')),
            'Expected a flag for the renamed createUser section',
        );
    });

    it('diff with added export suggests new section', () => {
        const diff = `
--- a/src/payments.ts
+++ b/src/payments.ts
@@ -20,0 +21 @@
+export function processRefund(orderId: string) {
`;
        const sections = ['createCharge function', 'Payment Overview'];
        const result = buildDocUpdateFromDiff(diff, sections);
        assert.ok(result.length > 0, 'Expected at least one update');
        const hasNewSection = result.some((r) => r.sectionTitle.includes('(new)'));
        assert.ok(hasNewSection, 'Expected a new section suggestion for processRefund');
    });

    it('diff with deleted export flags removal', () => {
        const diff = `
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,7 +5,0 @@
-export function formatDate(d: Date): string {
-    return d.toISOString();
-}
`;
        const sections = ['formatDate utility', 'Date Utilities'];
        const result = buildDocUpdateFromDiff(diff, sections);
        assert.ok(result.length > 0, 'Expected a flag for the deleted formatDate');
        const flagged = result.find((r) => r.sectionTitle.toLowerCase().includes('formatdate'));
        assert.ok(flagged, 'Expected formatDate section to be flagged');
        assert.ok(
            flagged.changeReason.toLowerCase().includes('removed') ||
            flagged.changeReason.toLowerCase().includes('deleted'),
            'Change reason should mention removal',
        );
    });

    it('diff with no recognisable symbols returns empty array', () => {
        const diff = `
--- a/config.json
+++ b/config.json
@@ -1 +1 @@
-{ "version": "1.0.0" }
+{ "version": "1.1.0" }
`;
        const result = buildDocUpdateFromDiff(diff, ['Changelog', 'Version History']);
        assert.deepEqual(result, []);
    });

    it('diff with Python function triggers match', () => {
        const diff = `
--- a/api.py
+++ b/api.py
@@ -3,0 +4 @@
+def get_user_profile(user_id: str):
`;
        const sections = ['get_user_profile endpoint', 'User API'];
        const result = buildDocUpdateFromDiff(diff, sections);
        assert.ok(result.length > 0, 'Expected match for Python function');
    });
});
