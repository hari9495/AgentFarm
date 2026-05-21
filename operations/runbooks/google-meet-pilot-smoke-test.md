# Google Meet pilot — smoke test

End-to-end smoke procedure for the meeting-agent + voice sidecar + VoxCPM
TTS stack against a real Google Meet URL.

## Prerequisites

- Docker Desktop running on the host.
- `.env` populated with at minimum:
  - `POSTGRES_PASSWORD`
  - `API_SESSION_SECRET`
  - `DASHBOARD_API_TOKEN`
  - `MEETING_AGENT_TOKEN` — strong random bearer; the sidecar will echo
    this same token back to the inbound transcript route, so do not share
    it with untrusted callers.
  - `PIPECAT_TOKEN` — strong random bearer used by meeting-agent to call
    the sidecar.
- A test Google Meet meeting URL where the agent is allowed to join (e.g.
  one you can let into the lobby yourself).

## 1. Build & start the stack

```powershell
cd D:\AgentFarm
docker compose build voxcpm meeting-agent desktop-agent
docker compose up -d voxcpm desktop-agent meeting-agent
docker compose ps
```

The desktop-agent image is heavy (~3 GB; bundles Playwright Chromium +
faster-whisper wheels) and may take 15–25 minutes on a cold cache.

## 2. Health checks

```powershell
docker compose exec meeting-agent node -e "fetch('http://localhost:7799/health').then(r=>r.json()).then(console.log)"
docker compose exec voxcpm python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://localhost:8765/health')))"
docker compose exec desktop-agent curl -s http://localhost:5003/health
```

All three should return `ok`.

### Voice sidecar (port 7800)

The pipecat STT/injection sidecar runs on port 7800 inside the `desktop-agent` container
when `.env` contains `ENABLE_VOICE_SIDECAR=1`.  Verify it with:

```powershell
docker compose exec desktop-agent curl -s http://localhost:7800/health
```

Expected response: `{"status":"ok"}` (or similar JSON with `status` field).

> **Tested 2026-05-21**: `(Invoke-WebRequest -UseBasicParsing http://localhost:7800/health).Content`
> returned `{"ok": true, "capturing": false, "model_loaded": false, "pulse_ready": true}` — port
> confirmed reachable from Windows host. All 3 containers (`voxcpm`, `desktop-agent`,
> `meeting-agent`) showed `(healthy)` in `docker compose ps`.

> **py-heavy packages**: As of the 2026-05-21 `--no-cache` rebuild, `faster-whisper==1.0.3`,
> `silero-vad==5.1.2`, `sounddevice==0.4.7`, and `torch 2.12.0` are baked into the
> `desktop-agent` image at the `py-heavy` build stage.  A Playwright symlink is also
> pre-created in the runtime stage: `/app/node_modules/playwright → /usr/lib/node_modules/playwright`.
> If the sidecar does not respond, confirm the image was built with `--no-cache` and that
> `ENABLE_VOICE_SIDECAR=1` is set in `.env`.  Voice injection is best-effort and will not
> block the `/say` path check below.

## 3. Verify TTS path

```powershell
$body = @{ tenantId='t1'; workspaceId='ws1'; botId='b1'; platform='meet'; mode='standup'; meetingId='m1' } | ConvertTo-Json
$h = @{ Authorization = "Bearer $env:MEETING_AGENT_TOKEN"; 'Content-Type' = 'application/json' }
$session = Invoke-RestMethod -Uri http://localhost:7799/v1/sessions -Method POST -Body $body -Headers $h
$sid = $session.session.id
Invoke-RestMethod -Uri "http://localhost:7799/v1/sessions/$sid/start" -Method POST -Headers $h
$say = @{ text='Hello, this is your AI assistant.'; disclosureAnnounced=$true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:7799/v1/sessions/$sid/say" -Method POST -Body $say -Headers $h
```

Expected: `audioBytes > 0`, `injection.ok` true. The pulse sink should
have audio queued — confirm with `docker compose exec desktop-agent pactl list sink-inputs`.

## 4. Verify the inbound transcript route

With the session above already `started` and capture engaged (the `start`
response should include `capture.ok=true`), speak into the agent's
microphone source for 2–3 seconds, then:

```powershell
Invoke-RestMethod -Uri "http://localhost:7799/v1/sessions/$sid/transcript" -Headers $h
```

Expect at least one entry with `source: "participant"` and `text` matching
what you spoke.

## 5. Join a real Meet

```powershell
docker compose exec desktop-agent node /app/meet-join.mjs `
  "https://meet.google.com/<your-test-code>" `
  --name "AgentFarm Agent" --timeout 120000
```

Watch the desktop via noVNC at <http://localhost:6080>:

1. Chromium opens with the Meet pre-join screen (fake green-screen camera + "Fake Default" mic/speaker).
2. The "Sign in with your Google account / Got it" tooltip is dismissed automatically.
3. Display name "AgentFarm Agent" is filled in the name input.
4. "Ask to join" (enabled) is clicked — script waits until the button is not disabled before clicking.
5. The script exits 0 once either the in-meeting toolbar or the "Asking to be let in" lobby copy appears.

**Important navigation note**: `meet-join.mjs` uses `waitUntil: 'commit'` for the initial navigation
(not `domcontentloaded`) because Meet's SPA defers DOMContentLoaded for >120s on a fresh profile.
The script then waits for the name input or join button element to appear before proceeding.

Then accept the agent from the host side and exercise `/say` again —
audio should reach the meeting; STT from the sidecar should land in
`/transcript` as participant lines.

> **Tested**: 2026-05-21 — meet URL `zbj-emfq-vvf`, exit 0, displayed as "AgentFarm Agent" in lobby.

## Cleanup

```powershell
Invoke-RestMethod -Uri "http://localhost:7799/v1/sessions/$sid/stop" -Method POST -Headers $h
docker compose down
```
