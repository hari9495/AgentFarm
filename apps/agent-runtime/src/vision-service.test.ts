/**
 * Feature #3 — Vision Service tests
 * Frozen 2026-05-07
 */

import { describe, it, expect } from 'vitest';
import {
    analyzeImage,
    getVisionProviders,
    type VisionInput,
    type VisionContext,
    type VisionLLMCallerFn,
} from './vision-service.js';

const ctx: VisionContext = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-1',
    correlationId: 'corr-1',
};

// Tiny 1x1 white PNG in base64 (22 bytes raw)
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mockCaller: VisionLLMCallerFn = async (input) => ({
    rawDescription: `Error: TypeError cannot read property.\nFix: add null check before accessing property.\nNote: this pattern appears in auth module.`,
    provider: input.provider,
});

describe('analyzeImage', () => {
    it('returns a VisionAnalysisRecord with correct fields', async () => {
        const input: VisionInput = {
            imageBase64: TINY_PNG_B64,
            mimeType: 'image/png',
            intent: 'error_screenshot',
        };
        const result = await analyzeImage(input, ctx, mockCaller);
        expect(result.intent).toBe('error_screenshot');
        expect(result.mimeType).toBe('image/png');
        expect(result.contractVersion).toBeDefined();
        expect(result.llmProvider).toBe('anthropic');
        expect(result.description.length).toBeGreaterThan(0);
    });

    it('extracts suggested actions from LLM output', async () => {
        const input: VisionInput = {
            imageBase64: TINY_PNG_B64,
            mimeType: 'image/jpeg',
            intent: 'ui_bug_report',
        };
        const result = await analyzeImage(input, ctx, mockCaller);
        expect(result.suggestedActions.some((s) => /fix|add|update/i.test(s))).toBe(true);
    });

    it('throws on unsupported mime type', async () => {
        const input = { imageBase64: TINY_PNG_B64, mimeType: 'image/gif' as never, intent: 'error_screenshot' as const };
        await expect(analyzeImage(input, ctx, mockCaller)).rejects.toThrow('Unsupported mimeType');
    });

    it('throws when image exceeds max size', async () => {
        // Build a string that represents ~6 MB of data when decoded
        const hugeBase64 = 'A'.repeat(8 * 1024 * 1024);
        const input: VisionInput = {
            imageBase64: hugeBase64,
            mimeType: 'image/png',
            intent: 'architecture_diagram',
        };
        await expect(analyzeImage(input, ctx, mockCaller)).rejects.toThrow('exceeds maximum size');
    });

    it('uses openai provider when specified', async () => {
        const input: VisionInput = {
            imageBase64: TINY_PNG_B64,
            mimeType: 'image/webp',
            intent: 'figma_mockup',
        };
        const result = await analyzeImage(input, ctx, mockCaller, 'openai');
        expect(result.llmProvider).toBe('openai');
    });
});

describe('getVisionProviders', () => {
    it('returns at least one vision provider', () => {
        expect(getVisionProviders().length).toBeGreaterThan(0);
    });
});
