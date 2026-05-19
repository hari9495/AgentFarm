# Voicebox Meeting Audio Integration — Implementation Plan

_Created: 2026-05-17_

---

## 1. Decision

**Voicebox** (https://github.com/jamiepine/voicebox) is selected as the voice I/O layer for AgentFarm meeting participation.

- MIT licence — commercial use permitted
- Complete voice I/O stack: TTS + STT (Whisper) in one service
- REST API (`POST /speak`, `POST /transcribe`, `GET /profiles`) + built-in MCP server
- Docker-deployable, Linux-compatible
- Voice cloning from reference audio → each agent role gets a unique persona voice
- Already declared in `docker-compose.yml` (port 17493)

---

## 2. What a Meeting-Capable Agent Does

```
┌────────────────────────────────────────────────────────┐
│  desktop-agent container (Ubuntu 22.04)                │
│                                                        │
│  Xvfb :1  ─── Openbox ─── Chromium ─── Meeting URL    │
│                                │                       │
│              PulseAudio virtual audio                  │
│               ┌────────────────────┐                   │
│               │  virtual-sink      │ ← agent speaks    │
│               │  virtual-source    │ → agent hears     │
│               └────────────────────┘                   │
│                        │                               │
│            Flask API  (app.py, port 5003)              │
│   POST /v1/sessions/:id/speak                          │
│   POST /v1/sessions/:id/capture-audio                  │
│   POST /v1/sessions/:id/join-meeting                   │
└───────────────────────│────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼────────────────────────────────┐
│  voicebox container (port 17493)                       │
│   POST /speak          → TTS → WAV bytes               │
│   POST /transcribe     → Whisper STT → text            │
│   GET  /profiles       → list voice profiles           │
└────────────────────────────────────────────────────────┘
                        │
              agent-runtime (TypeScript)
               VoiceboxClient  (already built)
               meeting-transcription.ts (already built)
               speaking-agent.ts  (already built)
```

---

## 3. Current State — What Already Exists

| File | Status | Notes |
|---|---|---|
| `apps/agent-runtime/src/voicebox-client.ts` | ✅ Built | `transcribeAudio`, `synthesizeSpeech`, `listVoices`, `healthCheck` |
| `apps/agent-runtime/src/voxcpm2-client.ts` | ✅ Built | Will be superseded by Voicebox for TTS; keep for VoxCPM2 fallback only |
| `apps/agent-runtime/src/voicebox-mcp-registrar.ts` | ✅ Built | Registers Voicebox MCP server at agent-runtime startup |
| `apps/agent-runtime/src/speaking-agent.ts` | ⚠️ Partial | `listenAndRespond` uses Voicebox for STT ✅. `speakResponse` and `cloneAgentVoice` use VoxCPM2 ❌ — must migrate to Voicebox |
| `apps/agent-runtime/src/meeting-transcription.ts` | ✅ Built | Full pipeline: start → transcribe (Voicebox) → summarize → distribute |
| `apps/api-gateway/src/routes/meetings.ts` | ✅ Built | CRUD + speaking-agent PATCH/POST routes |
| `docker-compose.yml` — `voicebox` service | ✅ Declared | Image, port, healthcheck present |
| `docker-compose.yml` — `desktop-agent` service | ⚠️ Partial | Missing `VOICEBOX_URL` env var |
| `services/desktop-agent/Dockerfile` | ❌ Missing | No PulseAudio — audio cannot flow |
| `services/desktop-agent/entrypoint.sh` | ❌ Missing | PulseAudio virtual sink/source not started |
| `services/desktop-agent/app.py` | ❌ Missing | No meeting-join, speak, or capture-audio routes |
| `VoiceboxClient.createVoiceProfile()` | ❌ Missing | Voice cloning via Voicebox Profiles API not implemented |

---

## 4. Implementation Phases

### Phase 1 — PulseAudio Virtual Audio in desktop-agent  
**Goal**: Chrome inside the container can send and receive audio, routed through virtual devices.

#### 4.1.1  `services/desktop-agent/Dockerfile`
Add PulseAudio and audio utilities after the existing apt-get block:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*
```

Also add `libpulse-dev` for Python `sounddevice` if used.

#### 4.1.2  `services/desktop-agent/entrypoint.sh`
After Xvfb starts, before Flask:

```bash
# Start PulseAudio daemon (daemonize, no system mode)
pulseaudio --start --exit-idle-time=-1 --daemonize=true
sleep 1

# Virtual sink — agent TTS audio plays here; Chromium mic capture reads it
pactl load-module module-null-sink \
  sink_name=virtual-sink \
  sink_properties=device.description=AgentSpeaker

# Virtual source — loopback from virtual-sink.monitor so Chromium picks it up
pactl load-module module-virtual-source \
  source_name=virtual-source \
  master=virtual-sink.monitor \
  source_properties=device.description=AgentMic

# Set as defaults so Chromium uses them without additional flags
pactl set-default-sink virtual-sink
pactl set-default-source virtual-source

echo "[desktop-agent] PulseAudio virtual audio ready"
```

#### 4.1.3  `services/desktop-agent/requirements.txt`
Add audio capture library:

```
soundfile>=0.12
numpy>=1.26
```

#### 4.1.4  `docker-compose.yml` — desktop-agent service
Add env vars:

```yaml
VOICEBOX_URL: http://voicebox:17493
PULSE_SERVER: unix:/run/user/1000/pulse/native
```

---

### Phase 2 — Desktop-agent Meeting Routes  
**Goal**: `app.py` exposes three new routes that bridge PulseAudio ↔ Voicebox.

#### 4.2.1  `POST /v1/sessions/:id/join-meeting`
Input: `{ meetingUrl: string, platform: "teams"|"zoom"|"google_meet" }`

Logic:
1. Open Chromium with PulseAudio flags (`--alsa-input-device=virtual-source --alsa-output-device=virtual-sink`)
2. Navigate to `meetingUrl`
3. Run vision loop with goal: `"Join the meeting, enable microphone, disable camera"`
4. Return `{ ok: true, sessionId }`

Chromium launch flags required for virtual audio:
```
chromium-browser \
  --no-sandbox \
  --use-fake-ui-for-media-stream \
  --alsa-output-device=plug:virtual-sink \
  --disable-dev-shm-usage \
  --display=:1
```

#### 4.2.2  `POST /v1/sessions/:id/speak`
Input: `{ audioWavBase64: string }` (WAV bytes base64-encoded from Voicebox `/speak`)

Logic:
1. Decode base64 → temp WAV file
2. `paplay --device=virtual-sink /tmp/agent-speak.wav`
3. Return `{ ok: true, durationMs }`

This plays synthesized agent speech into the virtual sink, which Chromium's virtual mic picks up and sends to the meeting platform.

#### 4.2.3  `POST /v1/sessions/:id/capture-audio`
Input: `{ durationSeconds: number }` (default 10)

Logic:
1. `parec --device=virtual-sink.monitor --format=s16le --rate=16000 --channels=1 --latency-msec=100 -d {durationSeconds * 1000}ms /tmp/capture.wav`
2. Base64-encode WAV file
3. Return `{ audioWavBase64: string }`

This records what participants are saying from the meeting platform output.

---

### Phase 3 — Migrate speaking-agent.ts to Voicebox  
**Goal**: Remove VoxCPM2 dependency from the real-time speaking loop; use Voicebox for both TTS and voice cloning.

#### 4.3.1  Add `createVoiceProfile()` to `VoiceboxClient`
File: `apps/agent-runtime/src/voicebox-client.ts`

```typescript
export interface VoiceProfile {
    id: string;
    name: string;
    language: string;
}

/**
 * Create a new voice profile from an audio sample.
 * POSTs multipart/form-data with the audio blob and profile name.
 */
async createVoiceProfile(
    audioBuffer: Buffer,
    name: string,
    language: string,
): Promise<VoiceProfile> {
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    form.append('audio', blob, 'sample.wav');
    form.append('name', name);
    form.append('language', language);

    const response = await fetch(`${VOICEBOX_BASE}/profiles`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`[voicebox] createVoiceProfile failed with HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<VoiceProfile>;
}
```

#### 4.3.2  Update `cloneAgentVoice` in `speaking-agent.ts`
Replace VoxCPM2 clone call with Voicebox `createVoiceProfile`:

```typescript
// Before (VoxCPM2):
const vox = new VoxCPM2Client();
const voiceId = await vox.cloneVoice(audioSampleBuffer, `agent-${sessionId}`, 'en');

// After (Voicebox):
const voicebox = new VoiceboxClient();
const profile = await voicebox.createVoiceProfile(audioSampleBuffer, `agent-${sessionId}`, 'en');
const voiceId = profile.id;
```

#### 4.3.3  Update `speakResponse` in `speaking-agent.ts`
Replace VoxCPM2 synthesize with Voicebox synthesizeSpeech:

```typescript
// Before (VoxCPM2):
const vox = new VoxCPM2Client();
return vox.synthesize(text, language, { voiceId });

// After (Voicebox):
const voicebox = new VoiceboxClient();
return voicebox.synthesizeSpeech(text, language, voiceId);
```

---

### Phase 4 — API Gateway Desktop-Session Routes  
**Goal**: api-gateway exposes meeting-audio endpoints that proxy to desktop-agent.

File: `apps/api-gateway/src/routes/desktop-sessions.ts`

Add three new proxied routes:

| Route | Proxy target | Description |
|---|---|---|
| `POST /v1/desktop-sessions/:sessionId/join-meeting` | `POST /v1/sessions/:id/join-meeting` | Open Chrome, navigate, click Join |
| `POST /v1/desktop-sessions/:sessionId/speak` | `POST /v1/sessions/:id/speak` | Play TTS audio via PulseAudio |
| `POST /v1/desktop-sessions/:sessionId/capture-audio` | `POST /v1/sessions/:id/capture-audio` | Record N seconds of meeting audio |

All three follow the existing `agentFetch()` pattern already in the file.

---

### Phase 5 — Agent-Runtime Meeting Loop Wiring  
**Goal**: Connect the existing `meeting-transcription.ts` pipeline to the desktop-agent audio routes so the agent autonomously joins, listens, responds.

#### 4.5.1  `runMeetingParticipation()` function  
New function in `meeting-transcription.ts` (or a new `meeting-loop.ts`):

```typescript
async function runMeetingParticipation(
    sessionId: string,
    meetingUrl: string,
    platform: MeetingPlatform,
    agentVoiceId: string,
    language: string,
    maxRounds: number = 10,
): Promise<void> {
    const desktopBase = process.env['DESKTOP_AGENT_URL'] ?? 'http://desktop-agent:5003';

    // 1. Tell desktop-agent to join the meeting
    await fetch(`${desktopBase}/v1/sessions/${sessionId}/join-meeting`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingUrl, platform }),
    });

    for (let round = 0; round < maxRounds; round++) {
        // 2. Capture audio from meeting (10s window)
        const captureRes = await fetch(
            `${desktopBase}/v1/sessions/${sessionId}/capture-audio`,
            { method: 'POST', body: JSON.stringify({ durationSeconds: 10 }) },
        );
        const { audioWavBase64 } = await captureRes.json();
        const audioBuffer = Buffer.from(audioWavBase64, 'base64');

        // 3. Transcribe via Voicebox
        const transcribed = await transcribeMeeting(sessionId, audioBuffer);

        // 4. Generate reply via LLM + speak back into meeting
        const spokenBuffer = await listenAndRespond(sessionId, audioBuffer, language);
        const spokenBase64 = spokenBuffer.toString('base64');
        await fetch(`${desktopBase}/v1/sessions/${sessionId}/speak`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ audioWavBase64: spokenBase64 }),
        });
    }

    // 5. Summarize the full meeting
    await summarizeMeeting(sessionId, /* accumulated transcript */ '', language);
}
```

#### 4.5.2  Task handler hook  
In `apps/agent-runtime/src/processOneTask.ts` (or the task router), add a handler for `taskType === 'join_meeting'`:

```typescript
case 'join_meeting': {
    const { meetingUrl, platform, language } = task.payload;
    await runMeetingParticipation(
        task.sessionId,
        meetingUrl,
        platform,
        task.persona?.voiceProfileId ?? '',
        language ?? 'en',
    );
    break;
}
```

---

### Phase 6 — Voice Profile Seeding  
**Goal**: Each BotRole has a Voicebox voice profile at service startup so agents can speak with distinct persona voices.

#### 4.6.1  `apps/agent-runtime/src/voice-profile-seeder.ts`  
New file — called once at agent-runtime startup after Voicebox health check passes:

```typescript
import { VoiceboxClient } from './voicebox-client.js';

const ROLE_VOICES: Record<string, { name: string; language: string; description: string }> = {
    developer:          { name: 'Alex',      language: 'en', description: 'Calm, professional male voice' },
    tester:             { name: 'Jordan',    language: 'en', description: 'Clear, methodical voice' },
    sales_rep:          { name: 'Morgan',    language: 'en', description: 'Warm, persuasive voice' },
    corporate_assistant:{ name: 'Taylor',   language: 'en', description: 'Friendly, efficient voice' },
    technical_writer:   { name: 'Casey',     language: 'en', description: 'Clear, articulate voice' },
    fullstack_dev:      { name: 'Riley',     language: 'en', description: 'Energetic technical voice' },
    business_analyst:   { name: 'Avery',     language: 'en', description: 'Analytical, precise voice' },
    content_writer:     { name: 'Quinn',     language: 'en', description: 'Creative, expressive voice' },
    pm:                 { name: 'Drew',      language: 'en', description: 'Decisive, leadership voice' },
    marketing:          { name: 'Blake',     language: 'en', description: 'Enthusiastic, engaging voice' },
    recruiter:          { name: 'Sage',      language: 'en', description: 'Warm, empathetic voice' },
    customer_support:   { name: 'Rowan',     language: 'en', description: 'Patient, helpful voice' },
};

export async function seedVoiceProfiles(
    env = process.env,
): Promise<Map<string, string>> {
    const client = new VoiceboxClient();
    const roleToProfileId = new Map<string, string>();

    const healthy = await client.healthCheck();
    if (!healthy) {
        console.warn('[voice-seeder] Voicebox not reachable — skipping voice profile seeding');
        return roleToProfileId;
    }

    const existing = await client.listVoices();
    const existingNames = new Set(existing.map((v) => v.name));

    for (const [role, voice] of Object.entries(ROLE_VOICES)) {
        if (existingNames.has(voice.name)) {
            const found = existing.find((v) => v.name === voice.name);
            if (found) roleToProfileId.set(role, found.id);
            continue;
        }
        // Use Voicebox Voice Design — create from text description, no reference audio needed
        const profile = await client.createVoiceProfileFromDescription(
            voice.name,
            voice.description,
            voice.language,
        );
        roleToProfileId.set(role, profile.id);
        console.log(`[voice-seeder] Created voice profile "${voice.name}" for role "${role}"`);
    }

    return roleToProfileId;
}
```

#### 4.6.2  Add `createVoiceProfileFromDescription()` to `VoiceboxClient`  
Calls Voicebox Voice Design API (creates voice from text description — no reference audio needed):

```typescript
async createVoiceProfileFromDescription(
    name: string,
    description: string,
    language: string,
): Promise<VoiceProfile> {
    const response = await fetch(`${VOICEBOX_BASE}/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description, language, mode: 'design' }),
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`[voicebox] createVoiceProfileFromDescription failed HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<VoiceProfile>;
}
```

#### 4.6.3  Hook into `apps/agent-runtime/src/main.ts`  
After `ensureVoiceboxRegistered`:

```typescript
import { seedVoiceProfiles } from './voice-profile-seeder.js';

seedVoiceProfiles().catch((err: unknown) => {
    console.error('[voice-seeder] startup seeding failed:', err);
});
```

---

### Phase 7 — Voicebox Docker Configuration  
**Goal**: Confirm Voicebox runs correctly as a Docker sidecar.

#### 4.7.1  Verify Voicebox Docker image  
Voicebox ships a `Dockerfile` and `docker-compose.yml` in its own repo. The image in `docker-compose.yml` (`ghcr.io/voicebox-ai/voicebox:latest`) must be validated against their published image.

If no published image exists, build from source by adding a `docker/voicebox/` build context:

```yaml
# docker-compose.yml — replace image: with build:
voicebox:
  build:
    context: ./docker/voicebox
    dockerfile: Dockerfile
```

And `docker/voicebox/Dockerfile` clones + builds the Voicebox server:
```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth=1 https://github.com/jamiepine/voicebox /voicebox
WORKDIR /voicebox
RUN pip install -r requirements.txt
EXPOSE 17493
CMD ["python", "backend/main.py", "--port", "17493", "--host", "0.0.0.0"]
```

#### 4.7.2  `docker-compose.yml` — desktop-agent env vars
```yaml
desktop-agent:
  environment:
    VOICEBOX_URL: http://voicebox:17493   # ← add this
    PULSE_RUNTIME_PATH: /run/user/0/pulse
```

#### 4.7.3  `docker-compose.yml` — agent-runtime env var rename
The existing `VOXCPM2_URL: http://voicebox:17493` is misleading (it maps VoxCPM2 to Voicebox). After migration:
```yaml
agent-runtime:
  environment:
    VOICEBOX_URL: http://voicebox:17493   # rename from VOXCPM2_URL
    VOXCPM2_URL: ""                       # leave empty or remove
```

---

## 5. File Change Summary

| File | Action | Phase |
|---|---|---|
| `services/desktop-agent/Dockerfile` | Add `pulseaudio`, `pulseaudio-utils`, `alsa-utils` | 1 |
| `services/desktop-agent/entrypoint.sh` | Start PulseAudio + virtual sink/source | 1 |
| `services/desktop-agent/requirements.txt` | Add `soundfile`, `numpy` | 1 |
| `services/desktop-agent/app.py` | Add `join-meeting`, `speak`, `capture-audio` routes | 2 |
| `apps/agent-runtime/src/voicebox-client.ts` | Add `createVoiceProfile()`, `createVoiceProfileFromDescription()` | 3 |
| `apps/agent-runtime/src/speaking-agent.ts` | Replace VoxCPM2 calls with VoiceboxClient | 3 |
| `apps/api-gateway/src/routes/desktop-sessions.ts` | Add `join-meeting`, `speak`, `capture-audio` proxy routes | 4 |
| `apps/agent-runtime/src/meeting-transcription.ts` | Add `runMeetingParticipation()` | 5 |
| `apps/agent-runtime/src/voice-profile-seeder.ts` | New file — seeds 12 role voice profiles | 6 |
| `apps/agent-runtime/src/main.ts` | Call `seedVoiceProfiles()` at startup | 6 |
| `docker-compose.yml` | Add `VOICEBOX_URL` to desktop-agent; fix VOXCPM2_URL in agent-runtime | 7 |
| `docker/voicebox/Dockerfile` | New file (only if ghcr.io image unavailable) | 7 |

---

## 6. Environment Variables

| Variable | Service | Value | Purpose |
|---|---|---|---|
| `VOICEBOX_URL` | agent-runtime, desktop-agent | `http://voicebox:17493` | Voicebox base URL |
| `VOXCPM2_URL` | agent-runtime | `""` or remove | Deprecated after migration |
| `PULSE_RUNTIME_PATH` | desktop-agent | `/run/user/0/pulse` | PulseAudio socket path |
| `LLM_PROVIDER` | desktop-agent | `anthropic` | Vision loop LLM |
| `ANTHROPIC_API_KEY` | agent-runtime, desktop-agent | secret | LLM calls |

---

## 7. Testing Plan

### Unit tests (co-located .test.ts / .test.py)

| Test | Location | What it covers |
|---|---|---|
| `VoiceboxClient.createVoiceProfile` | `voicebox-client.test.ts` | Multipart POST, profile ID returned |
| `VoiceboxClient.createVoiceProfileFromDescription` | `voicebox-client.test.ts` | JSON POST, profile ID returned |
| `cloneAgentVoice` uses Voicebox | `speaking-agent.test.ts` | Stub VoiceboxClient, confirm no VoxCPM2 call |
| `speakResponse` uses Voicebox | `speaking-agent.test.ts` | Same stub pattern |
| `seedVoiceProfiles` — skips on unhealthy | `voice-profile-seeder.test.ts` | Mock healthCheck → false → empty map |
| `seedVoiceProfiles` — idempotent | `voice-profile-seeder.test.ts` | Existing voice name → reuse, no second POST |
| desktop-agent `/speak` route | `test_app.py` | Stub `paplay`, verify called with correct args |
| desktop-agent `/capture-audio` route | `test_app.py` | Stub `parec`, verify WAV base64 returned |
| desktop-agent `/join-meeting` route | `test_app.py` | Stub vision loop, verify Chromium flags contain virtual-sink |

### Integration smoke test (manual, post-deploy)

1. `docker compose up voicebox desktop-agent`
2. `curl -X POST http://localhost:5003/v1/sessions/test/join-meeting -d '{"meetingUrl":"https://meet.google.com/test","platform":"google_meet"}'`
3. `curl -X POST http://localhost:5003/v1/sessions/test/capture-audio -d '{"durationSeconds":5}'` → expect base64 WAV
4. `curl -X POST http://localhost:17493/speak -d '{"text":"Hello from AgentFarm","profile":"Alex"}'` → expect audio bytes
5. `curl -X POST http://localhost:5003/v1/sessions/test/speak -d '{"audioWavBase64":"..."}'` → expect `{"ok":true}`

---

## 8. Build Order (priority)

1. **Phase 1** — PulseAudio (unblocks everything; without audio routing, meeting join is silent)
2. **Phase 2** — Desktop-agent routes (speak + capture-audio + join-meeting in app.py)
3. **Phase 3** — Migrate speaking-agent.ts to Voicebox (remove VoxCPM2 from real-time loop)
4. **Phase 7** — Verify Voicebox Docker image in docker-compose.yml
5. **Phase 4** — API gateway proxy routes (thin wiring, low effort)
6. **Phase 6** — Voice profile seeding (enables per-role persona voices)
7. **Phase 5** — Full meeting loop wiring in meeting-transcription.ts
8. Write tests for all new code before quality gate run

---

## 9. Known Risks

| Risk | Mitigation |
|---|---|
| Meeting platforms detect virtual audio as bot | Use real PulseAudio device (not fake), set browser user-agent to real Chrome string, randomise audio latency |
| Voicebox image not available on ghcr.io | Build from source via `docker/voicebox/Dockerfile` (Phase 7 fallback) |
| Voicebox Voice Design API path differs from plan | Verify exact endpoint from Voicebox docs/source before implementing `createVoiceProfileFromDescription` |
| PulseAudio permission issues in rootless container | Run desktop-agent as non-root UID 1000; set `PULSE_RUNTIME_PATH=/run/user/1000/pulse` |
| `parec` capture latency adds delay to conversation | Tune `--latency-msec` and capture window; consider streaming WebSocket transcription in a future sprint |
