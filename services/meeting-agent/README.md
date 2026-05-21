# @agentfarm/meeting-agent

Control plane for the AgentFarm meeting agent. Owns:

- The meeting **lifecycle FSM** (`scheduled` → `joining` → `joined` →
  `listening` ⇄ `speaking` → `completed`/`failed`/`paused`/`escalation_required`).
- The **transcript log** for each active session (in memory; durable storage
  is the caller's responsibility).
- The **Supertonic TTS bridge** that turns agent utterances into audio,
  ready to be fed into a virtual microphone.

The continuous audio capture + Pipecat pipeline (Silero VAD →
faster-whisper → LLM bridge → Supertonic) runs in a sidecar inside the
`desktop-agent` VM and is **not** part of this image. This service exposes a
narrow HTTP surface so `apps/agent-runtime` can drive the pipeline without
caring about its implementation.

## HTTP surface

| Method | Path                              | Purpose                              |
| -----: | :-------------------------------- | :----------------------------------- |
|   GET  | `/health`                         | Liveness — returns active session count. |
|  POST  | `/v1/sessions`                    | Create a new session in `scheduled`. |
|   GET  | `/v1/sessions/:id`                | Fetch the latest session record.     |
|  POST  | `/v1/sessions/:id/start`          | Drive FSM through `joining → joined → listening`. |
|  POST  | `/v1/sessions/:id/say`            | Synthesise + record an agent utterance. Requires `disclosureAnnounced=true` once. |
|   GET  | `/v1/sessions/:id/transcript`     | Return the transcript log.           |
|  POST  | `/v1/sessions/:id/stop`           | Terminal transition to `completed`.  |

When `MEETING_AGENT_TOKEN` is set, all `/v1` routes require
`Authorization: Bearer <token>`.

## Environment variables

| Variable               | Default     | Purpose                                                 |
| ---------------------- | ----------- | ------------------------------------------------------- |
| `MEETING_AGENT_PORT`   | `7799`      | TCP port to bind                                        |
| `MEETING_AGENT_HOST`   | `0.0.0.0`   | Bind host                                               |
| `MEETING_AGENT_TOKEN`  | (none)      | Optional bearer token enforced on `/v1` routes          |
| `SUPERTONIC_URL`       | (none)      | Base URL of the Supertonic / VoxCPM-compatible endpoint |
| `SUPERTONIC_API_KEY`   | (none)      | Bearer token forwarded to the TTS server                |
| `SUPERTONIC_MODEL`     | `supertonic`| Model identifier                                        |
| `MEETING_AGENT_AUTOSTART` | (none)    | When `1`, the entrypoint boots the server               |

## Local development

```pwsh
pnpm --filter @agentfarm/meeting-agent typecheck
pnpm --filter @agentfarm/meeting-agent test
pnpm --filter @agentfarm/meeting-agent dev
```

## Disclosure

The FSM refuses to enter `speaking` until `disclosureAnnounced` is `true` on
the session, matching the EU AI Act Article 52 obligation. Callers must set
`disclosureAnnounced: true` on the first `/say` call after the agent has
delivered its disclosure to the meeting (e.g. *"Hi, I'm an AI assistant
joining on behalf of …"*).
