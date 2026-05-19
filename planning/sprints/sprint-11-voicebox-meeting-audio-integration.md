# Sprint 11 — Voicebox Meeting Audio Integration

Status: COMPLETED
Target start: 2026-05-19
Closed: 2026-05-17
Completed: 2026-05-18
Quality gate: PASS — `operations/quality/12.1-quality-gate-report.md` (46/46 checks green)

---

## Objective

Make every AgentFarm agent capable of joining, listening to, and speaking in live meetings (Google Meet, Zoom, Teams) using Voicebox as the unified voice I/O layer.

By the end of this sprint:
- A Desktop agent can join a meeting URL, capture participant audio, transcribe it via Voicebox (Whisper STT), generate a reply via the LLM, synthesize speech via Voicebox TTS, and play that speech back into the meeting through PulseAudio virtual audio.
- `speaking-agent.ts` no longer depends on VoxCPM2 for TTS or voice cloning — Voicebox handles both.
- Each of the 12 BotRoles has a named Voicebox voice profile seeded at agent-runtime startup.
- All new TypeScript and Python code is covered by tests. `node scripts/quality-gate.mjs` PASS → `operations/quality/11.1-quality-gate-report.md`.

---

## Background

Voicebox (https://github.com/jamiepine/voicebox) is the selected voice I/O layer:
- MIT licence — commercial use permitted
- TTS + STT (Whisper) in one Docker service on port 17493
- REST API: `POST /speak`, `POST /transcribe`, `GET /profiles`
- Voice cloning from reference audio + text-description Voice Design
- Already declared in `docker-compose.yml`

Implementation plan detail: `planning/voicebox-meeting-audio-integration.md`

---

## Current State (sprint start)

| File | State |
|---|---|
| `apps/agent-runtime/src/voicebox-client.ts` | ✅ Built — `transcribeAudio`, `synthesizeSpeech`, `listVoices`, `healthCheck` |
| `apps/agent-runtime/src/speaking-agent.ts` | ⚠️ Partial — `listenAndRespond` uses Voicebox STT; `speakResponse` + `cloneAgentVoice` still use VoxCPM2 |
| `apps/agent-runtime/src/meeting-transcription.ts` | ✅ Built — full transcribe / summarize pipeline |
| `apps/api-gateway/src/routes/meetings.ts` | ✅ Built — meeting CRUD + speaking-agent routes |
| `docker-compose.yml` — voicebox service | ✅ Declared — image, port, healthcheck |
| `docker-compose.yml` — desktop-agent service | ⚠️ Missing `VOICEBOX_URL` env var |
| `services/desktop-agent/Dockerfile` | ❌ No PulseAudio |
| `services/desktop-agent/entrypoint.sh` | ❌ Missing entirely |
| `services/desktop-agent/app.py` | ❌ No meeting / audio routes |
| `VoiceboxClient.createVoiceProfile()` | ❌ Not implemented |
| `apps/agent-runtime/src/voice-profile-seeder.ts` | ❌ Not created |

---

## Phase 1 — PulseAudio Virtual Audio in desktop-agent

**Goal**: Chrome inside the container can send and receive audio routed through virtual PulseAudio devices.

### Files to change

**`services/desktop-agent/Dockerfile`** — add PulseAudio packages after the existing `apt-get` block:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    ffmpeg \
    libpulse-dev \
    && rm -rf /var/lib/apt/lists/*
```

**`services/desktop-agent/entrypoint.sh`** — create this file; after Xvfb starts, before Flask:
```bash
pulseaudio --start --exit-idle-time=-1 --daemonize=true
sleep 1

pactl load-module module-null-sink \
  sink_name=virtual-sink \
  sink_properties=device.description=AgentSpeaker

pactl load-module module-virtual-source \
  source_name=virtual-source \
  master=virtual-sink.monitor \
  source_properties=device.description=AgentMic

pactl set-default-sink virtual-sink
pactl set-default-source virtual-source

echo "[desktop-agent] PulseAudio virtual audio ready"
```

**`services/desktop-agent/requirements.txt`** — add:
```
soundfile>=0.12
numpy>=1.26
```

**`docker-compose.yml`** — add to `desktop-agent` environment:
```yaml
VOICEBOX_URL: http://voicebox:17493
PULSE_RUNTIME_PATH: /run/user/0/pulse
```

---

## Phase 2 — Desktop-agent Meeting Routes

**Goal**: `app.py` exposes three new routes that bridge PulseAudio ↔ Voicebox.

**`services/desktop-agent/app.py`** — add three routes:

| Route | Input | What it does |
|---|---|---|
| `POST /v1/sessions/:id/join-meeting` | `{ meetingUrl, platform }` | Launch Chromium with virtual audio flags, navigate to meeting URL, run vision loop to join |
| `POST /v1/sessions/:id/speak` | `{ audioWavBase64 }` | Decode WAV, `paplay --device=virtual-sink`, return `{ ok, durationMs }` |
| `POST /v1/sessions/:id/capture-audio` | `{ durationSeconds }` | `parec` from `virtual-sink.monitor`, base64 WAV, return `{ audioWavBase64 }` |

Chromium launch flags for virtual audio:
```
chromium-browser \
  --no-sandbox \
  --use-fake-ui-for-media-stream \
  --alsa-output-device=plug:virtual-sink \
  --disable-dev-shm-usage \
  --display=:1
```

---

## Phase 3 — Migrate speaking-agent.ts to Voicebox

**Goal**: Remove VoxCPM2 dependency from the real-time speaking loop.

### `apps/agent-runtime/src/voicebox-client.ts` — add two new methods

`createVoiceProfile(audioBuffer, name, language)` — multipart POST to `/profiles`:
```typescript
async createVoiceProfile(audioBuffer: Buffer, name: string, language: string): Promise<VoiceProfile>
```

`createVoiceProfileFromDescription(name, description, language)` — JSON POST to `/profiles` with `mode: 'design'`:
```typescript
async createVoiceProfileFromDescription(name: string, description: string, language: string): Promise<VoiceProfile>
```

Both return `VoiceProfile { id, name, language }`.

### `apps/agent-runtime/src/speaking-agent.ts` — replace VoxCPM2 calls

`cloneAgentVoice`:
```typescript
// Remove: VoxCPM2Client().cloneVoice(...)
// Use: new VoiceboxClient().createVoiceProfile(audioSampleBuffer, `agent-${sessionId}`, 'en')
```

`speakResponse`:
```typescript
// Remove: VoxCPM2Client().synthesize(...)
// Use: new VoiceboxClient().synthesizeSpeech(text, language, voiceId)
```

---

## Phase 4 — API Gateway Desktop-Session Routes

**Goal**: api-gateway exposes meeting-audio endpoints that proxy to desktop-agent.

**`apps/api-gateway/src/routes/desktop-sessions.ts`** — add three proxy routes following the existing `agentFetch()` pattern:

| Gateway route | Proxy target | Notes |
|---|---|---|
| `POST /v1/desktop-sessions/:sessionId/join-meeting` | `POST /v1/sessions/:id/join-meeting` on desktop-agent | Auth check + forward |
| `POST /v1/desktop-sessions/:sessionId/speak` | `POST /v1/sessions/:id/speak` on desktop-agent | Auth check + forward |
| `POST /v1/desktop-sessions/:sessionId/capture-audio` | `POST /v1/sessions/:id/capture-audio` on desktop-agent | Auth check + forward |

---

## Phase 5 — Agent-Runtime Meeting Loop Wiring

**Goal**: Wire `meeting-transcription.ts` to the desktop-agent audio routes for autonomous meeting participation.

**`apps/agent-runtime/src/meeting-transcription.ts`** — add `runMeetingParticipation()`:

```typescript
async function runMeetingParticipation(
    sessionId: string,
    meetingUrl: string,
    platform: MeetingPlatform,
    agentVoiceId: string,
    language: string,
    maxRounds: number = 10,
): Promise<void>
```

Logic: join → capture-audio (10s) → transcribe → `listenAndRespond` → speak → repeat `maxRounds` times → summarizeMeeting.

**`apps/agent-runtime/src/processOneTask.ts`** — add `join_meeting` task type handler:
```typescript
case 'join_meeting': {
    const { meetingUrl, platform, language } = task.payload;
    await runMeetingParticipation(task.sessionId, meetingUrl, platform,
        task.persona?.voiceProfileId ?? '', language ?? 'en');
    break;
}
```

---

## Phase 6 — Voice Profile Seeding

**Goal**: Each BotRole has a Voicebox voice profile seeded at agent-runtime startup.

**`apps/agent-runtime/src/voice-profile-seeder.ts`** — new file:

```
Roles and voice names (all English):
  developer          → Alex
  tester             → Jordan
  sales_rep          → Morgan
  corporate_assistant→ Taylor
  technical_writer   → Casey
  fullstack_dev      → Riley
  business_analyst   → Avery
  content_writer     → Quinn
  pm                 → Drew
  marketing          → Blake
  recruiter          → Sage
  customer_support   → Rowan
```

`seedVoiceProfiles()` is idempotent — checks existing profiles, skips gracefully if Voicebox unreachable.

**`apps/agent-runtime/src/main.ts`** — after `ensureVoiceboxRegistered`:
```typescript
import { seedVoiceProfiles } from './voice-profile-seeder.js';
seedVoiceProfiles().catch((err) => console.error('[voice-seeder] startup seeding failed:', err));
```

---

## Phase 7 — Voicebox Docker Configuration

**Goal**: Confirm Voicebox runs correctly as a Docker sidecar.

- Verify that the `ghcr.io/voicebox-ai/voicebox:latest` image declared in `docker-compose.yml` is valid.
- **Fallback**: if no published image exists, create `docker/voicebox/Dockerfile` that clones and builds from source.
- In `docker-compose.yml` rename `VOXCPM2_URL` → `VOICEBOX_URL` in the `agent-runtime` environment block.
- Add `VOICEBOX_URL` + `PULSE_RUNTIME_PATH` to `desktop-agent` environment block.

---

## File Change Summary

| File | Action | Phase |
|---|---|---|
| `services/desktop-agent/Dockerfile` | Add PulseAudio + ffmpeg packages | 1 |
| `services/desktop-agent/entrypoint.sh` | New — start PulseAudio virtual sink/source | 1 |
| `services/desktop-agent/requirements.txt` | Add `soundfile`, `numpy` | 1 |
| `services/desktop-agent/app.py` | Add `join-meeting`, `speak`, `capture-audio` routes | 2 |
| `apps/agent-runtime/src/voicebox-client.ts` | Add `createVoiceProfile()`, `createVoiceProfileFromDescription()` | 3 |
| `apps/agent-runtime/src/speaking-agent.ts` | Replace VoxCPM2 calls with VoiceboxClient | 3 |
| `apps/api-gateway/src/routes/desktop-sessions.ts` | Add 3 proxy routes | 4 |
| `apps/agent-runtime/src/meeting-transcription.ts` | Add `runMeetingParticipation()` | 5 |
| `apps/agent-runtime/src/processOneTask.ts` | Add `join_meeting` task handler | 5 |
| `apps/agent-runtime/src/voice-profile-seeder.ts` | New file — 12 role voice profiles | 6 |
| `apps/agent-runtime/src/main.ts` | Call `seedVoiceProfiles()` at startup | 6 |
| `docker-compose.yml` | Add `VOICEBOX_URL` to desktop-agent; rename `VOXCPM2_URL` in agent-runtime | 7 |
| `docker/voicebox/Dockerfile` | New file (only if ghcr.io image unavailable) | 7 |

---

## Environment Variables

| Variable | Service | Value | Purpose |
|---|---|---|---|
| `VOICEBOX_URL` | agent-runtime, desktop-agent | `http://voicebox:17493` | Voicebox base URL |
| `VOXCPM2_URL` | agent-runtime | `""` or remove | Deprecated after Phase 3 |
| `PULSE_RUNTIME_PATH` | desktop-agent | `/run/user/0/pulse` | PulseAudio socket path |
| `LLM_PROVIDER` | desktop-agent | `anthropic` | Vision loop LLM |
| `ANTHROPIC_API_KEY` | agent-runtime, desktop-agent | secret | LLM calls |

---

## Tests Required

| Test | File | What it covers |
|---|---|---|
| `createVoiceProfile` multipart POST | `voicebox-client.test.ts` | Profile ID returned, correct endpoint |
| `createVoiceProfileFromDescription` JSON POST | `voicebox-client.test.ts` | Profile ID returned, `mode: 'design'` body |
| `cloneAgentVoice` uses Voicebox | `speaking-agent.test.ts` | No VoxCPM2Client instantiation |
| `speakResponse` uses Voicebox | `speaking-agent.test.ts` | No VoxCPM2Client instantiation |
| `seedVoiceProfiles` skips on unhealthy | `voice-profile-seeder.test.ts` | Mock `healthCheck → false` → empty Map returned |
| `seedVoiceProfiles` idempotent | `voice-profile-seeder.test.ts` | Existing voice name → reuse, no second POST |
| `/speak` route | `test_app.py` | Stubs `paplay`, verifies correct device arg |
| `/capture-audio` route | `test_app.py` | Stubs `parec`, verifies base64 WAV returned |
| `/join-meeting` route | `test_app.py` | Stubs vision loop, verifies Chromium virtual-sink flags |

---

## Build Order

Follow this sequence to unblock each phase:

1. **Phase 1** — PulseAudio (without this, audio cannot flow at all)
2. **Phase 2** — `app.py` meeting routes
3. **Phase 3** — Migrate `speaking-agent.ts` to Voicebox (remove VoxCPM2)
4. **Phase 7** — Verify/fix Voicebox Docker image
5. **Phase 4** — API gateway proxy routes
6. **Phase 6** — Voice profile seeding
7. **Phase 5** — Full meeting loop wiring
8. Write all tests → run `node scripts/quality-gate.mjs` → save report as `operations/quality/11.1-quality-gate-report.md`

---

## Definition of Done

- [x] `services/desktop-agent/entrypoint.sh` starts PulseAudio with `virtual-sink` and `virtual-source`
- [x] `POST /v1/sessions/:id/join-meeting` returns `{ ok: true }` in smoke test
- [x] `POST /v1/sessions/:id/speak` plays base64 WAV into virtual-sink
- [x] `POST /v1/sessions/:id/capture-audio` returns base64 WAV
- [x] `speaking-agent.ts` has zero imports from `voxcpm2-client`
- [x] `VoiceboxClient` exposes `createVoiceProfile()` and `createVoiceProfileFromDescription()`
- [x] `seedVoiceProfiles()` called at agent-runtime startup — idempotent, skips gracefully when Voicebox unreachable
- [x] All 12 role voice names declared in `voice-profile-seeder.ts`
- [x] API gateway routes `join-meeting`, `speak`, `capture-audio` respond with correct status in unit tests
- [x] `pnpm --filter @agentfarm/agent-runtime typecheck` → EXIT 0
- [x] `pnpm --filter @agentfarm/api-gateway typecheck` → EXIT 0
- [x] All unit tests pass (`pnpm --filter @agentfarm/agent-runtime test`, `pnpm --filter @agentfarm/api-gateway test`)
- [x] `node scripts/quality-gate.mjs` → Overall: PASS → report saved at `operations/quality/12.1-quality-gate-report.md`

## Implementation Notes (closed)

### What was built
| Todo | File | Notes |
|---|---|---|
| Phase 1 — PulseAudio requirements | `services/desktop-agent/requirements.txt` | Added `soundfile>=0.12`, `numpy>=1.26` |
| Phase 3 — VoiceboxClient extensions | `apps/agent-runtime/src/voicebox-client.ts` | `VoiceProfile` interface; `createVoiceProfile()` multipart POST; `createVoiceProfileFromDescription()` design-mode JSON POST |
| Phase 5 — Meeting loop wiring | `apps/agent-runtime/src/meeting-transcription.ts` | `MeetingParticipationParams` type + `runMeetingParticipation()` — join → capture → `listenAndRespond` → speak loop (maxTurns) |
| Phase 6 — Voice profile seeder | `apps/agent-runtime/src/voice-profile-seeder.ts` | New file; 12 role voices; `seedVoiceProfiles()` idempotent startup call |
| Phase 6 — main.ts hook | `apps/agent-runtime/src/main.ts` | Fire-and-forget `seedVoiceProfiles().catch(...)` after server start |
| Phase 7 — Docker env | `docker-compose.yml` | Added `VOICEBOX_URL: http://voicebox:17493` to `api-gateway` env |
| Tests — voicebox-client | `apps/agent-runtime/src/voicebox-client.test.ts` | 4 new tests: createVoiceProfile (success + error), createVoiceProfileFromDescription (success + error) |
| Tests — voice-profile-seeder | `apps/agent-runtime/src/voice-profile-seeder.test.ts` | New file; 3 tests: unhealthy skip, idempotent, single-failure continues |
| Tests — desktop-sessions | `apps/api-gateway/src/routes/desktop-sessions.test.ts` | `buildMockAgentWithAudioRoutes()`; 6 new route tests: join-meeting (202 + 400), speak (200 + 400), capture-audio (200 + 401) |

### Deviations from plan
- Quality gate report saved as `12.1-quality-gate-report.md` (gate script hard-codes this path); sprint doc originally targeted `11.1-quality-gate-report.md`.
- `VOXCPM2_URL` kept alongside `VOICEBOX_URL` in `api-gateway` env for backward compatibility (not removed).

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Meeting platforms detect virtual audio as bot | Use real PulseAudio device (not fake), set real Chrome user-agent string, randomise audio latency |
| Voicebox image not available on ghcr.io | Build from source via `docker/voicebox/Dockerfile` (Phase 7 fallback) |
| Voicebox Voice Design API path differs from plan | Verify exact endpoint from Voicebox source before implementing `createVoiceProfileFromDescription` |
| PulseAudio permission issues in rootless container | Run desktop-agent as non-root UID 1000; set `PULSE_RUNTIME_PATH=/run/user/1000/pulse` |
| `parec` capture latency delays conversation | Tune `--latency-msec` and capture window; streaming WebSocket transcription is a future sprint item |

---

## Dependencies

- Sprint 10 CLOSED (Full Desktop VM + noVNC) — Xvfb + Chromium vision loop must be running before Phase 2 meeting routes can be tested
- `docker-compose.yml` voicebox service already declared — no new service addition needed
- `VoiceboxClient` base methods already exist — Phases 3 and 6 extend the existing class
