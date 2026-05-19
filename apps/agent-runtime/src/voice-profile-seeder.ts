/**
 * voice-profile-seeder.ts
 *
 * Seeds default voice profiles for each AgentFarm role into Voicebox at
 * agent-runtime startup.  Uses the design-mode profile API so no audio
 * sample is required.
 *
 * Idempotent: if a voice profile with the same name already exists (returned
 * by GET /v1/voices), that role is skipped.  Only missing roles are created.
 */

import { VoiceboxClient, type VoiceProfile } from './voicebox-client.js';

// ---------------------------------------------------------------------------
// Role → default voice persona mapping
// ---------------------------------------------------------------------------

export type RoleKey =
    | 'developer'
    | 'tester'
    | 'sales_rep'
    | 'corporate_assistant'
    | 'technical_writer'
    | 'fullstack_dev'
    | 'business_analyst'
    | 'content_writer'
    | 'pm'
    | 'marketing'
    | 'recruiter'
    | 'customer_support';

export type RoleVoiceSpec = {
    name: string;
    description: string;
    language: string;
};

export const ROLE_VOICES: Readonly<Record<RoleKey, RoleVoiceSpec>> = {
    developer: {
        name: 'Alex',
        description: 'Calm, precise, and confident. Speaks at a measured pace with a clear technical register.',
        language: 'en',
    },
    tester: {
        name: 'Jordan',
        description: 'Methodical and detail-oriented. Slightly deliberate speech that conveys thoroughness.',
        language: 'en',
    },
    sales_rep: {
        name: 'Morgan',
        description: 'Warm, enthusiastic, and persuasive. Upbeat tone with natural energy.',
        language: 'en',
    },
    corporate_assistant: {
        name: 'Taylor',
        description: 'Professional, courteous, and efficient. Clear and friendly corporate register.',
        language: 'en',
    },
    technical_writer: {
        name: 'Casey',
        description: 'Clear, structured, and articulate. Reads technical content naturally and accessibly.',
        language: 'en',
    },
    fullstack_dev: {
        name: 'Riley',
        description: 'Versatile and pragmatic. Balances technical precision with approachable warmth.',
        language: 'en',
    },
    business_analyst: {
        name: 'Avery',
        description: 'Analytical and composed. Speaks with measured confidence and clarity.',
        language: 'en',
    },
    content_writer: {
        name: 'Quinn',
        description: 'Creative and expressive. Engaging voice with natural storytelling cadence.',
        language: 'en',
    },
    pm: {
        name: 'Drew',
        description: 'Organised, decisive, and motivating. Projects authority balanced with approachability.',
        language: 'en',
    },
    marketing: {
        name: 'Blake',
        description: 'Dynamic and persuasive. Energetic delivery suited for brand communications.',
        language: 'en',
    },
    recruiter: {
        name: 'Sage',
        description: 'Personable, empathetic, and encouraging. Puts candidates at ease immediately.',
        language: 'en',
    },
    customer_support: {
        name: 'Rowan',
        description: 'Patient, reassuring, and friendly. Conveys empathy and helpfulness naturally.',
        language: 'en',
    },
};

// ---------------------------------------------------------------------------
// Seeder
// ---------------------------------------------------------------------------

/**
 * Ensure all 12 role voice profiles exist in Voicebox.
 *
 * - Returns early (empty map) if Voicebox is unreachable.
 * - Skips any role whose profile name already exists in Voicebox.
 * - Returns a map of role → profileId for successfully created/existing profiles.
 */
export async function seedVoiceProfiles(): Promise<Map<RoleKey, string>> {
    const voicebox = new VoiceboxClient();
    const result = new Map<RoleKey, string>();

    const healthy = await voicebox.healthCheck();
    if (!healthy) {
        console.warn('[voice-profile-seeder] Voicebox unreachable — skipping profile seeding');
        return result;
    }

    // Fetch existing voices to avoid duplicates
    let existingVoices: VoiceProfile[];
    try {
        existingVoices = await voicebox.listVoices() as VoiceProfile[];
    } catch (err: unknown) {
        console.warn(`[voice-profile-seeder] listVoices failed — skipping seeding: ${String(err)}`);
        return result;
    }

    const existingNames = new Set(existingVoices.map((v) => v.name));
    // Pre-populate result with existing profiles so callers have their IDs
    for (const voice of existingVoices) {
        const roleEntry = (Object.entries(ROLE_VOICES) as [RoleKey, RoleVoiceSpec][])
            .find(([, spec]) => spec.name === voice.name);
        if (roleEntry) {
            result.set(roleEntry[0], voice.id);
        }
    }

    // Create any missing profiles
    const roles = Object.entries(ROLE_VOICES) as [RoleKey, RoleVoiceSpec][];
    for (const [role, spec] of roles) {
        if (existingNames.has(spec.name)) {
            continue;
        }

        try {
            const profile = await voicebox.createVoiceProfileFromDescription(
                spec.name,
                spec.description,
                spec.language,
            );
            result.set(role, profile.id);
            console.log(`[voice-profile-seeder] Created voice profile '${spec.name}' (${role}) → ${profile.id}`);
        } catch (err: unknown) {
            console.warn(`[voice-profile-seeder] Failed to create profile for role '${role}': ${String(err)}`);
        }
    }

    return result;
}
