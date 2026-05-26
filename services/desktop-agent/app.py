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
# Session store — Redis-backed with in-memory cache fallback
# ---------------------------------------------------------------------------

def _init_redis_client() -> Any:
    url = os.environ.get("REDIS_URL", "")
    if not url:
        return None
    try:
        import redis as _redis_pkg  # type: ignore
        client = _redis_pkg.Redis.from_url(url, decode_responses=True, socket_connect_timeout=3)
        client.ping()
        logger.info("SessionStore: Redis connected at %s", url)
        return client
    except Exception as exc:
        logger.warning("SessionStore: Redis unavailable (%s) — using in-memory store", exc)
        return None


class SessionStore:
    """Thread-safe session registry backed by Redis (when REDIS_URL is set).

    Sessions are always kept in the local process dict for fast access.
    Redis stores lightweight metadata (no screenshots, no Popen objects)
    so other instances and post-restart queries can discover sessions.
    """

    _SESSION_TTL = 86_400  # 24 h

    def __init__(self, redis_client: Any = None) -> None:
        self._data: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._redis = redis_client

    def _key(self, session_id: str) -> str:
        return f"af:desktop:session:{session_id}"

    def _redis_sync(self, session_id: str, session: dict[str, Any]) -> None:
        if not self._redis:
            return
        task = session.get("current_task")
        payload: dict[str, str] = {
            "sessionId": session.get("sessionId", session_id),
            "status": session.get("status", "idle"),
            "createdAt": session.get("createdAt", ""),
            "taskId": task.get("taskId", "") if task else "",
            "taskStatus": task.get("status", "") if task else "",
        }
        try:
            key = self._key(session_id)
            self._redis.hset(key, mapping=payload)
            self._redis.expire(key, self._SESSION_TTL)
        except Exception as exc:
            logger.debug("SessionStore: Redis sync error: %s", exc)

    def _redis_delete(self, session_id: str) -> None:
        if not self._redis:
            return
        try:
            self._redis.delete(self._key(session_id))
        except Exception:
            pass

    # ── Public API ──────────────────────────────────────────────────────────

    def create(self, session_id: str, session: dict[str, Any]) -> None:
        with self._lock:
            self._data[session_id] = session
        self._redis_sync(session_id, session)

    def get(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._data.get(session_id)

    def contains(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self._data

    def delete(self, session_id: str) -> bool:
        with self._lock:
            existed = session_id in self._data
            if existed:
                # Terminate per-session avatar process before removing
                proc = self._data[session_id].get("avatar_proc")
                if proc is not None:
                    try:
                        proc.terminate()
                        proc.wait(timeout=2)
                    except Exception:
                        pass
                del self._data[session_id]
        if existed:
            self._redis_delete(session_id)
        return existed

    def update_fields(self, session_id: str, **fields: Any) -> bool:
        """Atomically update top-level session fields; sync status changes to Redis."""
        with self._lock:
            s = self._data.get(session_id)
            if s is None:
                return False
            s.update(fields)
            snapshot = dict(s)
        if "status" in fields:
            self._redis_sync(session_id, snapshot)
        return True

    def set_task(self, session_id: str, task: dict[str, Any]) -> bool:
        with self._lock:
            s = self._data.get(session_id)
            if s is None:
                return False
            s["current_task"] = task
            s["status"] = "busy"
            snapshot = dict(s)
        self._redis_sync(session_id, snapshot)
        return True

    def get_task(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            s = self._data.get(session_id)
            return s.get("current_task") if s else None

    def update_task_fields(self, session_id: str, **fields: Any) -> bool:
        """Atomically update current_task fields; syncs status/result to Redis."""
        with self._lock:
            s = self._data.get(session_id)
            if not s or not s.get("current_task"):
                return False
            s["current_task"].update(fields)
            snapshot = dict(s)
        if "status" in fields or "result" in fields:
            self._redis_sync(session_id, snapshot)
        return True

    def append_task_step(self, session_id: str, step: dict[str, Any]) -> bool:
        with self._lock:
            s = self._data.get(session_id)
            if not s or not s.get("current_task"):
                return False
            s["current_task"].setdefault("steps", []).append(step)
            return True

    def get_avatar_proc(self, session_id: str) -> Any:
        with self._lock:
            s = self._data.get(session_id)
            return s.get("avatar_proc") if s else None

    def set_avatar_proc(self, session_id: str, proc: Any) -> None:
        with self._lock:
            s = self._data.get(session_id)
            if s is not None:
                s["avatar_proc"] = proc

    def list_ids(self) -> list[str]:
        with self._lock:
            return list(self._data.keys())


# Global store — initialized at startup
_store = SessionStore(redis_client=_init_redis_client())


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


# Module-level singletons — initialized once on first use to avoid
# re-creating HTTP connection pools on every vision step.
_openai_client: Any = None
_anthropic_client: Any = None


def _get_openai_client() -> Any:
    global _openai_client
    if _openai_client is None:
        import openai  # type: ignore
        _openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def _get_anthropic_client() -> Any:
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic  # type: ignore
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


def _call_openai(screenshot_b64: str, prompt: str) -> str:
    client = _get_openai_client()
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
    client = _get_anthropic_client()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": screenshot_b64},
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

def _update_task(session_id: str, **fields: Any) -> None:
    _store.update_task_fields(session_id, **fields)


def _append_task_step(session_id: str, step: dict[str, Any]) -> None:
    _store.append_task_step(session_id, step)


def _run_vision_loop(session_id: str, goal: str) -> None:
    task = _store.get_task(session_id)
    if task is None:
        return

    _store.update_task_fields(session_id, status="running")
    deadline = time.monotonic() + VISION_LOOP_TIMEOUT
    local_steps: list[dict[str, Any]] = []

    for step_num in range(MAX_VISION_STEPS):
        if time.monotonic() > deadline:
            _store.update_task_fields(session_id, status="timeout", result="Task timed out")
            break

        screenshot_b64 = _screenshot()
        if screenshot_b64 is None:
            step = {"step": step_num, "action": "screenshot", "ok": False,
                    "errorMessage": "Screenshot failed — display may not be ready",
                    "timestamp": _now()}
            local_steps.append(step)
            _store.append_task_step(session_id, step)
            time.sleep(1)
            continue

        # Store screenshot in-memory only (too large for Redis serialization)
        _store.update_task_fields(session_id, last_screenshot=screenshot_b64)
        actions = _llm_decide(screenshot_b64, goal, local_steps)

        done = False
        for act in actions:
            act_name = act.get("action", "")
            result = _execute_action(act)
            step = {"step": step_num, "action": act_name,
                    "target": act.get("target", ""), "value": act.get("value", ""),
                    **result, "timestamp": _now()}
            local_steps.append(step)
            _store.append_task_step(session_id, step)
            if act_name == "done":
                _store.update_task_fields(session_id, status="completed",
                                          result=act.get("value") or "Task completed")
                done = True
                break
            time.sleep(0.4)

        if done:
            break
        time.sleep(1)
    else:
        task = _store.get_task(session_id)
        if task and task.get("status") == "running":
            _store.update_task_fields(session_id, status="completed", result="Max steps reached")

    _store.update_fields(session_id, status="idle")


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
    created_at = _now()
    _store.create(session_id, {
        "sessionId": session_id,
        "status": "idle",
        "createdAt": created_at,
        "current_task": None,
        "avatar_proc": None,
    })
    return jsonify({
        "sessionId": session_id,
        "status": "idle",
        "streamUrl": f"http://localhost:{NOVNC_PORT}/vnc.html",
        "createdAt": created_at,
    }), 201


@app.route("/v1/sessions/<session_id>", methods=["GET"])
def get_session(session_id: str):
    s = _store.get(session_id)
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
    if not _store.delete(session_id):
        return jsonify({"error": "session not found"}), 404
    return jsonify({"deleted": True})


@app.route("/v1/sessions/<session_id>/task", methods=["POST"])
def submit_task(session_id: str):
    if not _store.contains(session_id):
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    goal = body.get("goal", "")
    if not isinstance(goal, str) or not goal.strip():
        return jsonify({"error": "'goal' is required"}), 400

    goal = goal.strip()
    task_id = str(uuid.uuid4())
    started_at = _now()
    task: dict[str, Any] = {
        "taskId": task_id,
        "goal": goal,
        "status": "queued",
        "steps": [],
        "result": None,
        "last_screenshot": None,
        "startedAt": started_at,
    }
    _store.set_task(session_id, task)

    threading.Thread(target=_run_vision_loop, args=(session_id, goal), daemon=True).start()

    return jsonify({
        "taskId": task_id,
        "sessionId": session_id,
        "status": "queued",
        "startedAt": started_at,
    }), 202


@app.route("/v1/sessions/<session_id>/task", methods=["GET"])
def get_task(session_id: str):
    if not _store.contains(session_id):
        return jsonify({"error": "session not found"}), 404
    task = _store.get_task(session_id)
    if task is None:
        return jsonify({"error": "no task for this session"}), 404

    return jsonify({
        "taskId": task["taskId"],
        "sessionId": session_id,
        "goal": task["goal"],
        "status": task["status"],
        "result": task.get("result"),
        "stepCount": len(task.get("steps", [])),
        "steps": task.get("steps", [])[-10:],
        "startedAt": task["startedAt"],
    })


# ---------------------------------------------------------------------------
# Avatar state management (per-session — no global mutable process)
# ---------------------------------------------------------------------------

def _start_avatar_loop(session_id: str, state: str = "idle") -> None:
    """Restart the avatar FIFO loop for a specific session (idle | talking).

    Each session owns its avatar process. Multiple concurrent sessions each
    get an independent virtual camera stream without interfering with each other.
    """
    source_file = "/app/avatar-talking.y4m" if state == "talking" else "/app/avatar-idle.y4m"
    old_proc = _store.get_avatar_proc(session_id)
    if old_proc is not None:
        try:
            old_proc.terminate()
            old_proc.wait(timeout=3)
        except Exception:
            pass
    new_proc: subprocess.Popen[bytes] = subprocess.Popen(
        ["bash", "-c", f"while true; do cat {source_file} > /tmp/avatar.fifo 2>/dev/null || sleep 0.1; done"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _store.set_avatar_proc(session_id, new_proc)
    logger.info("avatar loop started: session=%s state=%s pid=%s", session_id, state, new_proc.pid)


def _stop_avatar_loop(session_id: str) -> None:
    """Terminate the avatar process for a session if one is running."""
    proc = _store.get_avatar_proc(session_id)
    if proc is not None:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass
        _store.set_avatar_proc(session_id, None)


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
    if not _store.contains(session_id):
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    meeting_url: str | None = body.get("meetingUrl") or body.get("meeting_url") or body.get("url")
    platform: str = str(body.get("platform", "google_meet")).lower()
    mode: str = str(body.get("mode", "playwright")).lower()

    task_id = str(uuid.uuid4())
    started_at = _now()
    task: dict[str, Any] = {
        "taskId": task_id,
        "goal": f"Join {platform} meeting at {meeting_url}",
        "status": "queued",
        "steps": [],
        "result": None,
        "last_screenshot": None,
        "startedAt": started_at,
    }
    _store.set_task(session_id, task)

    if mode == "playwright":
        threading.Thread(
            target=_playwright_join_and_converse,
            args=(session_id, meeting_url or "about:blank"),
            daemon=True,
        ).start()
    else:
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
        _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": _pulse_rt}
        for _ in range(5):
            try:
                result = subprocess.run(
                    ["pactl", "list", "sink-inputs", "short"],
                    capture_output=True, text=True, timeout=5, env=_pulse_env,
                )
                for line in result.stdout.splitlines():
                    parts = line.split()
                    if parts:
                        subprocess.run(
                            ["pactl", "move-sink-input", parts[0], "chrome-output-sink"],
                            capture_output=True, timeout=5, env=_pulse_env,
                        )
            except Exception:
                pass
            time.sleep(1)
        _start_avatar_loop(session_id, "idle")
        _store.update_task_fields(session_id, goal=goal)
        threading.Thread(target=_run_vision_loop, args=(session_id, goal), daemon=True).start()

    return jsonify({
        "taskId": task_id,
        "sessionId": session_id,
        "platform": platform,
        "mode": mode,
        "status": "joining",
        "startedAt": started_at,
    }), 202


@app.route("/v1/sessions/<session_id>/speak", methods=["POST"])
def speak_audio(session_id: str):
    """Play base64-encoded WAV/MP3 audio through the virtual PulseAudio sink.
    Meeting participants hear the agent speak because Chromium uses virtual-source
    (which is a loopback from virtual-sink.monitor) as its microphone.
    """
    if not _store.contains(session_id):
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    audio_b64: str | None = body.get("audioBase64")
    if not audio_b64:
        return jsonify({"error": "'audioBase64' is required"}), 400

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        return jsonify({"error": "invalid base64 in audioBase64"}), 400

    _start_avatar_loop(session_id, "talking")

    t0 = time.monotonic()
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        _pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse-runtime")}
        result = subprocess.run(
            ["paplay", "--device=virtual-sink", tmp_path],
            timeout=60,
            capture_output=True,
            env=_pulse_env,
        )
        duration_ms = int((time.monotonic() - t0) * 1000)

        if result.returncode != 0:
            _start_avatar_loop(session_id, "idle")
            return jsonify({
                "ok": False,
                "durationMs": duration_ms,
                "error": result.stderr.decode(errors="replace").strip(),
            }), 500

    except subprocess.TimeoutExpired:
        _start_avatar_loop(session_id, "idle")
        return jsonify({"ok": False, "durationMs": 60000, "error": "paplay timed out"}), 500
    except Exception as exc:
        _start_avatar_loop(session_id, "idle")
        return jsonify({"ok": False, "durationMs": 0, "error": str(exc)}), 500
    finally:
        try:
            if tmp_path:
                os.unlink(tmp_path)
        except Exception:
            pass

    _start_avatar_loop(session_id, "idle")
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
    if not _store.contains(session_id):
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
    if not _store.contains(session_id):
        return jsonify({"error": "session not found"}), 404

    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}
    state = str(body.get("state", "idle")).lower()
    if state not in ("idle", "talking"):
        return jsonify({"error": "'state' must be 'idle' or 'talking'"}), 400

    _start_avatar_loop(session_id, state)
    return jsonify({"ok": True, "state": state})


# ---------------------------------------------------------------------------
# Ollama text-only LLM (for conversation loop when no vision LLM is set)
# ---------------------------------------------------------------------------

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://host.docker.internal:11434")
OLLAMA_MODEL = os.environ.get("LLM_MODEL", "llama3.2:1b")
# Agent persona — override via env to avoid hardcoding "Alex" everywhere
AGENT_DISPLAY_NAME = os.environ.get("AGENT_DISPLAY_NAME", "Alex")
AGENT_MEETING_MODE = os.environ.get("AGENT_MEETING_MODE", "interactive_qa")  # standup | interview_assistant | interactive_qa
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


# ---------------------------------------------------------------------------
# TTS provider chain
#
# Each provider is an independently-testable function:
#   (text, voice_id, lang) -> bytes | None
#
# _voicebox_tts() walks _TTS_PROVIDERS in order and returns the first
# non-None result.  Adding a new provider = append one entry to the list.
# ---------------------------------------------------------------------------

def _mp3_to_wav(mp3_bytes: bytes, timeout: int = 30) -> bytes | None:
    """Convert MP3 bytes → WAV via ffmpeg. Returns None on failure."""
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", "pipe:0", "-f", "wav", "pipe:1"],
        input=mp3_bytes, capture_output=True, timeout=timeout,
    )
    return proc.stdout if proc.returncode == 0 else None


def _tts_sarvam(text: str, voice_id: str, lang: str) -> bytes | None:
    """Sarvam AI — best quality for Indian languages (~200 ms)."""
    import urllib.request as _ur, urllib.error as _ue, json as _js
    sarvam_code = _SARVAM_LANG_MAP.get(lang)
    if not (SARVAM_API_KEY and sarvam_code):
        return None
    try:
        payload = _js.dumps({
            "inputs": [text[:500]],   # Sarvam has a 500-char limit
            "target_language_code": sarvam_code,
            "speaker": SARVAM_SPEAKER,
            "model": "bulbul:v1",
            "speech_sample_rate": 22050,
            "enable_preprocessing": True,
        }).encode()
        req = _ur.Request(
            "https://api.sarvam.ai/text-to-speech",
            data=payload,
            headers={"API-Subscription-Key": SARVAM_API_KEY, "Content-Type": "application/json"},
            method="POST",
        )
        with _ur.urlopen(req, timeout=10) as resp:
            body = _js.loads(resp.read())
        b64 = (body.get("audios") or [None])[0] or body.get("audio", "")
        if b64:
            wav = base64.b64decode(b64)
            logger.info("[tts] Sarvam ok (%s), %d bytes", sarvam_code, len(wav))
            return wav
    except Exception as exc:
        detail = ""
        if isinstance(exc, _ue.HTTPError):
            try:
                detail = f" body={exc.read().decode(errors='replace')[:200]}"
            except Exception:
                pass
        logger.warning("[tts] Sarvam failed (%s)%s, trying next", exc, detail)
    return None


def _tts_elevenlabs(text: str, voice_id: str, lang: str) -> bytes | None:
    """ElevenLabs Flash v2.5 — fastest non-Indian voice (~75 ms)."""
    import urllib.request as _ur, json as _js
    if not ELEVENLABS_API_KEY:
        return None
    try:
        payload = _js.dumps({
            "text": text,
            "model_id": "eleven_flash_v2_5",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode()
        req = _ur.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
            data=payload,
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        with _ur.urlopen(req, timeout=10) as resp:
            mp3 = resp.read()
        wav = _mp3_to_wav(mp3, timeout=20) if mp3 else None
        if wav:
            logger.info("[tts] ElevenLabs ok, %d bytes", len(wav))
            return wav
    except Exception as exc:
        logger.warning("[tts] ElevenLabs failed (%s), trying next", exc)
    return None


def _tts_openai(text: str, voice_id: str, lang: str) -> bytes | None:
    """OpenAI tts-1 — reliable paid fallback (~400 ms)."""
    import urllib.request as _ur, json as _js
    if not OPENAI_API_KEY:
        return None
    try:
        payload = _js.dumps({
            "model": "tts-1",
            "input": text,
            "voice": OPENAI_TTS_VOICE,
            "response_format": "mp3",
        }).encode()
        req = _ur.Request(
            "https://api.openai.com/v1/audio/speech",
            data=payload,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        with _ur.urlopen(req, timeout=15) as resp:
            mp3 = resp.read()
        wav = _mp3_to_wav(mp3, timeout=30) if mp3 else None
        if wav:
            logger.info("[tts] OpenAI ok, %d bytes", len(wav))
            return wav
    except Exception as exc:
        logger.warning("[tts] OpenAI TTS failed (%s), trying next", exc)
    return None


def _tts_edge(text: str, voice_id: str, lang: str) -> bytes | None:
    """edge-tts — free cloud fallback (no API key required)."""
    import asyncio, io
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

        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            mp3_bytes = ex.submit(asyncio.run, _synth()).result(timeout=30)
        wav = _mp3_to_wav(mp3_bytes, timeout=30) if mp3_bytes else None
        if wav:
            return wav
    except Exception as exc:
        logger.warning("[tts] edge-tts failed (%s), trying espeak-ng", exc)
    return None


def _tts_espeak(text: str, voice_id: str, lang: str) -> bytes | None:
    """espeak-ng — last resort; always present on the container image."""
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
        logger.warning("[tts] espeak-ng failed: %s", exc)
    return None


# Ordered provider chain. To add a new provider, append to this list.
_TTS_PROVIDERS = [_tts_sarvam, _tts_elevenlabs, _tts_openai, _tts_edge, _tts_espeak]


def _voicebox_tts(text: str, voice_id: str = "en-US-GuyNeural", lang: str = "en") -> bytes | None:
    """Try each TTS provider in priority order; return the first successful WAV.

    Priority: Sarvam (Indian langs) → ElevenLabs → OpenAI → edge-tts → espeak-ng
    Returns WAV bytes, or None if all providers fail.
    """
    for provider in _TTS_PROVIDERS:
        result = provider(text, voice_id, lang)
        if result:
            return result
    logger.error("[tts] all providers failed for text: %r", text[:60])
    return None


# ---------------------------------------------------------------------------
# Playwright meeting join — helpers
# ---------------------------------------------------------------------------

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


def _playwright_dismiss_interstitials(page) -> bool:
    """Click through consent/interstitial prompts. Returns True if any were dismissed."""
    dismiss_texts = [
        "Got it",
        "Continue without signing in",
        "Use without an account",
        "Join as a guest",
        "Dismiss",
    ]
    any_dismissed = False
    for _ in range(10):
        dismissed = False
        for text in dismiss_texts:
            try:
                btn = page.get_by_role("button", name=text).first
                if btn.is_visible(timeout=400):
                    btn.click()
                    logger.info("[playwright-join] dismissed prompt: '%s'", text)
                    time.sleep(0.8)
                    dismissed = any_dismissed = True
                    break
            except Exception:
                pass
            try:
                lnk = page.get_by_role("link", name=text).first
                if lnk.is_visible(timeout=300):
                    lnk.click()
                    logger.info("[playwright-join] clicked link: '%s'", text)
                    time.sleep(0.8)
                    dismissed = any_dismissed = True
                    break
            except Exception:
                pass
        if not dismissed:
            break
        time.sleep(0.3)
    return any_dismissed


def _playwright_fill_display_name(page, agent_name: str) -> bool:
    """Fill the Meet guest-name input. Returns True when name is confirmed entered."""
    name_selectors = [
        "input[autocomplete='name']",
        "input[aria-label=\"What's your name?\"]",
        "input[aria-label='Your name']",
        "input[placeholder='Your name']",
        "input[jsname='YPqjbf']",
        "input[aria-label*='name' i][type='text']",
        "input[placeholder*='name' i][type='text']",
        "input[aria-label*='your' i][type='text']",
    ]
    for try_num in range(25):
        for sel in name_selectors:
            try:
                inp = page.locator(sel).first
                if inp.is_visible(timeout=500):
                    inp.fill(agent_name)
                    time.sleep(0.1)
                    if inp.input_value() == agent_name:
                        logger.info("[playwright-join] filled display name via CSS '%s' (try %d)", sel, try_num)
                        return True
            except Exception:
                pass
        try:
            for tb in page.get_by_role("textbox").all():
                if tb.is_visible(timeout=300):
                    tb.fill(agent_name)
                    time.sleep(0.1)
                    if tb.input_value() == agent_name:
                        logger.info("[playwright-join] filled display name via textbox role (try %d)", try_num)
                        return True
        except Exception:
            pass
        time.sleep(0.5)
    logger.warning("[playwright-join] could not fill display name after 25 attempts")
    return False


def _playwright_click_join_button(page) -> bool:
    """Click Ask to join / Join now / Join. Returns True on success."""
    for attempt in range(30):
        time.sleep(2)
        for btn_name in ["Ask to join", "Join now", "Join"]:
            try:
                btn = page.get_by_role("button", name=btn_name).first
                if btn.is_visible(timeout=500) and btn.is_enabled():
                    btn.click()
                    logger.info("[playwright-join] clicked '%s' (attempt %d)", btn_name, attempt)
                    return True
                elif btn.is_visible(timeout=200):
                    logger.debug("[playwright-join] '%s' visible but disabled (attempt %d)", btn_name, attempt)
            except Exception as e:
                logger.debug("[playwright-join] get_by_role '%s' error: %s", btn_name, e)
        for fsel in ["[jsname='Qx7uuf']", "[data-promo-anchor-id='join-button']"]:
            try:
                btn = page.locator(fsel).first
                if btn.is_visible(timeout=400) and btn.is_enabled():
                    btn.click()
                    logger.info("[playwright-join] clicked fallback '%s' (attempt %d)", fsel, attempt)
                    return True
            except Exception:
                pass
        logger.debug("[playwright-join] join btn not found (attempt %d) url=%s", attempt, page.url)
    logger.warning("[playwright-join] could not find join button after 60 s — url: %s", page.url)
    return False


def _playwright_wait_for_admission(page) -> None:
    """Spin until 'Waiting to be let in' disappears (up to 60 s)."""
    for _ in range(30):
        try:
            if page.locator("text=Waiting to be let in").first.is_visible(timeout=800):
                time.sleep(2)
                continue
        except Exception:
            pass
        break
    logger.info("[playwright-join] admitted to meeting (url: %s)", page.url)


def _playwright_play_tts(session_id: str, wav_bytes: bytes, pulse_env: dict) -> float:
    """Play wav_bytes to virtual-sink with avatar state management. Returns finish timestamp."""
    _start_avatar_loop(session_id, "talking")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tf.write(wav_bytes)
        path = tf.name
    try:
        subprocess.run(
            ["paplay", "--device=virtual-sink", path],
            timeout=60, capture_output=True, env=pulse_env,
        )
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass
    _start_avatar_loop(session_id, "idle")
    return time.time()


def _playwright_play_greeting(session_id: str, pulse_env: dict) -> None:
    """Synthesize and play the bot's opening greeting."""
    greet_text = (
        f"Hey everyone! I just joined. I'm {AGENT_DISPLAY_NAME}, your AI assistant. "
        "Feel free to talk — I'm here to help!"
    )
    wav = _voicebox_tts(greet_text)
    if wav:
        _playwright_play_tts(session_id, wav, pulse_env)
        logger.info("[playwright-join] greeted participants")


def _playwright_conversation_loop(
    session_id: str,
    page,
    pulse_env: dict,
    history: list[dict],
    max_turns: int,
    deadline: float,
    whisper_model,
) -> None:
    """VAD → transcribe → LLM → TTS loop until turns/time/session exhausted."""
    _CAPTURE_RATE = 16000
    _CHUNK_SEC = 0.3
    _MAX_SEC = 8.0
    _SILENCE_TAIL_SEC = 0.5
    _SPEECH_RMS = 300
    _CHUNK_BYTES = int(_CAPTURE_RATE * _CHUNK_SEC) * 2

    bot_spoke_at: float = 0.0
    speech_turn = 0

    while speech_turn < max_turns:
        if time.monotonic() > deadline:
            logger.info("[conv-loop] meeting time limit reached")
            break
        if not _store.contains(session_id):
            break

        echo_gap = 0.8 - (time.time() - bot_spoke_at)
        if echo_gap > 0:
            time.sleep(echo_gap)

        parec_proc = subprocess.Popen(
            ["parec", "--device=chrome-output-sink.monitor",
             "--format=s16le", f"--rate={_CAPTURE_RATE}", "--channels=1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=pulse_env,
        )
        raw_parts: list[bytes] = []
        speech_seen = False
        silence_secs = 0.0
        total_secs = 0.0
        while total_secs < _MAX_SEC:
            chunk = parec_proc.stdout.read(_CHUNK_BYTES)  # type: ignore[union-attr]
            if not chunk or len(chunk) < _CHUNK_BYTES:
                break
            raw_parts.append(chunk)
            total_secs += _CHUNK_SEC
            n = len(chunk) // 2
            samps = struct.unpack_from(f"<{n}h", chunk)
            chunk_rms = (sum(s * s for s in samps) / n) ** 0.5
            if chunk_rms >= _SPEECH_RMS:
                speech_seen = True
                silence_secs = 0.0
            elif speech_seen:
                silence_secs += _CHUNK_SEC
                if silence_secs >= _SILENCE_TAIL_SEC:
                    break
        parec_proc.terminate()
        try:
            parec_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            parec_proc.kill()
            parec_proc.wait(timeout=1)

        raw_audio = b"".join(raw_parts)
        conv = subprocess.run(
            ["ffmpeg", "-y", "-f", "s16le", "-ar", str(_CAPTURE_RATE), "-ac", "1",
             "-i", "pipe:0", "-f", "wav", "pipe:1"],
            input=raw_audio, capture_output=True, timeout=10,
        )
        wav_bytes = conv.stdout if conv.returncode == 0 else b""

        if _compute_wav_rms(wav_bytes) < 200:
            logger.debug("[conv-loop] silent, skipping")
            continue

        transcript = ""
        detected_lang = "en"
        lang_prob = 0.0
        if whisper_model:
            try:
                import tempfile as _tf
                with _tf.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(wav_bytes)
                    tmp_path = tmp.name
                segs, info = whisper_model.transcribe(
                    tmp_path, vad_filter=True, multilingual=True, language_detection_segments=5,
                )
                transcript = " ".join(s.text for s in segs).strip()
                detected_lang = getattr(info, "language", "en") or "en"
                lang_prob = float(getattr(info, "language_probability", 0.0))
                logger.info("[conv-loop] whisper lang=%s prob=%.2f text=%s",
                            detected_lang, lang_prob, transcript[:60])
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
            except Exception as exc:
                logger.warning("[conv-loop] transcription failed: %s", exc)

        if not transcript.strip():
            continue

        words = transcript.strip().split()
        if len(words) < 3:
            logger.debug("[conv-loop] skipping short transcript (%d words): %r", len(words), transcript)
            continue

        logger.info("[conv-loop] heard: %s", transcript)

        unicode_lang = _lang_from_text(transcript)
        if unicode_lang != "en":
            text_lang = unicode_lang
        elif detected_lang != "en" and lang_prob >= 0.10:
            text_lang = detected_lang
        else:
            text_lang = "en"
        logger.info("[conv-loop] final lang=%s (unicode=%s whisper=%s prob=%.2f)",
                    text_lang, unicode_lang, detected_lang, lang_prob)

        lang_name = _LANG_NAMES.get(text_lang, "English")
        history.append({"role": "user", "content": f"[You MUST reply in {lang_name} only — no other language] {transcript}"})

        if len(history) > 19:
            history = [history[0]] + history[-18:]

        reply_text = _chat_openai(history) if OPENAI_API_KEY else _chat_ollama(history)
        if not reply_text:
            continue

        logger.info("[conv-loop] replying: %s", reply_text)
        history.append({"role": "assistant", "content": reply_text})

        reply_lang = _lang_from_text(reply_text)
        tts_lang = (
            text_lang
            if (text_lang in _SARVAM_LANG_MAP and reply_lang == "en")
            else reply_lang
        )
        wav_reply = _voicebox_tts(reply_text, voice_id=_voice_for_lang(tts_lang), lang=tts_lang)
        if wav_reply:
            bot_spoke_at = _playwright_play_tts(session_id, wav_reply, pulse_env)

        speech_turn += 1


def _playwright_join_and_converse(session_id: str, meeting_url: str) -> None:
    """Join Google Meet via Playwright DOM automation and run a voice conversation loop."""
    from playwright.sync_api import sync_playwright

    _pulse_rt = os.environ.get("PULSE_RUNTIME_PATH", "/tmp/pulse")
    env_extra = {
        "DISPLAY": DISPLAY,
        "PULSE_RUNTIME_PATH": _pulse_rt,
        "PULSE_SERVER": f"unix:{_pulse_rt}/native",
        "XDG_RUNTIME_DIR": "/tmp/runtime",
        "PULSE_SINK": "chrome-output-sink",
    }
    pulse_env = {**os.environ, "PULSE_RUNTIME_PATH": _pulse_rt}

    launch_args = [
        "--use-fake-ui-for-media-stream",
        "--use-file-for-fake-video-capture=/tmp/avatar.fifo",
        "--autoplay-policy=no-user-gesture-required",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
    ]

    if not _store.contains(session_id):
        return

    logger.info("[playwright-join] launching Chromium for session %s → %s", session_id, meeting_url)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                args=launch_args,
                env={**os.environ, **env_extra},
            )
            ctx = browser.new_context(permissions=["camera", "microphone"])
            page = ctx.new_page()
            page.goto(meeting_url, timeout=30_000, wait_until="domcontentloaded")
            logger.info("[playwright-join] page loaded: %s  url: %s", page.title(), page.url)

            if "accounts.google.com" in page.url or "/signin" in page.url:
                logger.warning("[playwright-join] redirected to Google sign-in — retrying as guest")
                page.goto(meeting_url, timeout=30_000, wait_until="domcontentloaded")
                time.sleep(2)

            _playwright_dismiss_interstitials(page)
            _playwright_fill_display_name(page, "AI Agent")
            time.sleep(1.5)

            if not _playwright_click_join_button(page):
                _store.update_task_fields(
                    session_id,
                    status="completed",
                    result="Could not find join button — meeting may require sign-in or host admission",
                )
                _store.update_fields(session_id, status="idle")
                return

            _playwright_wait_for_admission(page)
            _playwright_play_greeting(session_id, pulse_env)
            _start_avatar_loop(session_id, "idle")

            mode_guidance = {
                "standup": (
                    "This is a daily standup. When it is your turn, give a structured update: "
                    "(1) what you completed since the last standup, "
                    "(2) what you plan to work on today, "
                    "(3) any blockers. Keep it under 30 seconds. Always respond when called on."
                ),
                "interview_assistant": (
                    "This is an interview. You are being interviewed. "
                    "Treat EVERY statement or question as directed at you — do not wait to be addressed by name. "
                    "Answer every question thoughtfully. Do not stay silent."
                ),
                "interactive_qa": (
                    "This is a focused Q&A or one-on-one session. "
                    "Assume most speech is directed at you. "
                    "Respond to questions AND direct statements or commands."
                ),
            }.get(AGENT_MEETING_MODE, "")

            history: list[dict[str, Any]] = [
                {"role": "system", "content": (
                    f"You are {AGENT_DISPLAY_NAME}, an AI assistant attending this meeting via voice. "
                    "You CAN hear everything said in this meeting — each message you receive "
                    "is a live transcript of what a participant just said to you. "
                    "NEVER say you cannot hear, that audio is not working, or that you are "
                    "waiting for audio — you are always hearing perfectly. "
                    "If someone asks 'can you hear me?' answer: 'Yes, I can hear you clearly!' "
                    "then continue with a relevant response. "
                    "Respond DIRECTLY to what was just said — reference the specific words, "
                    "question, or topic the person raised. "
                    f"{mode_guidance} "
                    "Keep every reply to 1–2 sentences unless the question requires more detail. "
                    "No filler like 'Certainly!' or 'Great question!'. "
                    "ALWAYS reply in the exact same language the speaker used."
                )}
            ]

            max_turns = int(os.environ.get("MEETING_MAX_TURNS", "200"))
            meeting_minutes = int(os.environ.get("MEETING_MAX_MINUTES", "90"))
            deadline = time.monotonic() + meeting_minutes * 60

            whisper_size = os.environ.get("WHISPER_MODEL", "small")
            whisper_model = None
            try:
                from faster_whisper import WhisperModel  # type: ignore
                whisper_model = WhisperModel(whisper_size, device="cpu", compute_type="int8")
                logger.info("[conv-loop] Whisper %s model loaded", whisper_size)
            except Exception as we:
                logger.warning("[conv-loop] Whisper load failed: %s", we)

            _playwright_conversation_loop(
                session_id, page, pulse_env, history, max_turns, deadline, whisper_model,
            )
            browser.close()

    except Exception as exc:
        logger.error("[playwright-join] error: %s", exc)
    finally:
        task = _store.get_task(session_id)
        if task and task.get("status") not in ("completed", "timeout"):
            _store.update_task_fields(session_id, status="completed", result="Meeting session ended")
        _store.update_fields(session_id, status="idle")
        _start_avatar_loop(session_id, "idle")
        logger.info("[playwright-join] session %s ended", session_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT, threaded=True)
