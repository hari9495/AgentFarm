# AgentFarm Language System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the language detection and resolution system across `apps/agent-runtime/src/language-resolver.ts` and `apps/api-gateway/src/routes/language.ts`.

---

## Overview

The language system allows AgentFarm to operate in multiple languages. It detects the user's language from multiple signals, resolves a final output language, and ensures all agent responses (Jira comments, Slack messages, PR descriptions) are in the appropriate language.

**Cascade Priority (highest to lowest):**
1. Audio language (from voice input)
2. Text detection (Unicode range analysis)
3. User profile preference
4. Workspace language override
5. Tenant default language
6. System default (`"en"`)

---

## Language Detection

**File:** `apps/agent-runtime/src/language-resolver.ts`

### `detectTextLanguage(text: string): string | undefined`

Detects language from Unicode character ranges:

| Language | Code | Unicode Range(s) |
|---|---|---|
| Japanese | `ja` | Hiragana (U+3040–U+309F), Katakana (U+30A0–U+30FF), CJK (U+4E00–U+9FFF) |
| Korean | `ko` | Hangul (U+AC00–U+D7AF), Hangul Jamo (U+1100–U+11FF) |
| Arabic | `ar` | Arabic block (U+0600–U+06FF) |
| Hindi | `hi` | Devanagari (U+0900–U+097F) |
| English | `en` | ASCII letters (U+0041–U+007A) as fallback |

Returns `undefined` if the text is too short or no script is detected with sufficient confidence.

---

## Language Resolution

### `resolveLanguage(ctx: LanguageContext): Promise<ResolvedLanguage>`

Resolves the final output language for a task or message.

### `LanguageContext`
```typescript
type LanguageContext = {
  tenantId: string;
  workspaceId?: string;
  userId?: string;
  inputText?: string;     // For text-based detection
  audioLanguage?: string; // From voice provider (e.g. Whisper)
  confidence?: number;    // Audio detection confidence (0.0–1.0)
}
```

### `ResolvedLanguage`
```typescript
type ResolvedLanguage = {
  language: string;   // BCP-47 language code (e.g. "en", "ja", "ar")
  source: 'audio' | 'text' | 'user_profile' | 'workspace' | 'tenant' | 'default';
  confidence: number; // 0.0–1.0
}
```

### Resolution Algorithm
```
if audioLanguage provided AND confidence >= 0.7:
  return { language: audioLanguage, source: 'audio', confidence }

if inputText provided:
  detected = detectTextLanguage(inputText)
  if detected:
    return { language: detected, source: 'text', confidence: 0.9 }

if userId provided:
  profile = GET /v1/language/user/{userId}
  if profile.preferredLanguage:
    return { language, source: 'user_profile', confidence: 1.0 }

if workspaceId provided:
  config = GET /v1/language/workspace/{workspaceId}
  if config.preferredLanguage:
    return { language, source: 'workspace', confidence: 1.0 }

tenantConfig = GET /v1/language/tenant
if tenantConfig.defaultLanguage != 'en':
  return { language, source: 'tenant', confidence: 1.0 }

return { language: 'en', source: 'default', confidence: 1.0 }
```

All HTTP calls to the gateway are fire-safe — errors fall through to the next cascade level.

### `getOutputLanguage(ctx: LanguageContext): Promise<string>`
Fire-safe wrapper around `resolveLanguage` — returns `"en"` on any error. Used in post-task closeout.

---

## Database Models

### `TenantLanguageConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `tenantId` | `String` @unique | — | Tenant identifier |
| `defaultLanguage` | `String` | `"en"` | Default output language for all agents |
| `ticketLanguage` | `String` | `"en"` | Language for Jira/Linear comments |
| `autoDetect` | `Boolean` | `true` | Whether to use text/audio detection |

### `WorkspaceLanguageConfig`

| Field | Type | Description |
|---|---|---|
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `preferredLanguage` | `String?` | Overrides tenant default for this workspace |

**Unique:** `(tenantId, workspaceId)`

### `UserLanguageProfile`

| Field | Type | Description |
|---|---|---|
| `tenantId` | `String` | |
| `userId` | `String` | |
| `detectedLanguage` | `String?` | Last auto-detected language |
| `preferredLanguage` | `String?` | User's explicit preference |
| `confidence` | `Float` | Detection confidence (default: 0.0) |
| `lastDetectedAt` | `DateTime?` | |

**Unique:** `(tenantId, userId)`

---

## Language API Routes

**File:** `apps/api-gateway/src/routes/language.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/language/tenant` | Get tenant-level language config |
| `PATCH` | `/v1/language/tenant` | Update tenant defaults (`{defaultLanguage?, ticketLanguage?, autoDetect?}`) |
| `GET` | `/v1/language/workspace/:workspaceId` | Get workspace language override |
| `PATCH` | `/v1/language/workspace/:workspaceId` | Set workspace language override |
| `GET` | `/v1/language/user/:userId` | Get user language profile |
| `GET` | `/v1/language/user/me` | Get current user's profile |
| `POST` | `/v1/language/user` | Upsert user language profile (`{userId, language, confidence?}`) |

---

## Voice Integration

For meeting sessions (`MeetingSession.language`), the language is resolved from:
1. `agentVoiceId` — VoxCPM2 cloned voice ID
2. `resolvedLanguage` — BCP-47 code stored after resolution
3. Meeting transcript is processed in the resolved language

**VoxCPM2 TTS:** Docker image at `docker/voxcpm2/` — self-hosted text-to-speech for multilingual agent voice.

---

## Tests

| File | Count | Description |
|---|---|---|
| `apps/agent-runtime/src/language-resolver.test.ts` | 21 | Detection, cascade priority, fire-safe fallback |
| `apps/api-gateway/src/routes/language.test.ts` | 10 | All language API routes |
