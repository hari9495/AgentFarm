/**
 * Language resolver for agent-runtime.
 *
 * Determines the best language for agent outputs by combining audio detection
 * (Whisper), text character-range detection, and persisted user/workspace/tenant
 * preferences fetched from the api-gateway language endpoints.
 *
 * All network calls are fire-safe — errors are logged and the chain continues.
 */

export interface LanguageContext {
    tenantId: string;
    workspaceId?: string;
    userId?: string;
    inputText?: string;      // text message from user
    audioLanguage?: string;  // pre-detected from Whisper, e.g. 'ja', 'ko', 'en'
    confidence?: number;     // Whisper detection confidence 0.0-1.0
}

export interface ResolvedLanguage {
    language: string;        // BCP-47 code e.g. 'ja', 'ko', 'en', 'hi'
    source: 'audio' | 'text' | 'user_profile' | 'workspace' | 'tenant' | 'default';
    confidence: number;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

const gatewayUrl = (): string => (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Text language detection
// ---------------------------------------------------------------------------

/**
 * Detect the primary script of a text string using Unicode character ranges.
 * No external libraries — pure character counting.
 */
export function detectTextLanguage(text: string): { language: string; confidence: number } {
    if (!text || text.length === 0) {
        return { language: 'en', confidence: 0.50 };
    }

    const total = text.length;
    let japanese = 0;
    let korean = 0;
    let arabic = 0;
    let hindi = 0;

    for (const char of text) {
        const cp = char.codePointAt(0) ?? 0;
        // Japanese: hiragana (\u3040-\u309F) + katakana (\u30A0-\u30FF) + CJK (\u4E00-\u9FFF)
        if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff) || (cp >= 0x4e00 && cp <= 0x9fff)) {
            japanese++;
        }
        // Korean: Hangul syllables (\uAC00-\uD7AF)
        if (cp >= 0xac00 && cp <= 0xd7af) {
            korean++;
        }
        // Arabic (\u0600-\u06FF)
        if (cp >= 0x0600 && cp <= 0x06ff) {
            arabic++;
        }
        // Hindi / Devanagari (\u0900-\u097F)
        if (cp >= 0x0900 && cp <= 0x097f) {
            hindi++;
        }
    }

    if (japanese / total > 0.15) return { language: 'ja', confidence: 0.92 };
    if (korean / total > 0.15) return { language: 'ko', confidence: 0.92 };
    if (arabic / total > 0.15) return { language: 'ar', confidence: 0.90 };
    if (hindi / total > 0.15) return { language: 'hi', confidence: 0.90 };

    return { language: 'en', confidence: 0.50 };
}

// ---------------------------------------------------------------------------
// Profile learning (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Record a detected language against the user's profile via the api-gateway.
 * Fire-and-forget: errors are logged and never thrown.
 */
export async function learnUserLanguage(
    tenantId: string,
    userId: string,
    language: string,
    confidence: number,
): Promise<void> {
    const base = gatewayUrl();
    if (!base) {
        console.warn('[language-resolver] API_GATEWAY_URL is not set; skipping learnUserLanguage.');
        return;
    }
    try {
        await fetch(`${base}/v1/language/user`, {
            method: 'POST',
            headers: {
                'x-tenant-id': tenantId,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ userId, language, confidence }),
            signal: AbortSignal.timeout(3_000),
        });
    } catch (err) {
        console.warn(`[language-resolver] learnUserLanguage failed for user ${userId}:`, String(err));
    }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the best language for the given context.
 * Walks a priority chain — stops at the first confident result.
 */
export async function resolveLanguage(ctx: LanguageContext): Promise<ResolvedLanguage> {
    const base = gatewayUrl();

    // 1. Audio detection (Whisper pre-detected)
    if (ctx.audioLanguage && typeof ctx.confidence === 'number' && ctx.confidence >= 0.85) {
        if (ctx.userId) {
            void learnUserLanguage(ctx.tenantId, ctx.userId, ctx.audioLanguage, ctx.confidence);
        }
        return { language: ctx.audioLanguage, source: 'audio', confidence: ctx.confidence };
    }

    // 2. Text detection
    if (ctx.inputText && ctx.inputText.length > 0) {
        const detected = detectTextLanguage(ctx.inputText);
        if (detected.confidence >= 0.90) {
            if (ctx.userId) {
                void learnUserLanguage(ctx.tenantId, ctx.userId, detected.language, detected.confidence);
            }
            return { language: detected.language, source: 'text', confidence: detected.confidence };
        }
    }

    // 3. User profile (learned)
    if (base && ctx.userId) {
        try {
            const res = await fetch(`${base}/v1/language/user/${ctx.userId}`, {
                method: 'GET',
                headers: { 'x-tenant-id': ctx.tenantId },
                signal: AbortSignal.timeout(3_000),
            });
            if (res.ok) {
                const data = (await res.json()) as Record<string, unknown>;
                if (typeof data['detectedLanguage'] === 'string' && data['detectedLanguage']) {
                    return { language: data['detectedLanguage'], source: 'user_profile', confidence: 0.80 };
                }
            } else {
                console.warn(`[language-resolver] user profile returned HTTP ${res.status} for user ${ctx.userId}.`);
            }
        } catch (err) {
            console.warn(`[language-resolver] user profile fetch failed for user ${ctx.userId}:`, String(err));
        }
    }

    // 4. Workspace config
    if (base && ctx.workspaceId) {
        try {
            const res = await fetch(`${base}/v1/language/workspace/${ctx.workspaceId}`, {
                method: 'GET',
                headers: { 'x-tenant-id': ctx.tenantId },
                signal: AbortSignal.timeout(3_000),
            });
            if (res.ok) {
                const data = (await res.json()) as Record<string, unknown>;
                if (typeof data['preferredLanguage'] === 'string' && data['preferredLanguage']) {
                    return { language: data['preferredLanguage'], source: 'workspace', confidence: 0.70 };
                }
            } else {
                console.warn(
                    `[language-resolver] workspace config returned HTTP ${res.status} for workspace ${ctx.workspaceId}.`,
                );
            }
        } catch (err) {
            console.warn(`[language-resolver] workspace config fetch failed for workspace ${ctx.workspaceId}:`, String(err));
        }
    }

    // 5. Tenant default
    if (base) {
        try {
            const res = await fetch(`${base}/v1/language/tenant`, {
                method: 'GET',
                headers: { 'x-tenant-id': ctx.tenantId },
                signal: AbortSignal.timeout(3_000),
            });
            if (res.ok) {
                const data = (await res.json()) as Record<string, unknown>;
                if (typeof data['defaultLanguage'] === 'string' && data['defaultLanguage']) {
                    return { language: data['defaultLanguage'], source: 'tenant', confidence: 0.60 };
                }
            } else {
                console.warn(`[language-resolver] tenant config returned HTTP ${res.status} for tenant ${ctx.tenantId}.`);
            }
        } catch (err) {
            console.warn(`[language-resolver] tenant config fetch failed for tenant ${ctx.tenantId}:`, String(err));
        }
    }

    // 6. Hard default
    return { language: 'en', source: 'default', confidence: 0.50 };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

/**
 * Map a resolved language to the appropriate output language for a given output type.
 * PR descriptions and ticket titles are always English (universal defaults).
 * Meeting and chat responses follow the resolved language.
 */
export function getOutputLanguage(
    resolved: ResolvedLanguage,
    outputType: 'meeting' | 'ticket' | 'chat' | 'pr',
): string {
    if (outputType === 'pr' || outputType === 'ticket') {
        return 'en';
    }
    return resolved.language;
}
