/**
 * Brand Voice Learner
 *
 * Analyses a set of writing samples to extract a brand voice profile
 * through heuristic pattern analysis. No LLM required — pure TypeScript.
 *
 * Extends the BrandVoice type from draft-builder.ts with additional
 * learned attributes: avgSentenceLength, preferredPov, styleMarkers,
 * readingLevel, and sampleCount.
 */

import type { BrandVoice } from './draft-builder.js';
import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandVoiceSample {
    /** The raw text of a piece of content written in this brand's voice. */
    text: string;
    /** Format context (optional; for future filtering). */
    format?: string;
}

export interface LearnedBrandVoice extends BrandVoice {
    /** Average number of words per sentence across all samples. */
    avgSentenceLength: number;
    /** Most frequently used grammatical point of view. */
    preferredPov: 'first_person' | 'second_person' | 'third_person';
    /**
     * Top recurring non-stopword vocabulary markers (up to 10).
     * These words appear at above-average frequency and characterise the brand.
     */
    styleMarkers: string[];
    /** Rough reading level derived from sentence + word complexity. */
    readingLevel: 'simple' | 'standard' | 'advanced';
    /** Number of samples used to derive the profile. */
    sampleCount: number;
    /**
     * LLM-generated qualitative description of the brand voice.
     * Only present when `learnBrandVoiceSemantic` is used.
     */
    semanticDescription?: string;
    /**
     * Dominant emotional tone extracted by LLM (e.g. "energetic and optimistic").
     * Only present when `learnBrandVoiceSemantic` is used.
     */
    emotionalTone?: string;
    /**
     * Rhetorical devices identified by LLM (e.g. ["metaphor", "alliteration"]).
     * Only present when `learnBrandVoiceSemantic` is used.
     */
    rhetoricalDevices?: string[];
}

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'it', 'its', 'we', 'our', 'you', 'your', 'they', 'their', 'he', 'she',
    'i', 'my', 'me', 'us', 'him', 'her', 'as', 'if', 'not', 'so', 'also',
    'just', 'more', 'than', 'then', 'when', 'which', 'who', 'what', 'how',
    'all', 'about', 'up', 'out', 'into', 'through', 'over', 'after', 'before',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
    return text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);
}

function computeAvgSentenceLength(texts: string[]): number {
    let totalWords = 0;
    let totalSentences = 0;
    for (const text of texts) {
        const sentences = splitSentences(text);
        for (const sentence of sentences) {
            const words = tokenize(sentence);
            totalWords += words.length;
            totalSentences++;
        }
    }
    if (totalSentences === 0) return 0;
    return Math.round(totalWords / totalSentences);
}

function detectPov(texts: string[]): 'first_person' | 'second_person' | 'third_person' {
    let first = 0;
    let second = 0;
    let third = 0;
    for (const text of texts) {
        const lower = text.toLowerCase();
        first += (lower.match(/\b(i|we|our|us|my|me)\b/g) ?? []).length;
        second += (lower.match(/\b(you|your|yours)\b/g) ?? []).length;
        third += (lower.match(/\b(he|she|they|their|it|the company|the brand)\b/g) ?? []).length;
    }
    if (second >= first && second >= third) return 'second_person';
    if (first >= third) return 'first_person';
    return 'third_person';
}

function extractStyleMarkers(texts: string[], topN = 10): string[] {
    const freq: Map<string, number> = new Map();
    let totalTokens = 0;

    for (const text of texts) {
        const tokens = tokenize(text);
        totalTokens += tokens.length;
        for (const token of tokens) {
            if (!STOPWORDS.has(token) && token.length > 3) {
                freq.set(token, (freq.get(token) ?? 0) + 1);
            }
        }
    }

    if (totalTokens === 0) return [];

    const avgFrequency = totalTokens / Math.max(freq.size, 1);
    return [...freq.entries()]
        .filter(([, count]) => count > avgFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([word]) => word);
}

function computeReadingLevel(avgSentenceLength: number, texts: string[]): 'simple' | 'standard' | 'advanced' {
    // Rough proxy: count long words (>= 3 syllables via length heuristic > 8 chars)
    let longWordCount = 0;
    let totalWords = 0;
    for (const text of texts) {
        const words = tokenize(text);
        totalWords += words.length;
        for (const word of words) {
            if (word.length > 8) longWordCount++;
        }
    }
    const longWordRatio = totalWords > 0 ? longWordCount / totalWords : 0;

    if (avgSentenceLength <= 14 && longWordRatio < 0.1) return 'simple';
    if (avgSentenceLength > 22 || longWordRatio > 0.2) return 'advanced';
    return 'standard';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Heuristic brand voice learner — pure TypeScript, no LLM.
 *
 * Analyses a set of writing samples to extract statistical voice signals:
 * sentence length, point-of-view, vocabulary markers, and reading level.
 * Returns zero-value learned fields if samples array is empty.
 */
export function learnBrandVoice(
    samples: BrandVoiceSample[],
    baseBrandVoice: BrandVoice,
): LearnedBrandVoice {
    if (samples.length === 0) {
        return {
            ...baseBrandVoice,
            avgSentenceLength: 0,
            preferredPov: 'third_person',
            styleMarkers: [],
            readingLevel: 'standard',
            sampleCount: 0,
        };
    }

    const texts = samples.map((s) => s.text);
    const avgSentenceLength = computeAvgSentenceLength(texts);
    const preferredPov = detectPov(texts);
    const styleMarkers = extractStyleMarkers(texts);
    const readingLevel = computeReadingLevel(avgSentenceLength, texts);

    return {
        ...baseBrandVoice,
        avgSentenceLength,
        preferredPov,
        styleMarkers,
        readingLevel,
        sampleCount: samples.length,
    };
}

/**
 * LLM-enriched brand voice learner.
 *
 * Runs the heuristic `learnBrandVoice` pass first, then calls the LLM to
 * generate a qualitative semantic description, emotional tone, and rhetorical
 * device analysis. Falls back to the heuristic result if the LLM is
 * unavailable.
 *
 * `semanticDescription`, `emotionalTone`, and `rhetoricalDevices` are
 * populated on the returned object when the LLM call succeeds.
 */
export async function learnBrandVoiceSemantic(
    samples: BrandVoiceSample[],
    baseBrandVoice: BrandVoice,
    caller: ProseCallerFn,
): Promise<LearnedBrandVoice> {
    const base = learnBrandVoice(samples, baseBrandVoice);
    if (samples.length === 0) return base;

    const sampleText = samples
        .map((s) => s.text)
        .join('\n---\n')
        .slice(0, 3000);

    const systemPrompt =
        'You are a brand strategy expert. Analyse writing samples and describe the brand voice.\n' +
        'Respond with exactly three labelled lines:\n' +
        'DESCRIPTION: one sentence describing the overall voice and personality.\n' +
        'EMOTIONAL_TONE: one short phrase (e.g. "energetic and optimistic").\n' +
        'RHETORICAL_DEVICES: up to 5 devices, comma-separated (e.g. "metaphor, rhetorical questions").\n' +
        'Output only these three lines — no other text.';

    const result = await caller(systemPrompt, `Analyse these writing samples:\n\n${sampleText}`);
    if (!result.text) return base;

    const descMatch = /^DESCRIPTION:\s*(.+)/im.exec(result.text);
    const emotionalMatch = /^EMOTIONAL_TONE:\s*(.+)/im.exec(result.text);
    const rhetoricalMatch = /^RHETORICAL_DEVICES:\s*(.+)/im.exec(result.text);

    return {
        ...base,
        ...(descMatch?.[1] ? { semanticDescription: descMatch[1].trim() } : {}),
        ...(emotionalMatch?.[1] ? { emotionalTone: emotionalMatch[1].trim() } : {}),
        ...(rhetoricalMatch?.[1]
            ? {
                rhetoricalDevices: rhetoricalMatch[1]
                    .split(',')
                    .map((d) => d.trim())
                    .filter(Boolean),
            }
            : {}),
    };
}
