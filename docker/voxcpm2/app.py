import io
import os
import time
import uuid
import logging
import struct
import wave
from flask import Flask, request, jsonify, send_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

SAMPLE_RATE = int(os.environ.get("SAMPLE_RATE", "22050"))

# ---------------------------------------------------------------------------
# pyttsx3 initialisation (espeak backend on Linux)
# ---------------------------------------------------------------------------
_engine = None


def _init_engine():
    global _engine
    try:
        import pyttsx3
        _engine = pyttsx3.init()
        voices = _engine.getProperty("voices")
        logger.info(
            "pyttsx3 initialised. %d voice(s) available.",
            len(voices) if voices else 0,
        )
    except Exception as exc:
        logger.warning("pyttsx3 unavailable (%s). Falling back to silent stub.", exc)
        _engine = None


def _engine_voices():
    if _engine is None:
        return []
    try:
        voices = _engine.getProperty("voices") or []
        return [
            {
                "id": v.id,
                "name": v.name,
                "language": (v.languages[0] if v.languages else "en"),
            }
            for v in voices
        ]
    except Exception:
        return []


def _synthesize_with_pyttsx3(text: str, voice_id: str | None) -> bytes:
    """Render `text` to a WAV buffer using pyttsx3. Raises on error."""
    if _engine is None:
        raise RuntimeError("pyttsx3 engine not available")

    if voice_id:
        _engine.setProperty("voice", voice_id)

    tmp_path = f"/tmp/tts_{uuid.uuid4().hex}.wav"
    try:
        _engine.save_to_file(text, tmp_path)
        _engine.runAndWait()
        with open(tmp_path, "rb") as f:
            data = f.read()
        return data
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _silent_wav(duration_s: float = 1.0) -> bytes:
    """Generate WAV silence of the given duration."""
    n_samples = int(SAMPLE_RATE * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(struct.pack("<" + "h" * n_samples, *([0] * n_samples)))
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok" if _engine is not None else "stub",
            "engine": "pyttsx3" if _engine is not None else "silent",
            "sample_rate": SAMPLE_RATE,
        }
    )


@app.route("/v1/synthesize", methods=["POST"])
def synthesize():
    data = request.get_json(force=True) or {}
    text = str(data.get("text", ""))
    language = str(data.get("language", "en"))
    voice_id = data.get("voice_id")

    if not text:
        return jsonify({"error": "text is required"}), 400

    t0 = time.monotonic()
    try:
        wav_bytes = _synthesize_with_pyttsx3(text, voice_id)
        source = "pyttsx3"
    except Exception as exc:
        logger.warning("TTS synthesis failed (%s). Returning silence.", exc)
        wav_bytes = _silent_wav(1.0)
        source = "stub"

    duration_ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        "synthesize method=%s text_len=%d language=%s duration_ms=%d",
        source,
        len(text),
        language,
        duration_ms,
    )

    return send_file(
        io.BytesIO(wav_bytes),
        mimetype="audio/wav",
        as_attachment=False,
    )


@app.route("/v1/voices", methods=["GET"])
def list_voices():
    return jsonify({"voices": _engine_voices()})


@app.route("/v1/clone-voice", methods=["POST"])
def clone_voice():
    # Full voice cloning requires a neural model; return a stub ID.
    voice_id = str(uuid.uuid4())
    logger.info("clone-voice stub called — returning voice_id %s", voice_id)
    return jsonify({"voice_id": voice_id, "status": "stub"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _init_engine()
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port)

