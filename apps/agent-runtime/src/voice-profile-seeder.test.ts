import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// seedVoiceProfiles — skip when Voicebox is unreachable
// ---------------------------------------------------------------------------

test('seedVoiceProfiles returns empty map and does not throw when Voicebox is unhealthy', async (t) => {
    // Return HTTP 503 so healthCheck returns false
    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        return new Response(null, { status: 503 });
    });

    // Dynamically import to pick up the module in isolation
    const { seedVoiceProfiles } = await import('./voice-profile-seeder.js');
    const result = await seedVoiceProfiles();

    assert.ok(result instanceof Map, 'result should be a Map');
    assert.strictEqual(result.size, 0, 'map should be empty when Voicebox is unreachable');
});

// ---------------------------------------------------------------------------
// seedVoiceProfiles — idempotent (skips existing profiles)
// ---------------------------------------------------------------------------

test('seedVoiceProfiles skips creation for voices already in Voicebox', async (t) => {
    // Pre-populate Voicebox with the 'Alex' (developer) profile
    const existingVoices = [{ id: 'vp-existing-001', name: 'Alex', language: 'en' }];
    const createdNames: string[] = [];

    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
        const u = url as string;
        if (u.includes('/health')) {
            return new Response(null, { status: 200 });
        }
        if (u.includes('/v1/voices')) {
            return new Response(JSON.stringify(existingVoices), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        if (u.includes('/v1/profiles')) {
            // Track which names are requested for creation
            const body = JSON.parse((init as any)?.body ?? '{}') as { name?: string };
            if (body.name) createdNames.push(body.name);
            const profile = { id: `vp-new-${createdNames.length}`, name: body.name ?? '', language: 'en' };
            return new Response(JSON.stringify(profile), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(null, { status: 404 });
    });

    const { seedVoiceProfiles, ROLE_VOICES } = await import('./voice-profile-seeder.js');
    const result = await seedVoiceProfiles();

    // 'Alex' (developer) should already be in the result with the existing ID
    assert.strictEqual(result.get('developer'), 'vp-existing-001', 'existing profile should use existing id');

    // 'Alex' should NOT appear in createdNames — it was skipped
    assert.ok(!createdNames.includes('Alex'), 'Alex should not be re-created');

    // All 12 roles should be in the result (11 created + 1 existing)
    const totalRoles = Object.keys(ROLE_VOICES).length;
    assert.strictEqual(result.size, totalRoles, `expected ${totalRoles} roles in result, got ${result.size}`);
});

// ---------------------------------------------------------------------------
// seedVoiceProfiles — continues when individual profile creation fails
// ---------------------------------------------------------------------------

test('seedVoiceProfiles continues when a single createVoiceProfileFromDescription call fails', async (t) => {
    let callCount = 0;

    t.mock.method(globalThis, 'fetch', async (url: string) => {
        const u = url as string;
        if (u.includes('/health')) {
            return new Response(null, { status: 200 });
        }
        if (u.includes('/v1/voices')) {
            // Return no existing voices
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        if (u.includes('/v1/profiles')) {
            callCount++;
            // Fail the first call, succeed for the rest
            if (callCount === 1) {
                return new Response(JSON.stringify({ error: 'failed' }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' },
                });
            }
            const profile = { id: `vp-${callCount}`, name: `Voice-${callCount}`, language: 'en' };
            return new Response(JSON.stringify(profile), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(null, { status: 404 });
    });

    const { seedVoiceProfiles, ROLE_VOICES } = await import('./voice-profile-seeder.js');
    // Should not throw even though the first profile creation failed
    const result = await seedVoiceProfiles();

    const totalRoles = Object.keys(ROLE_VOICES).length;
    // 11 succeeded, 1 failed → result has at most totalRoles - 1 entries
    assert.ok(result.size >= totalRoles - 1, `expected at least ${totalRoles - 1} profiles, got ${result.size}`);
});
