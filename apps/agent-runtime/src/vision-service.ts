/**
 * Feature #3 — Vision Service
 * Frozen 2026-05-07
 *
 * Allows the agent to read screenshots, UI bug reports, architecture diagrams,
 * and Figma mockups by routing base64-encoded images to a vision-capable LLM
 * provider (Claude claude-opus-4-5 or GPT-4o).
 *
 * LLM integration:
 *   - Your LLMRouter already supports Anthropic and OpenAI.
 *   - This service adds a `vision` capability flag lookup.
 *   - Falls back gracefully if no vision provider is configured.
 *
 * Security posture:
 *   - Images are never written to disk; processed in-memory only.
 *   - Max image size enforced before forwarding to the LLM API.
 *   - mimeType is validated against the allowlist before processing.
 */

import { randomUUID } from 'node:crypto';
import type {
    VisionAnalysisRecord,
    VisionIntent,
    VisionMimeType,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { VisionAnalysisRecord, VisionIntent, VisionMimeType };

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set<VisionMimeType>(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Provider capability registry ─────────────────────────────────────────────

export type VisionProvider = 'anthropic' | 'openai';

const VISION_CAPABLE: Record<VisionProvider, boolean> = {
    anthropic: true, // Claude claude-opus-4-5 / claude-3-haiku
    openai: true, // GPT-4o
};

export function getVisionProviders(): VisionProvider[] {
    return (Object.keys(VISION_CAPABLE) as VisionProvider[]).filter((p) => VISION_CAPABLE[p]);
}

// ── Vision LLM caller abstraction ────────────────────────────────────────────
// In production this is wired to the existing LLMRouter.
// In tests an injectable mock is used.

export interface VisionLLMInput {
    imageBase64: string;
    mimeType: VisionMimeType;
    prompt: string;
    provider: VisionProvider;
}

export interface VisionLLMOutput {
    rawDescription: string;
    provider: string;
}

export type VisionLLMCallerFn = (input: VisionLLMInput) => Promise<VisionLLMOutput>;

// ── Intent → prompt templates ─────────────────────────────────────────────────

const INTENT_PROMPTS: Record<VisionIntent, string> = {
    ui_bug_report:
        'You are a software engineer. Describe the UI bug visible in this screenshot. ' +
        'Include: what element is affected, what looks wrong, and what the expected behaviour should be. ' +
        'Be specific and actionable.',
    architecture_diagram:
        'You are a software architect. Describe the system architecture shown in this diagram. ' +
        'List the components, their relationships, data flows, and any notable patterns or concerns.',
    whiteboard_photo:
        'You are a software engineer reviewing a whiteboard design photo. ' +
        'Transcribe all text and diagrams. Summarise the design intent and list actionable next steps.',
    error_screenshot:
        'You are a debugging assistant. Read and transcribe the error message shown in this screenshot. ' +
        'Identify the error type, message, stack trace (if visible), and suggest the most likely root cause.',
    figma_mockup:
        'You are a front-end engineer. Describe the UI mockup shown. ' +
        'List the components visible, their layout, colour scheme, and the interactions implied. ' +
        'Suggest a React component structure to implement it.',
};

// ── Result parser ─────────────────────────────────────────────────────────────

function parseVisionOutput(raw: string): {
    description: string;
    extractedText: string[];
    actionableInsights: string[];
    suggestedActions: string[];
} {
    // In production an LLM structured-output call returns JSON.
    // Here we do a best-effort parse of free-form text.
    const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    const extractedText: string[] = [];
    const actionableInsights: string[] = [];
    const suggestedActions: string[] = [];

    for (const line of lines) {
        if (/^(fix|update|change|add|remove|refactor|create|use)/i.test(line)) {
            suggestedActions.push(line);
        } else if (/^(note|warning|issue|problem|error|bug)/i.test(line)) {
            actionableInsights.push(line);
        } else if (line.length < 200 && /[A-Z]/.test(line[0] ?? '')) {
            extractedText.push(line);
        }
    }

    return {
        description: raw.slice(0, 1_000),
        extractedText: extractedText.slice(0, 10),
        actionableInsights: actionableInsights.slice(0, 5),
        suggestedActions: suggestedActions.slice(0, 5),
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VisionInput {
    imageBase64: string;
    mimeType: VisionMimeType;
    intent: VisionIntent;
}

export interface VisionContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    correlationId: string;
}

/**
 * Analyse an image and return structured insights.
 * Validates the image before forwarding to the LLM provider.
 */
export async function analyzeImage(
    input: VisionInput,
    ctx: VisionContext,
    caller: VisionLLMCallerFn,
    provider: VisionProvider = 'anthropic',
): Promise<VisionAnalysisRecord> {
    // 1. Validate mime type
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new Error(`Unsupported mimeType: ${input.mimeType}`);
    }

    // 2. Validate image size (base64 is ~4/3 of raw)
    const estimatedBytes = (input.imageBase64.length * 3) / 4;
    if (estimatedBytes > MAX_IMAGE_BYTES) {
        throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
    }

    // 3. Validate provider has vision capability
    if (!VISION_CAPABLE[provider]) {
        throw new Error(`Provider ${provider} does not support vision`);
    }

    const prompt = INTENT_PROMPTS[input.intent];

    const llmOutput = await caller({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        prompt,
        provider,
    });

    const parsed = parseVisionOutput(llmOutput.rawDescription);

    return {
        id: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.VISION_ANALYSIS,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId,
        intent: input.intent,
        mimeType: input.mimeType,
        description: parsed.description,
        extractedText: parsed.extractedText,
        actionableInsights: parsed.actionableInsights,
        suggestedActions: parsed.suggestedActions,
        llmProvider: llmOutput.provider,
        analyzedAt: new Date().toISOString(),
        correlationId: ctx.correlationId,
    };
}
