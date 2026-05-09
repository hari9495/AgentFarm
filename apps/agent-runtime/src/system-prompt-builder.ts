/**
 * System prompt builder for agent-runtime.
 *
 * Appends a language instruction block to any system prompt when the target
 * language is not English. Keeps all other prompt logic unchanged.
 */

// ---------------------------------------------------------------------------
// Language name lookup
// ---------------------------------------------------------------------------

const LANGUAGE_NAME_MAP: Record<string, string> = {
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
};

/**
 * Map a BCP-47 language code to its full English name.
 * Falls back to the code itself when no entry is found.
 */
export function getLanguageNameFromCode(code: string): string {
    return LANGUAGE_NAME_MAP[code] ?? code;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SystemPromptOptions {
    /** The base system prompt text to start from. */
    basePrompt: string;
    /** BCP-47 language code, e.g. "ja", "ko", "ar", "hi", "en". */
    language?: string;
    /** Agent role, e.g. "Developer", "Manager". Reserved for future use. */
    role?: string;
    tenantId?: string;
    workspaceId?: string;
    userId?: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the final system prompt string.
 *
 * - When language is absent or "en", the base prompt is returned unchanged.
 * - For any other BCP-47 code the language instruction block is appended at
 *   the END of the prompt so it takes precedence over earlier instructions.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
    const { basePrompt, language } = options;

    if (!language || language === 'en') {
        return basePrompt;
    }

    const languageName = getLanguageNameFromCode(language);
    const instruction = [
        '',
        '---',
        `LANGUAGE INSTRUCTION: You MUST respond entirely in ${languageName} (${language}).`,
        'Do not use English unless the user writes to you in English.',
        `All explanations, code comments, error messages, and summaries must be in ${languageName}.`,
    ].join('\n');

    return `${basePrompt}\n${instruction}`;
}
