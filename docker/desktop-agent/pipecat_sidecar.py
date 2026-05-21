"""
AgentFarm desktop-agent: voice sidecar.

Runs alongside the Node.js agent inside the desktop container and provides:

  * Audio capture from a PulseAudio monitor source (so we can hear what the
    meeting client is playing through the speakers).
  * Voice-activity detection (Silero VAD) + streaming speech-to-text
    (faster-whisper, model `large-v3-turbo` by default) on each utterance.
  * Audio injection: synthesised speech from the meeting-agent / Supertonic
    is piped into a PulseAudio null-sink whose monitor is exposed as the
    container's default microphone, so the meeting client picks it up.

The component name "pipecat sidecar" reflects the original deferred work
item; this implementation does not require the upstream `pipecat-ai`
package — it uses faster-whisper + silero-vad + sounddevice directly to
keep the dependency surface and image size manageable.

HTTP API (PIPECAT_PORT, default 7800):

  GET  /health
       → { ok, capturing, model_loaded, pulse_ready }

  POST /v1/capture/start
       body: { session_id, callback_url, callback_token?, source? }
       → { ok, session_id }

  POST /v1/capture/stop
       body: { session_id }
       → { ok, stopped }

  POST /v1/inject
       headers: content-type: audio/* (mp3, wav, ogg, etc.)
       query:   ?session_id=...&sink=AgentMic
       body:    raw audio bytes
       → { ok, bytes_played }

  GET  /v1/status
       → { capturing, session_id, utterances, last_callback_status }

Environment:
  PIPECAT_PORT          listen port (default 7800)
  PIPECAT_HOST          listen host (default 0.0.0.0)
  PIPECAT_TOKEN         optional bearer token enforced on /v1/*
  WHISPER_MODEL         faster-whisper model id (default large-v3-turbo)
  WHISPER_DEVICE        cpu | cuda (default cpu)
  WHISPER_COMPUTE_TYPE  int8 | float16 | float32 (default int8)
  PULSE_MONITOR_SOURCE  override for capture source (default: <default>.monitor)
  PULSE_INJECT_SINK     PulseAudio sink for TTS injection (default AgentMic)

Models are loaded lazily on first /v1/capture/start so the container starts
quickly when the voice path is unused.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Generator
from urllib import request as urllib_request

LOG = logging.getLogger("pipecat-sidecar")
logging.basicConfig(
    level=os.environ.get("PIPECAT_LOG_LEVEL", "INFO").upper(),
    format="[pipecat-sidecar] %(asctime)s %(levelname)s %(message)s",
)

PORT = int(os.environ.get("PIPECAT_PORT", "7800"))
HOST = os.environ.get("PIPECAT_HOST", "0.0.0.0")
TOKEN = os.environ.get("PIPECAT_TOKEN", "").strip()
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
DEFAULT_INJECT_SINK = os.environ.get("PULSE_INJECT_SINK", "AgentMic")
DEFAULT_MONITOR_SOURCE = os.environ.get("PULSE_MONITOR_SOURCE", "")
SAMPLE_RATE = 16000
FRAME_MS = 30
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 480
SILENCE_TAIL_MS = 600
MIN_UTTERANCE_MS = 250
MAX_UTTERANCE_MS = 30_000
MAX_BODY_BYTES = 64 * 1024 * 1024  # 64 MiB upper bound for /v1/inject

# ---------------------------------------------------------------------------
# Lazy model + audio backend loading
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_whisper_model: Any = None
_vad_model: Any = None
_sounddevice: Any = None


def _load_models() -> tuple[Any, Any]:
    """Load faster-whisper + silero-vad on first use."""
    global _whisper_model, _vad_model
    with _lock:
        if _whisper_model is None:
            try:
                from faster_whisper import WhisperModel  # type: ignore
            except ImportError as exc:  # pragma: no cover - import guard
                raise RuntimeError(
                    "faster-whisper is not installed inside the desktop-agent image"
                ) from exc
            LOG.info("loading faster-whisper model=%s device=%s compute=%s",
                     WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE)
            _whisper_model = WhisperModel(
                WHISPER_MODEL,
                device=WHISPER_DEVICE,
                compute_type=WHISPER_COMPUTE_TYPE,
            )
        if _vad_model is None:
            try:
                from silero_vad import load_silero_vad  # type: ignore
            except ImportError as exc:  # pragma: no cover - import guard
                raise RuntimeError(
                    "silero-vad is not installed inside the desktop-agent image"
                ) from exc
            LOG.info("loading silero-vad")
            _vad_model = load_silero_vad()
        return _whisper_model, _vad_model


def _load_sounddevice() -> Any:
    global _sounddevice
    with _lock:
        if _sounddevice is None:
            try:
                import sounddevice as sd  # type: ignore
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError("sounddevice not installed") from exc
            _sounddevice = sd
        return _sounddevice


def _pulse_ready() -> bool:
    try:
        out = subprocess.run(
            ["pactl", "info"], capture_output=True, text=True, timeout=2,
        )
        return out.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ---------------------------------------------------------------------------
# Capture session
# ---------------------------------------------------------------------------


class CaptureSession:
    """Owns one capture worker thread for a single meeting session."""

    def __init__(
        self,
        session_id: str,
        callback_url: str,
        callback_token: str | None,
        source: str | None,
    ):
        self.session_id = session_id
        self.callback_url = callback_url
        self.callback_token = callback_token
        self.source = source or DEFAULT_MONITOR_SOURCE
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.utterances = 0
        self.last_callback_status: int | None = None
        self.last_error: str | None = None
        self._audio_q: queue.Queue[bytes] = queue.Queue(maxsize=1024)

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run, name=f"capture-{self.session_id}", daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    # ------------------------------------------------------------------

    def _run(self) -> None:  # pragma: no cover - real audio path
        try:
            whisper, vad = _load_models()
        except Exception as exc:
            self.last_error = f"model load failed: {exc}"
            LOG.exception("[%s] model load failed", self.session_id)
            return

        # Lazy import torch only after models loaded so cold start cost
        # is paid once.
        try:
            import numpy as np  # type: ignore
            import torch  # type: ignore
        except ImportError as exc:
            self.last_error = f"numpy/torch missing: {exc}"
            return

        utt_pcm: list[bytes] = []
        utt_started_at: float | None = None
        silent_ms = 0

        # sounddevice (ALSA) cannot resolve named PulseAudio virtual sources
        # (e.g. "MeetingOut.monitor"). When a source name is given we use a
        # parec(1) subprocess which speaks PulseAudio natively; otherwise we
        # fall back to sounddevice with the ALSA default source.
        if self.source:
            open_ctx = self._parec_capture_ctx(self.source)
        else:
            try:
                sd = _load_sounddevice()
            except Exception as exc:
                self.last_error = f"sounddevice load failed: {exc}"
                LOG.exception("[%s] sounddevice load failed", self.session_id)
                return
            open_ctx = self._sounddevice_capture_ctx(sd)

        LOG.info("[%s] capture started source=%s", self.session_id, self.source or "<default>")
        with open_ctx:
            while not self._stop.is_set():
                try:
                    frame = self._audio_q.get(timeout=0.5)
                except queue.Empty:
                    continue

                try:
                    samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
                    speech_prob = float(vad(torch.from_numpy(samples), SAMPLE_RATE).item())
                except Exception:
                    speech_prob = 0.0

                if speech_prob >= 0.5:
                    if utt_started_at is None:
                        utt_started_at = time.time()
                    utt_pcm.append(frame)
                    silent_ms = 0
                elif utt_started_at is not None:
                    utt_pcm.append(frame)
                    silent_ms += FRAME_MS

                duration_ms = len(utt_pcm) * FRAME_MS
                if utt_started_at is not None and (
                    silent_ms >= SILENCE_TAIL_MS or duration_ms >= MAX_UTTERANCE_MS
                ):
                    if duration_ms >= MIN_UTTERANCE_MS:
                        self._finalize_utterance(
                            whisper, np, b"".join(utt_pcm), utt_started_at,
                        )
                    utt_pcm = []
                    utt_started_at = None
                    silent_ms = 0

        LOG.info("[%s] capture stopped", self.session_id)

    @contextlib.contextmanager
    def _sounddevice_capture_ctx(self, sd: Any) -> Generator[None, None, None]:
        """Capture via sounddevice using the ALSA default PulseAudio source."""
        def _on_audio(indata, _frames, _time_info, _status) -> None:
            try:
                self._audio_q.put_nowait(bytes(indata))
            except queue.Full:
                pass
        try:
            stream = sd.RawInputStream(
                samplerate=SAMPLE_RATE,
                blocksize=FRAME_SAMPLES,
                channels=1,
                dtype="int16",
                callback=_on_audio,
            )
        except Exception as exc:
            self.last_error = f"open input stream failed: {exc}"
            LOG.exception("[%s] open input stream failed", self.session_id)
            raise
        with stream:
            yield

    @contextlib.contextmanager
    def _parec_capture_ctx(self, source: str) -> Generator[None, None, None]:
        """Capture via parec(1) for named PulseAudio sources.

        parec speaks PulseAudio natively so it can address virtual sinks/sources
        (e.g. MeetingOut.monitor) that sounddevice's ALSA backend cannot see.
        """
        frame_bytes = FRAME_SAMPLES * 2  # int16 = 2 bytes per sample
        proc = subprocess.Popen(
            [
                "parec",
                f"--device={source}",
                "--format=s16le",
                "--channels=1",
                f"--rate={SAMPLE_RATE}",
                "--raw",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        stop_feeder = threading.Event()

        def _feed() -> None:
            try:
                while not stop_feeder.is_set():
                    assert proc.stdout is not None
                    data = proc.stdout.read(frame_bytes)
                    if not data or len(data) < frame_bytes:
                        break
                    try:
                        self._audio_q.put_nowait(data)
                    except queue.Full:
                        pass
            finally:
                pass

        feeder = threading.Thread(
            target=_feed, daemon=True, name=f"parec-{source[:24]}",
        )
        feeder.start()
        LOG.info("[%s] parec feeder started source=%s", self.session_id, source)
        try:
            yield
        finally:
            stop_feeder.set()
            proc.terminate()
            proc.wait(timeout=5)
            feeder.join(timeout=3)

    # ------------------------------------------------------------------

    def _finalize_utterance(
        self, whisper: Any, np: Any, pcm_bytes: bytes, started_at: float,
    ) -> None:  # pragma: no cover - real audio path
        try:
            audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            segments, _info = whisper.transcribe(
                audio, language=None, vad_filter=False, beam_size=1,
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
        except Exception as exc:
            self.last_error = f"transcription failed: {exc}"
            LOG.exception("[%s] transcribe failed", self.session_id)
            return

        if not text:
            return

        self.utterances += 1
        ended_at = time.time()
        payload = {
            "session_id": self.session_id,
            "sequence": self.utterances,
            "event": "final",
            "text": text,
            "started_at": _iso(started_at),
            "ended_at": _iso(ended_at),
            "source": "live_capture",
        }
        self._post_callback(payload)

    def _post_callback(self, body: dict[str, Any]) -> None:
        try:
            data = json.dumps(body).encode("utf-8")
            req = urllib_request.Request(
                self.callback_url,
                data=data,
                method="POST",
                headers={"content-type": "application/json"},
            )
            if self.callback_token:
                req.add_header("authorization", f"Bearer {self.callback_token}")
            with urllib_request.urlopen(req, timeout=10) as res:
                self.last_callback_status = int(res.status)
        except Exception as exc:
            self.last_callback_status = -1
            self.last_error = f"callback POST failed: {exc}"
            LOG.warning("[%s] callback POST failed: %s", self.session_id, exc)


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


# ---------------------------------------------------------------------------
# Audio injection
# ---------------------------------------------------------------------------


def inject_audio(audio_bytes: bytes, sink: str) -> int:
    """Pipe arbitrary-format audio through ffmpeg → paplay → PulseAudio sink.

    Returns the number of bytes written to paplay (post-decode).
    """
    if not audio_bytes:
        return 0
    if not _pulse_ready():
        raise RuntimeError("PulseAudio is not running inside the container")

    # ffmpeg decodes anything (mp3/ogg/opus/wav/...) to 16-bit 16k mono PCM
    # which paplay then streams into the named sink.
    ffmpeg = subprocess.Popen(
        [
            "ffmpeg", "-loglevel", "error", "-i", "pipe:0",
            "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1",
        ],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    paplay = subprocess.Popen(
        [
            "paplay", f"--device={sink}",
            "--raw", "--format=s16le", "--rate=16000", "--channels=1",
        ],
        stdin=ffmpeg.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    assert ffmpeg.stdin is not None
    try:
        ffmpeg.stdin.write(audio_bytes)
        ffmpeg.stdin.close()
    except BrokenPipeError:
        pass

    bytes_played = 0
    if ffmpeg.stdout is not None:
        for chunk in iter(lambda: ffmpeg.stdout.read(8192), b""):
            bytes_played += len(chunk)
    ffmpeg.wait(timeout=60)
    paplay.wait(timeout=60)
    if paplay.returncode != 0:
        err = (paplay.stderr.read() if paplay.stderr else b"").decode("utf-8", "replace")
        raise RuntimeError(f"paplay failed (rc={paplay.returncode}): {err.strip()}")
    return bytes_played


# ---------------------------------------------------------------------------
# HTTP control plane
# ---------------------------------------------------------------------------


_sessions: dict[str, CaptureSession] = {}
_sessions_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentFarmPipecat/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003 - stdlib name
        LOG.info(fmt, *args)

    # ------------------------------------------------------------------

    def _read_body(self) -> bytes:
        length = int(self.headers.get("content-length", "0") or 0)
        if length <= 0:
            return b""
        if length > MAX_BODY_BYTES:
            raise ValueError("body too large")
        return self.rfile.read(length)

    def _read_json(self) -> dict[str, Any]:
        body = self._read_body()
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _check_auth(self) -> bool:
        if not TOKEN:
            return True
        auth = self.headers.get("authorization", "")
        return auth == f"Bearer {TOKEN}"

    # ------------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802 - http verb naming
        if self.path == "/health":
            self._send_json(200, {
                "ok": True,
                "capturing": len(_sessions) > 0,
                "model_loaded": _whisper_model is not None,
                "pulse_ready": _pulse_ready(),
            })
            return
        if self.path == "/v1/status":
            if not self._check_auth():
                self._send_json(401, {"error": "unauthorized"})
                return
            with _sessions_lock:
                items = [
                    {
                        "session_id": s.session_id,
                        "utterances": s.utterances,
                        "last_callback_status": s.last_callback_status,
                        "last_error": s.last_error,
                    }
                    for s in _sessions.values()
                ]
            self._send_json(200, {"sessions": items})
            return
        # Diagnostic endpoint: verify PulseAudio source/sink routing.
        # Runs `pactl list short sources` and `pactl list short sinks` and
        # returns the output so operators can confirm MeetingOut.monitor is
        # present and AgentMicSource is the default source without needing a
        # shell inside the container.
        if self.path == "/v1/pulse/sources":
            if not self._check_auth():
                self._send_json(401, {"error": "unauthorized"})
                return
            try:
                sources_out = subprocess.run(
                    ["pactl", "list", "short", "sources"],
                    capture_output=True, text=True, timeout=3,
                )
                sinks_out = subprocess.run(
                    ["pactl", "list", "short", "sinks"],
                    capture_output=True, text=True, timeout=3,
                )
                default_source_out = subprocess.run(
                    ["pactl", "get-default-source"],
                    capture_output=True, text=True, timeout=3,
                )
                default_sink_out = subprocess.run(
                    ["pactl", "get-default-sink"],
                    capture_output=True, text=True, timeout=3,
                )
                self._send_json(200, {
                    "sources": sources_out.stdout.strip(),
                    "sinks": sinks_out.stdout.strip(),
                    "default_source": default_source_out.stdout.strip(),
                    "default_sink": default_sink_out.stdout.strip(),
                    "capture_source": DEFAULT_MONITOR_SOURCE or "(pulse default)",
                    "pulse_ready": _pulse_ready(),
                })
            except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
                self._send_json(503, {"error": f"pactl unavailable: {exc}"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._check_auth():
            self._send_json(401, {"error": "unauthorized"})
            return
        try:
            if self.path == "/v1/capture/start":
                self._handle_start()
                return
            if self.path == "/v1/capture/stop":
                self._handle_stop()
                return
            if self.path.startswith("/v1/inject"):
                self._handle_inject()
                return
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)})
            return
        except Exception as exc:  # pragma: no cover - defensive
            LOG.exception("handler error")
            self._send_json(500, {"error": str(exc)})
            return
        self._send_json(404, {"error": "not found"})

    # ------------------------------------------------------------------

    def _handle_start(self) -> None:
        body = self._read_json()
        session_id = str(body.get("session_id", "")).strip()
        callback_url = str(body.get("callback_url", "")).strip()
        callback_token = body.get("callback_token") or None
        source = body.get("source") or None
        if not session_id:
            raise ValueError("session_id required")
        if not callback_url:
            raise ValueError("callback_url required")

        with _sessions_lock:
            existing = _sessions.get(session_id)
            if existing is not None:
                self._send_json(409, {"error": "session already capturing", "session_id": session_id})
                return
            session = CaptureSession(session_id, callback_url, callback_token, source)
            _sessions[session_id] = session
        session.start()
        self._send_json(202, {"ok": True, "session_id": session_id})

    def _handle_stop(self) -> None:
        body = self._read_json()
        session_id = str(body.get("session_id", "")).strip()
        if not session_id:
            raise ValueError("session_id required")
        with _sessions_lock:
            session = _sessions.pop(session_id, None)
        if session is None:
            self._send_json(404, {"error": "no such session"})
            return
        session.stop()
        self._send_json(200, {
            "ok": True,
            "stopped": True,
            "utterances": session.utterances,
            "last_error": session.last_error,
        })

    def _handle_inject(self) -> None:
        # ?session_id=...&sink=...
        from urllib.parse import parse_qs, urlsplit

        qs = parse_qs(urlsplit(self.path).query)
        sink = (qs.get("sink", [DEFAULT_INJECT_SINK])[0] or DEFAULT_INJECT_SINK).strip()
        body = self._read_body()
        bytes_played = inject_audio(body, sink)
        self._send_json(200, {"ok": True, "bytes_played": bytes_played, "sink": sink})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def _check_imports() -> int:
    """Smoke test invoked by `--check-imports` so CI can verify the image
    has all required Python dependencies without exercising real audio.
    """
    missing: list[str] = []
    for mod in ("faster_whisper", "silero_vad", "sounddevice", "numpy", "soundfile"):
        try:
            __import__(mod)
        except ImportError as exc:
            missing.append(f"{mod}: {exc}")
    if missing:
        for line in missing:
            print(f"MISSING {line}", file=sys.stderr)
        return 1
    print("OK pipecat-sidecar dependencies present", file=sys.stderr)
    return 0


def main() -> None:
    if "--check-imports" in sys.argv:
        sys.exit(_check_imports())

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    LOG.info("pipecat-sidecar listening on %s:%d (whisper=%s)", HOST, PORT, WHISPER_MODEL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("shutting down on SIGINT")
    finally:
        with _sessions_lock:
            for session in list(_sessions.values()):
                session.stop()
            _sessions.clear()
        server.server_close()


if __name__ == "__main__":
    main()
