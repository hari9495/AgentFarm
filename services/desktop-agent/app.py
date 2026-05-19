"""
desktop-agent/app.py — Full desktop VM agent with LLM vision loop.

Architecture:
  - Xvfb provides a virtual X display (:1)
  - x11vnc streams it over VNC; noVNC/websockify exposes it as a WebSocket
  - This Flask API manages sessions and drives the vision loop:
      screenshot → LLM decides next action → xdotool executes → repeat
  - Playwright join mode: uses DOM selectors to join meetings without vision AI,
      enabling meeting participation with any text-only LLM (e.g. Ollama).
"""

import base64
import json
import logging
import os
import struct
import subprocess
import tempfile
import threading
import time
import uuid
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DISPLAY = os.environ.get("DISPLAY", ":1")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "anthropic")  # "anthropic" | "openai"
MAX_VISION_STEPS = int(os.environ.get("MAX_VISION_STEPS", "20"))
VISION_LOOP_TIMEOUT = int(os.environ.get("VISION_LOOP_TIMEOUT", "300"))  # seconds
NOVNC_PORT = int(os.environ.get("NOVNC_PORT", "6080"))
APP_PORT = int(os.environ.get("APP_PORT", "5003"))

# ---------------------------------------------------------------------------
# In-memory session store (replaced by DB in a future sprint)
# ---------------------------------------------------------------------------

_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------

def _screenshot() -> str | None:
    """Take a screenshot of the virtual display; return base64-encoded PNG."""
    try:
        result = subprocess.run(
            ["scrot", "--silent", "-"],
            capture_output=True,
            timeout=10,
            env={**os.environ, "DISPLAY": DISPLAY},
        )
        if result.returncode != 0 or not result.stdout:
            return None
        return base64.b64encode(result.stdout).decode("utf-8")
    except Exception as exc:
        logger.warning("screenshot failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Action execution
# ---------------------------------------------------------------------------

def _execute_action(action: dict[str, Any]) -> dict[str, Any]:
    """Execute a single desktop action via xdotool."""
    act = action.get("action", "")
    target = action.get("target", "")
    value = action.get("value", "")
    t0 = time.monotonic()
    env = {**os.environ, "DISPLAY": DISPLAY}

    try:
        if act == "click":
            parts = str(target).split(",")
            if len(parts) == 2:
                x, y = parts[0].strip(), parts[1].strip()
                subprocess.run(
                    ["xdotool", "mousemove", x, y, "click", "1"],
                    env=env, timeout=5, check=True,
                )
            else:
                return {"ok": False, "errorMessage": f"click target must be 'x,y', got: {target!r}", "durationMs": 0}

        elif act == "type":
            subprocess.run(
                ["xdotool", "type", "--clearmodifiers", "--", str(value or target)],
                env=env, timeout=10, check=True,
            )

        elif act == "key":
            subprocess.run(
                ["xdotool", "key", "--clearmodifiers", str(target)],
                env=env, timeout=5, check=True,
            )

        elif act == "scroll":
            parts = str(target).split(",")
            if len(parts) >= 2:
                x, y = parts[0].strip(), parts[1].strip()
                button = "5" if str(value).lower() != "up" else "4"
                subprocess.run(
                    ["xdotool", "mousemove", x, y, "click", button],
                    env=env, timeout=5, check=True,
                )

        elif act == "open_app":
            subprocess.Popen(str(target).split(), env=env)
            time.sleep(2)

        elif act == "done":
            pass  # terminal — no xdotool call needed

        else:
            return {"ok": False, "errorMessage": f"unknown action: {act!r}", "durationMs": 0}

        return {"ok": True, "durationMs": int((time.monotonic() - t0) * 1000)}

    except subprocess.TimeoutExpired:
        return {"ok": False, "errorMessage": "action timed out", "durationMs": int((time.monotonic() - t0) * 1000)}
    except subprocess.CalledProcessError as exc:
        return {"ok": False, "errorMessage": f"xdotool error: {exc}", "durationMs": int((time.monotonic() - t0) * 1000)}
    except Exception as exc:
        return {"ok": False, "errorMessage": str(exc), "durationMs": int((time.monotonic() - t0) * 1000)}


# ---------------------------------------------------------------------------
# LLM vision decision
# ---------------------------------------------------------------------------

_ACTION_SCHEMA = (
    '{"action":"click"|"type"|"key"|"scroll"|"open_app"|"done",'
    '"target":"x,y coords | app name | key name","value":"text or scroll direction"}'
)

_FORM_FILLING_RULES = """
Form filling rules (MUST follow):
1. Click the FIRST input field (the topmost white/light text box, not the label).
   Click IN the text box — at the right side of the label, inside the white box.
2. Use {"action":"key","target":"ctrl+a"} then {"action":"key","target":"Delete"} to clear any existing text.
3. {"action":"type","value":"<text to type>"} to type the value.
4. {"action":"key","target":"Tab"} to advance to the NEXT field — do NOT click the next field.
5. Repeat steps 2-4 for each subsequent field in order.
6. For dropdown/combobox fields: press Tab to reach it, then use {"action":"key","target":"alt+Down"} to open it, then arrow keys to select, then Return to confirm.
7. After the last field, Tab to the Submit button and press Return, OR click the Submit button.
Always prefer Tab-key navigation over clicking individual fields once you are inside the form.
"""

def _llm_decide(screenshot_b64: str, goal: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ask the configured LLM what to do next given the current screenshot."""
    recent_actions = history[-6:]
    history_note = ""
    if recent_actions:
        history_note = "\nRecent actions taken (do NOT repeat the same action more than twice):\n"
        for h in recent_actions:
            history_note += f"  step {h.get('step')}: {h.get('action')} target={h.get('target')!r} value={h.get('value')!r} ok={h.get('ok')}\n"

    prompt = (
        f"You are a desktop automation agent controlling a real screen via xdotool.\n"
        f"Goal: {goal}\n"
        f"{_FORM_FILLING_RULES}"
        f"{history_note}\n"
        "Analyze the screenshot carefully. Return exactly 1-3 JSON actions to advance toward the goal.\n"
        f"Schema per action: {_ACTION_SCHEMA}\n"
        "For coordinates: the screenshot is 1280x800. Measure x,y precisely from the image.\n"
        "Use 'done' with value=<result summary> ONLY when the goal is fully and visibly complete.\n"
        "Return ONLY a valid JSON array — no markdown, no explanation, no extra text."
    )

    try:
        raw = _call_llm(screenshot_b64, prompt)
        # Strip potential markdown fences
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1]) if len(lines) > 2 else ""
        actions = json.loads(raw)
        if not isinstance(actions, list):
            return [{"action": "done", "value": str(actions)}]
        return actions[:3]  # type: ignore[return-value]
    except Exception as exc:
        logger.warning("LLM decision failed: %s", exc)
        return [{"action": "done", "value": f"LLM error: {exc}"}]


def _call_llm(screenshot_b64: str, prompt: str) -> str:
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        return _call_openai(screenshot_b64, prompt)
    if ANTHROPIC_API_KEY:
        return _call_anthropic(screenshot_b64, prompt)
    return '[{"action":"done","value":"No LLM configured"}]'


def _call_openai(screenshot_b64: str, prompt: str) -> str:
    import openai  # type: ignore
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return response.choices[0].message.content or "[]"


def _call_anthropic(screenshot_b64: str, prompt: str) -> str:
    import anthropic  # type: ignore
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": screenshot_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )
    first = response.content[0]
    return getattr(first, "text", "").strip() or "[]"  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# Vision loop (runs in background thread)
# ---------------------------------------------------------------------------

def _run_vision_loop(session_id: str, goal: str) -> None:
    with _sessions_lock:
        session = _sessions.get(session_id)
    if session is None:
        return

    task = session["current_task"]
    task["status"] = "running"
    deadline = time.monotonic() + VISION_LOOP_TIMEOUT

    for step_num in range(MAX_VISION_STEPS):
        if time.monotonic() > deadline:
            task["status"] = "timeout"
            task["result"] = "Task timed out"
            break

        screenshot_b64 = _screenshot()
        if screenshot_b64 is None:
            task["steps"].append({
                "step": step_num,
                "action": "screenshot",
                "ok": False,
                "errorMessage": "Screenshot failed — display may not be ready",
                "timestamp": _now(),
            })
            time.sleep(1)
            continue

        task["last_screenshot"] = screenshot_b64

        actions = _llm_decide(screenshot_b64, goal, task["steps"])

        done = False
        for act in actions:
            act_name = act.get("action", "")
            result = _execute_action(act)
            task["steps"].append({
                "step": step_num,
                "action": act_name,
                "target": act.get("target", ""),
                "value": act.get("value", ""),
                **result,
                "timestamp": _now(),
            })
            if act_name == "done":
                task["status"] = "completed"
                task["result"] = act.get("value") or "Task completed"
                done = True
                break
            time.sleep(0.4)

        if done:
            break
        time.sleep(1)
    else:
        if task["status"] == "running":
            task["status"] = "completed"
            task["result"] = "Max steps reached"

    with _sessions_lock:
        if session_id in _sessions:
            _sessions[session_id]["status"] = "idle"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "desktop-agent"})


@app.route("/v1/sessions", methods=["POST"])
def create_session():
    session_id = str(uuid.uuid4())
    with _sessions_lock:
        _sessions[session_id] = {
            "sessionId": session_id,
            "status": "idle",
            "createdAt": _now(),
            "current_task": None,
        }
    return jsonify({
        "sessionId": session_id,
        "status": "idle",
        "streamUrl": f"http://localhost:{NOVNC_PORT}/vnc.html",
        "createdAt": _sessions[session_id]["createdAt"],
    }), 201


@app.route("/v1/sessions/<session_id>", methods=["GET"])
def get_session(session_id: str):
    with _sessions_lock:
        s = _sessions.get(session_id)
    if s is None:
        return jsonify({"error": "session not found"}), 404
    task = s.get("current_task")
    return jsonify({
        "sessionId": session_id,
        "status": s["status"],
        "createdAt": s["createdAt"],
        "task": {
            "taskId": task["taskId"],
            "status": task["status"],
            "result": task.get("result"),
            "stepCount": len(task.get("steps", [])),
        } if task else None,
    })


@app.route("/v1/sessions/<session_id>", methods=["DELETE"])
def delete_session(session_id: str):
    with _sessions_lock:
        if session_id not in _sessions:
            return jsonify({"error": "session not found"}), 404
        del _sessions[session_id]
    return jsonify({"deleted": True})


@app.route("/v1/sessions/<session_id>/task", methods=["POST"])
def submit_task(session_id: str):
    with _sessions_lock:
        s = _sessions.get(session_id)
    if s is None:
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    goal = body.get("goal", "")
    if not isinstance(goal, str) or not goal.strip():
        return jsonify({"error": "'goal' is required"}), 400

    task_id = str(uuid.uuid4())
    task: dict[str, Any] = {
        "taskId": task_id,
        "goal": goal.strip(),
        "status": "queued",
        "steps": [],
        "result": None,
        "last_screenshot": None,
        "startedAt": _now(),
    }
    with _sessions_lock:
        _sessions[session_id]["current_task"] = task
        _sessions[session_id]["status"] = "busy"

    t = threading.Thread(target=_run_vision_loop, args=(session_id, goal.strip()), daemon=True)
    t.start()

    return jsonify({
        "taskId": task_id,
        "sessionId": session_id,
        "status": "queued",
        "startedAt": task["startedAt"],
    }), 202


@app.route("/v1/sessions/<session_id>/task", methods=["GET"])
def get_task(session_id: str):
    with _sessions_lock:
        s = _sessions.get(session_id)
    if s is None:
        return jsonify({"error": "session not found"}), 404
    task = s.get("current_task")
    if task is None:
        return jsonify({"error": "no task for this session"}), 404

    return jsonify({
        "taskId": task["taskId"],
        "sessionId": session_id,
        "goal": task["goal"],
        "status": task["status"],
        "result": task.get("result"),
        "stepCount": len(task.get("steps", [])),
        "steps": task.get("steps", [])[-10:],  # last 10 steps only
        "startedAt": task["startedAt"],
    })


# ---------------------------------------------------------------------------
# Avatar state management
# ---------------------------------------------------------------------------

# Global to track the current avatar loop process so we can swap it on state change.
_avatar_lock = threading.Lock()
_avatar_proc: subprocess.Popen[bytes] | None = None  # cat-loop child writing to /tmp/avatar.fifo


def _start_avatar_loop(state: str = "idle") -> None:
    """Restart the avatar FIFO loop with the given state file (idle | talking)."""
    global _avatar_proc
    source_file = "/app/avatar-talking.y4m" if state == "talking" else "/app/avatar-idle.y4m"
    with _avatar_lock:
        if _avatar_proc is not None:
            try:
                _avatar_proc.terminate()
                _avatar_proc.wait(timeout=3)
            except Exception:
                pass
            _avatar_proc = None
        # Start a new infinite loop piping the y4m file to the FIFO.
        # We run it via bash so `while true` gives us the looping behaviour.
        _avatar_proc = subprocess.Popen(
            ["bash", "-c", f"while true; do cat {source_file} > /tmp/avatar.fifo 2>/dev/null || sleep 0.1; done"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        logger.info("avatar loop started: state=%s pid=%s", state, _avatar_proc.pid)


# ---------------------------------------------------------------------------
# Meeting join helpers (vision-loop driven)
# ---------------------------------------------------------------------------

_PLATFORM_GOALS = {
    "teams": (
        "Open Chromium and navigate to https://teams.microsoft.com. "
        "Sign in with the agent credentials if prompted. "
        "Find the Chat section and look for a meeting call or join link. "
        "Click 'Join now' on the pre-join screen. Ensure camera and microphone are enabled. "
        "Return done when successfully in the call."
    ),
    "slack": (
        "Open Chromium and navigate to the Slack workspace. "
        "Find the direct message or channel specified. "
        "Click the headphones icon or 'Start a huddle' button to join the huddle. "
        "Return done when the huddle audio is active."
    ),
    "zoom": (
        "Open Chromium and navigate to the Zoom meeting URL provided. "
        "Click 'Join from browser' if offered. "
        "Click 'Join Audio by Computer' and 'Start Video' when the pre-join screen appears. "
        "Click 'Join'. Return done when in the meeting."
    ),
    "google_meet": (
        "Open Chromium and navigate to the Google Meet URL provided. "
        "Click 'Join now' on the pre-join screen. Ensure microphone and camera are enabled. "
        "Return done when successfully in the call."
    ),
}

_MEETING_CHROMIUM_FLAGS = (
    "--use-fake-ui-for-media-stream "
    "--use-file-for-fake-video-capture=/tmp/avatar.fifo "
    "--autoplay-policy=no-user-gesture-required "
    "--no-sandbox "
    "--disable-dev-shm-usage"
)


def _join_meeting_goal(platform: str, meeting_url: str | None) -> str:
    base_goal = _PLATFORM_GOALS.get(platform.lower(), "")
    if not base_goal:
        base_goal = (
            f"Open Chromium and navigate to the meeting URL: {meeting_url}. "
            "Join the call when the interface appears. Return done when in the call."
        )
    if meeting_url:
        base_goal = f"Navigate to {meeting_url}. " + base_goal
    return base_goal


# ---------------------------------------------------------------------------
# Meeting / audio / avatar routes
# ---------------------------------------------------------------------------

@app.route("/v1/sessions/<session_id>/join-meeting", methods=["POST"])
def join_meeting(session_id: str):
    with _sessions_lock:
        s = _sessions.get(session_id)
    if s is None:
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    meeting_url: str | None = body.get("meetingUrl") or body.get("meeting_url") or body.get("url")
    platform: str = str(body.get("platform", "google_meet")).lower()
    # mode="playwright" uses Playwright DOM selectors + Ollama — no vision LLM needed.
    # mode="vision" uses the xdotool/LLM vision loop (requires GPT-4o/Claude).
    mode: str = str(body.get("mode", "playwright")).lower()

    task_id = str(uuid.uuid4())
    task: dict[str, Any] = {
        "taskId": task_id,
        "goal": f"Join {platform} meeting at {meeting_url}",
        "status": "queued",
        "steps": [],
        "result": None,
        "last_screenshot": None,
        "startedAt": _now(),
    }
    with _sessions_lock:
        _sessions[session_id]["current_task"] = task
        _sessions[session_id]["status"] = "busy"

    if mode == "playwright":
        # Playwright path: DOM-driven join + Ollama conversation loop
        t = threading.Thread(
            target=_playwright_join_and_converse,
            args=(session_id, meeting_url or "about:blank"),
            daemon=True,
        )
        t.start()
    else:
        # Vision-loop path (requires GPT-4o or Claude)
        goal = _join_meeting_goal(platform, meeting_url)
        _pulse_rt = os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse-runtime")
        env = {
            **os.environ,
            "DISPLAY": DISPLAY,
            "PULSE_RUNTIME_PATH": _pulse_rt,
            "PULSE_SERVER": f"unix:{_pulse_rt}/native",
            "XDG_RUNTIME_DIR": "/run/user/0",
            "PULSE_SINK": "chrome-output-sink",
        }
        subprocess.Popen(
            ["chromium-browser"] + _MEETING_CHROMIUM_FLAGS.split() + [meeting_url or "about:blank"],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        time.sleep(3)
        _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse-runtime")}
        for _ in range(5):
            try:
                result = subprocess.run(
                    ["pactl", "list", "sink-inputs", "short"],
                    capture_output=True, text=True, timeout=5, env=_pulse_env,
                )
                for line in result.stdout.splitlines():
                    parts = line.split()
                    if parts:
                        sid_input = parts[0]
                        subprocess.run(
                            ["pactl", "move-sink-input", sid_input, "chrome-output-sink"],
                            capture_output=True, timeout=5, env=_pulse_env,
                        )
            except Exception:
                pass
            time.sleep(1)
        _start_avatar_loop("idle")
        task["goal"] = goal
        t = threading.Thread(target=_run_vision_loop, args=(session_id, goal), daemon=True)
        t.start()

    return jsonify({
        "taskId": task_id,
        "sessionId": session_id,
        "platform": platform,
        "mode": mode,
        "status": "joining",
        "startedAt": task["startedAt"],
    }), 202


@app.route("/v1/sessions/<session_id>/speak", methods=["POST"])
def speak_audio(session_id: str):
    """Play base64-encoded WAV/MP3 audio through the virtual PulseAudio sink.
    Meeting participants hear the agent speak because Chromium uses virtual-source
    (which is a loopback from virtual-sink.monitor) as its microphone.
    """
    with _sessions_lock:
        if session_id not in _sessions:
            return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    audio_b64: str | None = body.get("audioBase64")
    if not audio_b64:
        return jsonify({"error": "'audioBase64' is required"}), 400

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        return jsonify({"error": "invalid base64 in audioBase64"}), 400

    # Switch avatar to talking state while audio plays.
    _start_avatar_loop("talking")

    t0 = time.monotonic()
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # paplay routes audio to the default PulseAudio sink (virtual-sink).
        # PULSE_RUNTIME_PATH must be set so paplay can find the daemon socket.
        _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse-runtime")}
        result = subprocess.run(
            ["paplay", "--device=virtual-sink", tmp_path],
            timeout=60,
            capture_output=True,
            env=_pulse_env,
        )
        duration_ms = int((time.monotonic() - t0) * 1000)

        if result.returncode != 0:
            _start_avatar_loop("idle")
            return jsonify({
                "ok": False,
                "durationMs": duration_ms,
                "error": result.stderr.decode(errors="replace").strip(),
            }), 500

    except subprocess.TimeoutExpired:
        _start_avatar_loop("idle")
        return jsonify({"ok": False, "durationMs": 60000, "error": "paplay timed out"}), 500
    except Exception as exc:
        _start_avatar_loop("idle")
        return jsonify({"ok": False, "durationMs": 0, "error": str(exc)}), 500
    finally:
        try:
            if tmp_path:
                os.unlink(tmp_path)
        except Exception:
            pass

    # Return avatar to idle once speaking is done.
    _start_avatar_loop("idle")

    return jsonify({"ok": True, "durationMs": duration_ms})


@app.route("/v1/sessions/<session_id>/capture-audio", methods=["POST"])
def capture_audio(session_id: str):
    """Record audio from the virtual PulseAudio sink monitor for N seconds.
    Returns raw PCM encoded as base64 WAV (16kHz mono s16le) — ready for
    Voicebox transcription.

    Voice activity detection: computes the RMS of the captured samples.  If
    the audio is below ``vadThreshold`` (default 250 on a 32768 s16 scale),
    the response sets ``silent=true`` and ``audioBase64=""`` so the runtime
    can skip ASR+LLM calls instead of paying for empty audio.
    """
    with _sessions_lock:
        if session_id not in _sessions:
            return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    duration_seconds = int(body.get("durationSeconds", 10))
    duration_seconds = max(1, min(duration_seconds, 120))  # clamp 1-120 s
    vad_threshold = int(body.get("vadThreshold", 250))
    vad_threshold = max(0, min(vad_threshold, 32767))

    t0 = time.monotonic()
    try:
        # parec records from chrome-output-sink.monitor — that is Chrome's speaker output,
        # which contains what meeting participants are saying (not the agent's own paplay).
        # virtual-sink.monitor would only capture the agent's own TTS audio.
        parec_cmd = [
            "parec",
            "--device=chrome-output-sink.monitor",
            "--format=s16le",
            "--rate=16000",
            "--channels=1",
        ]
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", "pipe:0",
            "-f", "wav", "pipe:1",
        ]

        _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse-runtime")}
        parec_proc = subprocess.Popen(parec_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=_pulse_env)
        ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=parec_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )

        time.sleep(duration_seconds)
        parec_proc.terminate()
        wav_bytes, _ = ffmpeg_proc.communicate(timeout=10)

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    duration_ms = int((time.monotonic() - t0) * 1000)

    rms = _compute_wav_rms(wav_bytes)
    silent = rms < vad_threshold

    return jsonify({
        "ok": True,
        "durationMs": duration_ms,
        "audioBase64": "" if silent else base64.b64encode(wav_bytes).decode("utf-8"),
        "format": "wav",
        "sampleRate": 16000,
        "rms": rms,
        "vadThreshold": vad_threshold,
        "silent": silent,
    })


def _compute_wav_rms(wav_bytes: bytes) -> int:
    """Compute the root-mean-square amplitude of 16-bit mono PCM WAV bytes.

    Returns 0 for empty or malformed input — safe for VAD fallback.  Skips
    the 44-byte standard RIFF/WAVE header before reading samples.
    """
    if not wav_bytes or len(wav_bytes) <= 44:
        return 0
    data = wav_bytes[44:]
    sample_count = len(data) // 2
    if sample_count == 0:
        return 0
    # Unpack as signed 16-bit little-endian.  Using struct + a running sum
    # keeps the dependency surface small (no numpy / audioop required).
    samples = struct.unpack(f"<{sample_count}h", data[: sample_count * 2])
    squared_sum = 0
    for s in samples:
        squared_sum += s * s
    return int((squared_sum / sample_count) ** 0.5)


@app.route("/v1/sessions/<session_id>/set-avatar-state", methods=["POST"])
def set_avatar_state(session_id: str):
    """Switch the virtual camera avatar between 'idle' and 'talking' states."""
    with _sessions_lock:
        if session_id not in _sessions:
            return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    state = str(body.get("state", "idle")).lower()
    if state not in ("idle", "talking"):
        return jsonify({"error": "'state' must be 'idle' or 'talking'"}), 400

    _start_avatar_loop(state)
    return jsonify({"ok": True, "state": state})


# ---------------------------------------------------------------------------
# Ollama text-only LLM (for conversation loop when no vision LLM is set)
# ---------------------------------------------------------------------------

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.environ.get("LLM_MODEL", "llama3.2:1b")
VOICEBOX_URL = os.environ.get("VOICEBOX_URL", "http://localhost:17493")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
# Default voice: "Adam" (pNInz6obpgDQGcFmaJgB).  Override with ELEVENLABS_VOICE_ID env var.
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "vzov6y10x6nsGNFg883S")
# OpenAI TTS voice: alloy | echo | fable | onyx | nova | shimmer
OPENAI_TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "onyx")
# Sarvam AI TTS — best quality for Indian languages (hi/te/ta/kn/ml/bn/mr/gu/pa)
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
# Sarvam speaker: meera | pavithra | arvind | amol | neel | diya | arjun | maya
SARVAM_SPEAKER = os.environ.get("SARVAM_SPEAKER", "arvind")
# Chat model used for conversation replies (OpenAI path)
CHAT_MODEL = os.environ.get("CHAT_MODEL", "gpt-4o-mini")


def _chat_openai(messages: list[dict[str, Any]]) -> str:
    """Send a chat request to OpenAI; return the reply text."""
    import urllib.request as _ur
    _payload = json.dumps({"model": CHAT_MODEL, "messages": messages}).encode()
    _req = _ur.Request(
        "https://api.openai.com/v1/chat/completions",
        data=_payload,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with _ur.urlopen(_req, timeout=30) as _resp:
            _data = json.loads(_resp.read())
        return _data["choices"][0]["message"]["content"]
    except Exception as _exc:
        logger.warning("[chat] OpenAI failed (%s), falling back to Ollama", _exc)
        return _chat_ollama(messages)


def _chat_ollama(messages: list[dict[str, Any]]) -> str:
    """Send a chat request to the local Ollama instance; return the reply text."""
    import urllib.request
    payload = json.dumps({"model": OLLAMA_MODEL, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.warning("Ollama chat failed: %s", exc)
        return ""


# Maps Whisper/BCP-47 language codes → a natural-sounding edge-tts neural voice.
# Add more entries as needed: https://learn.microsoft.com/azure/ai-services/speech-service/language-support
_LANG_TO_VOICE: dict[str, str] = {
    "en": "en-US-GuyNeural",
    "hi": "hi-IN-MadhurNeural",
    "te": "te-IN-MohanNeural",
    "ta": "ta-IN-ValluvarNeural",
    "kn": "kn-IN-GaganNeural",
    "ml": "ml-IN-MidhunNeural",
    "mr": "mr-IN-ManoharNeural",
    "gu": "gu-IN-NiranjanNeural",
    "bn": "bn-IN-BashkarNeural",
    "ur": "ur-PK-AsadNeural",
    "fr": "fr-FR-HenriNeural",
    "de": "de-DE-ConradNeural",
    "es": "es-ES-AlvaroNeural",
    "pt": "pt-BR-AntonioNeural",
    "zh": "zh-CN-YunxiNeural",
    "ja": "ja-JP-KeitaNeural",
    "ko": "ko-KR-InJoonNeural",
    "ar": "ar-SA-HamedNeural",
    "ru": "ru-RU-DmitryNeural",
    "it": "it-IT-DiegoNeural",
    "nl": "nl-NL-MaartenNeural",
    "pl": "pl-PL-MarekNeural",
    "tr": "tr-TR-AhmetNeural",
    "sv": "sv-SE-MattiasNeural",
    "vi": "vi-VN-NamMinhNeural",
    "id": "id-ID-ArdiNeural",
}


def _voice_for_lang(lang_code: str) -> str:
    """Return the best edge-tts voice for a language code."""
    return _LANG_TO_VOICE.get(lang_code, "en-US-GuyNeural")


def _lang_from_text(text: str) -> str:
    """Detect language from text via Unicode script ranges.
    Far more reliable than Whisper audio-based detection for Indian languages.
    Falls back to 'en' for Latin-script text.
    """
    for ch in text:
        cp = ord(ch)
        if 0x0900 <= cp <= 0x097F: return "hi"   # Devanagari  (Hindi / Marathi)
        if 0x0C00 <= cp <= 0x0C7F: return "te"   # Telugu
        if 0x0B80 <= cp <= 0x0BFF: return "ta"   # Tamil
        if 0x0C80 <= cp <= 0x0CFF: return "kn"   # Kannada
        if 0x0D00 <= cp <= 0x0D7F: return "ml"   # Malayalam
        if 0x0980 <= cp <= 0x09FF: return "bn"   # Bengali
        if 0x0A00 <= cp <= 0x0A7F: return "pa"   # Punjabi / Gurmukhi
        if 0x0A80 <= cp <= 0x0AFF: return "gu"   # Gujarati
        if 0x0B00 <= cp <= 0x0B7F: return "mr"   # Odia / Marathi (Devanagari fallback)
        if 0x4E00 <= cp <= 0x9FFF: return "zh"   # CJK Chinese
        if 0x3040 <= cp <= 0x30FF: return "ja"   # Japanese
        if 0xAC00 <= cp <= 0xD7AF: return "ko"   # Korean
        if 0x0600 <= cp <= 0x06FF: return "ar"   # Arabic / Urdu
        if 0x0400 <= cp <= 0x04FF: return "ru"   # Cyrillic
    return "en"  # Default: Latin-script languages


# Whisper lang codes that Sarvam AI natively supports (bulbul:v1)
# English excluded — OpenAI/ElevenLabs handle it better
_SARVAM_LANG_MAP: dict[str, str] = {
    "hi": "hi-IN", "te": "te-IN", "ta": "ta-IN", "kn": "kn-IN",
    "ml": "ml-IN", "bn": "bn-IN", "mr": "mr-IN", "gu": "gu-IN",
    "pa": "pa-IN",
}


def _voicebox_tts(text: str, voice_id: str = "en-US-GuyNeural", lang: str = "en") -> bytes | None:
    """Convert text to speech.
    Priority:
      Indian lang + SARVAM_API_KEY  → Sarvam AI  (best Indian quality, ~200ms)
      ELEVENLABS_API_KEY             → ElevenLabs Flash v2.5 (~75ms, fastest)
      OPENAI_API_KEY                 → OpenAI tts-1 (~400ms, reliable)
      edge-tts                       → free fallback
      espeak-ng                      → last resort
    Returns WAV bytes or None on failure.
    """
    import asyncio, tempfile, io, base64

    # ── Sarvam AI (Indian languages — best quality) ────────────────────────
    _sarvam_code = _SARVAM_LANG_MAP.get(lang)
    if SARVAM_API_KEY and _sarvam_code:
        try:
            import urllib.request as _ur, json as _js
            # Sarvam has a 500-char input limit; truncate to avoid 400 errors
            _sarvam_text = text[:500]
            _payload = _js.dumps({
                "inputs": [_sarvam_text],
                "target_language_code": _sarvam_code,
                "speaker": SARVAM_SPEAKER,
                "model": "bulbul:v1",
                "speech_sample_rate": 22050,
                "enable_preprocessing": True,
            }).encode()
            _req = _ur.Request(
                "https://api.sarvam.ai/text-to-speech",
                data=_payload,
                headers={"API-Subscription-Key": SARVAM_API_KEY, "Content-Type": "application/json"},
                method="POST",
            )
            with _ur.urlopen(_req, timeout=10) as _resp:
                _body = _js.loads(_resp.read())
            _b64 = (_body.get("audios") or [None])[0] or _body.get("audio", "")
            if _b64:
                _wav = base64.b64decode(_b64)
                logger.info("[tts] Sarvam ok (%s), %d bytes", _sarvam_code, len(_wav))
                return _wav
        except Exception as _exc:
            import urllib.error as _ue
            if isinstance(_exc, _ue.HTTPError):
                try:
                    _err_body = _exc.read().decode(errors="replace")
                    logger.warning("[tts] Sarvam failed (%s) body=%s, trying next", _exc, _err_body[:200])
                except Exception:
                    pass
            else:
                logger.warning("[tts] Sarvam failed (%s), trying next", _exc)

    # ── ElevenLabs Flash (fastest for non-Indian / fallback) ──────────────
    if ELEVENLABS_API_KEY:
        try:
            import urllib.request as _ur, json as _js
            _payload = _js.dumps({
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            }).encode()
            _req = _ur.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                data=_payload,
                headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                method="POST",
            )
            with _ur.urlopen(_req, timeout=10) as _resp:
                _mp3 = _resp.read()
            if _mp3:
                _proc = subprocess.run(
                    ["ffmpeg", "-y", "-i", "pipe:0", "-f", "wav", "pipe:1"],
                    input=_mp3, capture_output=True, timeout=20,
                )
                if _proc.returncode == 0:
                    logger.info("[tts] ElevenLabs ok, %d bytes", len(_proc.stdout))
                    return _proc.stdout
        except Exception as _exc:
            logger.warning("[tts] ElevenLabs failed (%s), trying OpenAI", _exc)

    # ── OpenAI tts-1 (reliable fallback) ──────────────────────────────────
    if OPENAI_API_KEY:
        try:
            import urllib.request as _ur, json as _js
            _payload = _js.dumps({
                "model": "tts-1",
                "input": text,
                "voice": OPENAI_TTS_VOICE,
                "response_format": "mp3",
            }).encode()
            _req = _ur.Request(
                "https://api.openai.com/v1/audio/speech",
                data=_payload,
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                method="POST",
            )
            with _ur.urlopen(_req, timeout=15) as _resp:
                _mp3 = _resp.read()
            if _mp3:
                _proc = subprocess.run(
                    ["ffmpeg", "-y", "-i", "pipe:0", "-f", "wav", "pipe:1"],
                    input=_mp3, capture_output=True, timeout=30,
                )
                if _proc.returncode == 0:
                    logger.info("[tts] OpenAI ok, %d bytes", len(_proc.stdout))
                    return _proc.stdout
        except Exception as _exc:
            logger.warning("[tts] OpenAI TTS failed (%s), trying edge-tts", _exc)
        try:
            import urllib.request as _ur, json as _js
            _payload = _js.dumps({
                "text": text,
                "model_id": "eleven_flash_v2_5",   # lowest latency; multilingual
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            }).encode()
            _req = _ur.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                data=_payload,
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                method="POST",
            )
            with _ur.urlopen(_req, timeout=15) as _resp:
                _mp3 = _resp.read()
            if _mp3:
                _proc = subprocess.run(
                    ["ffmpeg", "-y", "-i", "pipe:0", "-f", "wav", "pipe:1"],
                    input=_mp3, capture_output=True, timeout=30,
                )
                if _proc.returncode == 0:
                    logger.debug("[tts] ElevenLabs ok, %d bytes", len(_proc.stdout))
                    return _proc.stdout
        except Exception as _exc:
            logger.warning("[tts] ElevenLabs failed (%s), falling back to edge-tts", _exc)

    # ── edge-tts (fallback) ────────────────────────────────────────────────
    try:
        import edge_tts  # type: ignore

        import concurrent.futures as _cf

        async def _synth() -> bytes:
            communicate = edge_tts.Communicate(text, voice_id)
            buf = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio" and "data" in chunk:
                    buf.write(chunk["data"])
            return buf.getvalue()

        # Run in a worker thread that has no existing event loop
        with _cf.ThreadPoolExecutor(max_workers=1) as _ex:
            mp3_bytes = _ex.submit(asyncio.run, _synth()).result(timeout=30)
        if mp3_bytes:
            # convert MP3→WAV via ffmpeg
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", "pipe:0", "-f", "wav", "pipe:1"],
                input=mp3_bytes, capture_output=True, timeout=30,
            )
            if proc.returncode == 0:
                return proc.stdout
    except Exception as exc:
        logger.warning("edge-tts failed (%s), trying espeak-ng fallback", exc)

    # ── espeak-ng (fallback) ───────────────────────────────────────────────
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        subprocess.run(
            ["espeak-ng", "-w", tmp_path, text],
            capture_output=True, timeout=15, check=True,
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    except Exception as exc:
        logger.warning("espeak-ng TTS failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Playwright meeting join (no vision LLM required)
# ---------------------------------------------------------------------------

def _playwright_join_and_converse(session_id: str, meeting_url: str) -> None:
    """Join Google Meet via Playwright DOM automation and run a voice conversation loop.

    Flow:
      1. Launch Chromium (headed on virtual display) with fake mic/camera flags.
      2. Navigate to the meeting URL and click 'Ask to join' / 'Join now'.
      3. Conversation loop:
           a. Capture 8s of audio from chrome-output-sink (what participants say).
           b. If not silent → transcribe via Voicebox.
           c. Generate text reply via Ollama.
           d. TTS via Voicebox → play WAV to virtual-sink (participants hear agent).
           e. Repeat until session is deleted or max_turns reached.
    """
    from playwright.sync_api import sync_playwright

    _pulse_rt = os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse")
    env_extra = {
        "DISPLAY": DISPLAY,
        "PULSE_RUNTIME_PATH": _pulse_rt,
        "PULSE_SERVER": f"unix:{_pulse_rt}/native",
        "XDG_RUNTIME_DIR": "/tmp/runtime",
        "PULSE_SINK": "chrome-output-sink",
    }

    launch_args = [
        "--use-fake-ui-for-media-stream",
        "--use-file-for-fake-video-capture=/tmp/avatar.fifo",
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
    ]

    with _sessions_lock:
        s = _sessions.get(session_id)
    if s is None:
        return

    logger.info("[playwright-join] launching Chromium for session %s → %s", session_id, meeting_url)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                args=launch_args,
                env={**os.environ, **env_extra},
            )
            ctx = browser.new_context(
                permissions=["camera", "microphone"],
            )
            page = ctx.new_page()
            page.goto(meeting_url, timeout=30_000, wait_until="domcontentloaded")
            logger.info("[playwright-join] page loaded: %s  url: %s", page.title(), page.url)

            # ── Guard: detect Google sign-in redirect ──────────────────────
            # If Meet redirects to accounts.google.com the bot can't sign in.
            # Try navigating back to the meeting URL once (anonymous guest join).
            if "accounts.google.com" in page.url or "/signin" in page.url:
                logger.warning("[playwright-join] redirected to Google sign-in — retrying as guest")
                page.goto(meeting_url, timeout=30_000, wait_until="domcontentloaded")
                time.sleep(2)

            # ── Step 0a: Dismiss interstitial prompts ──────────────────────
            # Handles: "Got it", "Continue without signing in", "Use without an account"
            _dismiss_texts = [
                "Got it",
                "Continue without signing in",
                "Use without an account",
                "Join as a guest",
                "Dismiss",
            ]
            for _try in range(10):
                _dismissed = False
                for _text in _dismiss_texts:
                    try:
                        _btn = page.get_by_role("button", name=_text).first
                        if _btn.is_visible(timeout=400):
                            _btn.click()
                            logger.info("[playwright-join] dismissed prompt: '%s'", _text)
                            time.sleep(0.8)
                            _dismissed = True
                            break
                    except Exception:
                        pass
                    try:
                        _lnk = page.get_by_role("link", name=_text).first
                        if _lnk.is_visible(timeout=300):
                            _lnk.click()
                            logger.info("[playwright-join] clicked link: '%s'", _text)
                            time.sleep(0.8)
                            _dismissed = True
                            break
                    except Exception:
                        pass
                if not _dismissed:
                    break
                time.sleep(0.3)

            # ── Step 0b: Fill in display name (required to enable join btn) ─
            # Google Meet's guest name input attributes vary by version/locale.
            # We try all known selectors plus a generic textbox fallback.
            _agent_name = "AI Agent"
            _name_selectors = [
                "input[autocomplete='name']",          # most reliable across Meet versions
                "input[aria-label=\"What's your name?\"]",
                "input[aria-label='Your name']",
                "input[placeholder='Your name']",
                "input[jsname='YPqjbf']",              # Meet guest-name jsname (pre-join page only)
                "input[aria-label*='name' i][type='text']",
                "input[placeholder*='name' i][type='text']",
                "input[aria-label*='your' i][type='text']",
            ]
            _filled_name = False
            for _try in range(25):
                for _sel in _name_selectors:
                    try:
                        name_inp = page.locator(_sel).first
                        if name_inp.is_visible(timeout=500):
                            name_inp.fill(_agent_name)
                            time.sleep(0.1)
                            if name_inp.input_value() == _agent_name:
                                logger.info("[playwright-join] filled display name via CSS '%s' (try %d)", _sel, _try)
                                _filled_name = True
                                break
                    except Exception:
                        pass
                if not _filled_name:
                    # Fallback: first visible role=textbox on the page
                    try:
                        textboxes = page.get_by_role("textbox").all()
                        for _tb in textboxes:
                            if _tb.is_visible(timeout=300):
                                _tb.fill(_agent_name)
                                time.sleep(0.1)
                                if _tb.input_value() == _agent_name:
                                    logger.info("[playwright-join] filled display name via textbox role (try %d)", _try)
                                    _filled_name = True
                                    break
                    except Exception:
                        pass
                if _filled_name:
                    break
                time.sleep(0.5)
            if not _filled_name:
                logger.warning("[playwright-join] could not fill display name after 25 attempts")

            time.sleep(1.5)  # let Meet re-enable the join button after name is set

            # ── Step 1: Wait for and click the join button ─────────────────
            # Use get_by_role("button") which correctly matches both <button>
            # elements and div[role="button"] that Google Meet uses.
            joined = False
            for attempt in range(30):  # up to ~60 s
                time.sleep(2)
                for btn_name in ["Ask to join", "Join now", "Join"]:
                    try:
                        btn = page.get_by_role("button", name=btn_name).first
                        if btn.is_visible(timeout=500):
                            if btn.is_enabled():
                                btn.click()
                                logger.info("[playwright-join] clicked '%s' (attempt %d)", btn_name, attempt)
                                joined = True
                                break
                            else:
                                logger.debug("[playwright-join] '%s' visible but disabled (attempt %d)", btn_name, attempt)
                    except Exception as _e:
                        logger.debug("[playwright-join] get_by_role '%s' error: %s", btn_name, _e)
                if not joined:
                    # Fallback: jsname selector (works across button/div)
                    for _fsel in ["[jsname='Qx7uuf']", "[data-promo-anchor-id='join-button']"]:
                        try:
                            btn = page.locator(_fsel).first
                            if btn.is_visible(timeout=400) and btn.is_enabled():
                                btn.click()
                                logger.info("[playwright-join] clicked fallback '%s' (attempt %d)", _fsel, attempt)
                                joined = True
                                break
                        except Exception:
                            pass
                if joined:
                    break
                logger.debug("[playwright-join] join btn not found (attempt %d) url=%s", attempt, page.url)

            if not joined:
                logger.warning("[playwright-join] could not find join button after 60 s — url: %s", page.url)
                with _sessions_lock:
                    if session_id in _sessions:
                        t = _sessions[session_id].get("current_task")
                        if t:
                            t["status"] = "completed"
                            t["result"] = "Could not find join button — meeting may require sign-in or host admission"
                        _sessions[session_id]["status"] = "idle"
                return

            # ── Step 2: Wait for host to admit ─────────────────────────────
            logger.info("[playwright-join] waiting for host to admit (if applicable)...")
            for _adm in range(30):  # up to 60 s
                try:
                    if page.locator("text=Waiting to be let in").first.is_visible(timeout=800):
                        logger.debug("[playwright-join] still waiting to be admitted (%d/30)", _adm)
                        time.sleep(2)
                        continue
                except Exception:
                    pass
                break  # either admitted or "waiting" text never appeared
            logger.info("[playwright-join] admitted to meeting (url: %s)", page.url)

            _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": _pulse_rt}

            # ── Step 3: Conversation loop ───────────────────────────────────
            # Greet participants like a human colleague joining late
            _greet_text = (
                "Hey everyone! I just joined. I'm Alex, your AI assistant. "
                "Feel free to talk — I'm here to help!"
            )
            _greet_wav = _voicebox_tts(_greet_text)
            if _greet_wav:
                _start_avatar_loop("talking")
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as _gf:
                    _gf.write(_greet_wav)
                    _gpath = _gf.name
                subprocess.run(
                    ["paplay", "--device=virtual-sink", _gpath],
                    timeout=30, capture_output=True, env=_pulse_env,
                )
                try:
                    os.unlink(_gpath)
                except Exception:
                    pass
                _start_avatar_loop("idle")
                logger.info("[playwright-join] greeted participants")

            _start_avatar_loop("idle")
            history: list[dict[str, Any]] = [
                {"role": "system", "content": (
                    "You are Alex, an AI assistant attending this meeting via voice. "
                    "You CAN hear everything said in this meeting — each message you receive "
                    "is a live transcript of what a participant just said to you. "
                    "NEVER say you cannot hear, that audio is not working, or that you are "
                    "waiting for audio — you are always hearing perfectly. "
                    "If someone asks 'can you hear me?' answer: 'Yes, I can hear you clearly!' "
                    "then continue with a relevant response. "
                    "Respond DIRECTLY to what was just said — reference the specific words, "
                    "question, or topic the person raised. "
                    "Keep every reply to 1–2 sentences. No filler like 'Certainly!' or 'Great question!'. "
                    "ALWAYS reply in the exact same language the speaker used."
                )}
            ]
            _bot_spoke_at: float = 0.0   # timestamp when bot last finished speaking

            # max_turns now counts only speech replies (not silent iterations).
            # Wall-clock deadline governs the overall meeting duration.
            max_turns = int(os.environ.get("MEETING_MAX_TURNS", "200"))  # ~200 replies
            meeting_minutes = int(os.environ.get("MEETING_MAX_MINUTES", "90"))
            _meeting_deadline = time.monotonic() + meeting_minutes * 60

            # Load Whisper model once (not per turn)
            # "small" model (244 MB, int8) has reliable Indian language detection.
            # "base" (74 MB) misidentifies Telugu/Hindi as Finnish/other European langs.
            # Env var WHISPER_MODEL lets ops override (e.g. "medium" for better accuracy).
            _whisper_size = os.environ.get("WHISPER_MODEL", "small")
            _whisper_model = None
            try:
                from faster_whisper import WhisperModel  # type: ignore
                _whisper_model = WhisperModel(_whisper_size, device="cpu", compute_type="int8")
                logger.info("[conv-loop] Whisper %s model loaded", _whisper_size)
            except Exception as _we:
                logger.warning("[conv-loop] Whisper load failed: %s", _we)

            # ── VAD constants ───────────────────────────────────────────────
            _CAPTURE_RATE = 16000
            _CHUNK_SEC = 0.3               # read audio in 0.3-second chunks (faster VAD)
            _MAX_SEC = 8.0                 # never record more than 8 s
            _SILENCE_TAIL_SEC = 0.5        # stop after 0.5 s of silence post-speech
            _SPEECH_RMS = 300              # RMS threshold that counts as speech
            _CHUNK_BYTES = int(_CAPTURE_RATE * _CHUNK_SEC) * 2  # s16le = 2 bytes

            _speech_turn = 0
            while _speech_turn < max_turns:
                if time.monotonic() > _meeting_deadline:
                    logger.info("[conv-loop] meeting time limit reached (%d min)", meeting_minutes)
                    break

                with _sessions_lock:
                    if session_id not in _sessions:
                        break

                # ── Skip capture while bot is still talking (anti-echo) ─────
                # Wait up to 0.8 s for TTS residual audio to clear the sink.
                _echo_gap = 0.8 - (time.time() - _bot_spoke_at)
                if _echo_gap > 0:
                    time.sleep(_echo_gap)

                # ── Adaptive VAD capture: stop when speaker finishes ────────
                parec_proc = subprocess.Popen(
                    ["parec", "--device=chrome-output-sink.monitor",
                     "--format=s16le", f"--rate={_CAPTURE_RATE}", "--channels=1"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=_pulse_env,
                )
                _raw_parts: list[bytes] = []
                _speech_seen = False
                _silence_secs = 0.0
                _total_secs = 0.0
                while _total_secs < _MAX_SEC:
                    _chunk = parec_proc.stdout.read(_CHUNK_BYTES)  # type: ignore[union-attr]
                    if not _chunk or len(_chunk) < _CHUNK_BYTES:
                        break
                    _raw_parts.append(_chunk)
                    _total_secs += _CHUNK_SEC
                    _n = len(_chunk) // 2
                    _samps = struct.unpack_from(f"<{_n}h", _chunk)
                    _chunk_rms = (sum(s * s for s in _samps) / _n) ** 0.5
                    if _chunk_rms >= _SPEECH_RMS:
                        _speech_seen = True
                        _silence_secs = 0.0
                    elif _speech_seen:
                        _silence_secs += _CHUNK_SEC
                        if _silence_secs >= _SILENCE_TAIL_SEC:
                            break
                parec_proc.terminate()
                try:
                    parec_proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    parec_proc.kill()
                    parec_proc.wait(timeout=1)

                _raw_audio = b"".join(_raw_parts)
                _conv = subprocess.run(
                    ["ffmpeg", "-y", "-f", "s16le", "-ar", str(_CAPTURE_RATE), "-ac", "1",
                     "-i", "pipe:0", "-f", "wav", "pipe:1"],
                    input=_raw_audio, capture_output=True, timeout=10,
                )
                wav_bytes = _conv.stdout if _conv.returncode == 0 else b""

                rms = _compute_wav_rms(wav_bytes)
                if rms < 200:
                    logger.debug("[conv-loop] silent (rms=%d), skipping", rms)
                    continue

                # Transcribe via faster-whisper (local, no API key needed)
                transcript = ""
                _detected_lang = "en"
                _lang_prob = 0.0
                if _whisper_model:
                    try:
                        import tempfile as _tf
                        with _tf.NamedTemporaryFile(suffix=".wav", delete=False) as _tmp:
                            _tmp.write(wav_bytes)
                            _tmp_path = _tmp.name
                        _segs, _info = _whisper_model.transcribe(  # type: ignore[union-attr]
                            _tmp_path,
                            vad_filter=True,
                            multilingual=True,
                            language_detection_segments=5,
                        )
                        transcript = " ".join(s.text for s in _segs).strip()
                        _detected_lang = getattr(_info, "language", "en") or "en"
                        _lang_prob = float(getattr(_info, "language_probability", 0.0))
                        logger.info("[conv-loop] whisper lang=%s prob=%.2f text=%s",
                                    _detected_lang, _lang_prob, transcript[:60])
                        try:
                            os.unlink(_tmp_path)
                        except Exception:
                            pass
                    except Exception as exc:
                        logger.warning("[conv-loop] transcription failed: %s", exc)

                if not transcript.strip():
                    continue

                # Quality gate: skip very short or repetitive noise transcripts
                # (Whisper hallucinations under noise look like 1-2 word filler)
                _words = transcript.strip().split()
                if len(_words) < 3:
                    logger.debug("[conv-loop] skipping short transcript (%d words): %r", len(_words), transcript)
                    continue

                logger.info("[conv-loop] heard: %s", transcript)

                # ── Language resolution (3-tier priority) ──────────────────
                # 1. Unicode script detection from transcript text (100% reliable
                #    for non-Latin scripts: Hindi, Telugu, Tamil, Arabic, Korean…)
                _unicode_lang = _lang_from_text(transcript)

                # 2. For Latin-script input (unicode returns "en"), trust Whisper
                #    if it detected a non-English language. Whisper detects language
                #    from AUDIO patterns — so even when it transcribes Indian speech
                #    as English phonetics, the language field is still correct.
                #    Threshold 0.20: at this level Whisper is usually right about the
                #    language family even if transcription quality is poor.
                if _unicode_lang != "en":
                    _text_lang = _unicode_lang          # non-Latin script → certain
                elif _detected_lang != "en" and _lang_prob >= 0.10:
                    # Trust Whisper audio-based detection at low threshold:
                    # even at 0.10 it reliably identifies the language *family*
                    # even when transcription comes out romanized (Latin script)
                    _text_lang = _detected_lang
                else:
                    _text_lang = "en"                   # default English

                logger.info("[conv-loop] final lang=%s (unicode=%s whisper=%s prob=%.2f)",
                            _text_lang, _unicode_lang, _detected_lang, _lang_prob)

                # 3. Inject explicit language instruction so even small LLMs comply
                _LANG_NAMES: dict[str, str] = {
                    "en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil",
                    "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali", "mr": "Marathi",
                    "gu": "Gujarati", "ur": "Urdu", "pa": "Punjabi",
                    "fr": "French", "de": "German", "es": "Spanish", "pt": "Portuguese",
                    "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
                    "ar": "Arabic", "ru": "Russian", "it": "Italian",
                    "nl": "Dutch", "pl": "Polish", "tr": "Turkish",
                    "sv": "Swedish", "vi": "Vietnamese", "id": "Indonesian",
                }
                _lang_name = _LANG_NAMES.get(_text_lang, "English")
                _user_msg = (
                    f"[You MUST reply in {_lang_name} only — no other language] "
                    f"{transcript}"
                )
                history.append({"role": "user", "content": _user_msg})

                # Keep rolling context: system prompt + last 18 messages (9 turns)
                # Prevents unbounded history that overwhelms the small LLM.
                if len(history) > 19:
                    history = [history[0]] + history[-18:]

                # Generate reply via Ollama
                reply_text = _chat_openai(history) if OPENAI_API_KEY else _chat_ollama(history)
                if not reply_text:
                    continue

                logger.info("[conv-loop] replying: %s", reply_text)
                history.append({"role": "assistant", "content": reply_text})

                # TTS → play to virtual-sink so participants hear agent
                _reply_lang = _lang_from_text(reply_text)
                # When input was detected as an Indian language but the LLM replied
                # in Latin/English (romanized transcript → English reply), force the
                # TTS to use the *input* language so Sarvam fires with the right voice.
                _tts_lang = (
                    _text_lang
                    if (_text_lang in _SARVAM_LANG_MAP and _reply_lang == "en")
                    else _reply_lang
                )
                wav_reply = _voicebox_tts(reply_text, voice_id=_voice_for_lang(_tts_lang), lang=_tts_lang)
                if wav_reply:
                    _start_avatar_loop("talking")
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(wav_reply)
                        tmp_path = tmp.name
                    subprocess.run(
                        ["paplay", "--device=virtual-sink", tmp_path],
                        timeout=60, capture_output=True, env=_pulse_env,
                    )
                    _bot_spoke_at = time.time()   # mark when bot finished speaking
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
                    _start_avatar_loop("idle")

                _speech_turn += 1

            browser.close()

    except Exception as exc:
        logger.error("[playwright-join] error: %s", exc)
    finally:
        with _sessions_lock:
            if session_id in _sessions:
                t = _sessions[session_id].get("current_task")
                if t and t["status"] not in ("completed", "timeout"):
                    t["status"] = "completed"
                    t["result"] = "Meeting session ended"
                _sessions[session_id]["status"] = "idle"
        _start_avatar_loop("idle")
        logger.info("[playwright-join] session %s ended", session_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT, threaded=True)
