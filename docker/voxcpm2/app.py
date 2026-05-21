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


# ---------------------------------------------------------------------------
# faster-whisper STT initialisation (lazy — loaded on first /v1/transcribe call)
# ---------------------------------------------------------------------------
_whisper_model = None


def _get_whisper_model():
    """Return the shared WhisperModel, loading it on first call."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel  # type: ignore[import]
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
        logger.info("faster-whisper tiny model loaded (CPU, int8).")
    except Exception as exc:
        logger.warning("faster-whisper unavailable (%s). STT will use stub.", exc)
        _whisper_model = None
    return _whisper_model


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


@app.route("/v1/audio/speech", methods=["POST"])
def openai_audio_speech():
    """OpenAI-compatible TTS endpoint consumed by ``SupertonicClient``.

    The meeting-agent ``SupertonicClient`` POSTs requests shaped like the
    OpenAI ``/v1/audio/speech`` API (``{ model, input, voice?, response_format? }``)
    and expects audio bytes in the response body. We delegate to the same
    pyttsx3 path used by ``/v1/synthesize`` so this container can serve
    both the legacy internal callers and the new meeting-agent fan-out.
    """
    data = request.get_json(force=True) or {}
    text = str(data.get("input") or data.get("text") or "").strip()
    voice_id = data.get("voice")
    if not text:
        return jsonify({"error": "input is required"}), 400

    t0 = time.monotonic()
    try:
        wav_bytes = _synthesize_with_pyttsx3(text, voice_id)
        source = "pyttsx3"
    except Exception as exc:
        logger.warning("openai-speech synthesis failed (%s). Returning silence.", exc)
        wav_bytes = _silent_wav(1.0)
        source = "stub"

    duration_ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        "openai-speech method=%s text_len=%d duration_ms=%d",
        source,
        len(text),
        duration_ms,
    )
    return send_file(io.BytesIO(wav_bytes), mimetype="audio/wav", as_attachment=False)


@app.route("/v1/clone-voice", methods=["POST"])
def clone_voice():
    # Full voice cloning requires a neural model; return a stub ID.
    voice_id = str(uuid.uuid4())
    logger.info("clone-voice stub called — returning voice_id %s", voice_id)
    return jsonify({"voice_id": voice_id, "status": "stub"})


@app.route("/v1/transcribe", methods=["POST"])
def transcribe():
    """Transcribe audio to text using faster-whisper (tiny model, CPU).

    Accepts either:
    - multipart/form-data with an ``audio`` file field, or
    - raw audio bytes as the request body (Content-Type: audio/wav or audio/*).

    Returns JSON: {"text": str, "confidence": float, "words": list, "duration_ms": int, "source": str}
    """
    t0 = time.monotonic()

    # --- resolve audio bytes ---
    audio_bytes: bytes | None = None
    if request.files.get("audio"):
        audio_bytes = request.files["audio"].read()
    elif request.data:
        audio_bytes = request.data

    if not audio_bytes:
        return jsonify({"error": "No audio provided. Send multipart 'audio' field or raw bytes body."}), 400

    # --- write to temp file for whisper ---
    tmp_path = f"/tmp/stt_{uuid.uuid4().hex}.wav"
    try:
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)

        model = _get_whisper_model()
        if model is not None:
            segments, info = model.transcribe(tmp_path, beam_size=1)
            texts = []
            all_words = []
            total_confidence = 0.0
            segment_count = 0
            for seg in segments:
                texts.append(seg.text.strip())
                segment_count += 1
                if hasattr(seg, "words") and seg.words:
                    for w in seg.words:
                        all_words.append({"word": w.word, "start": w.start, "end": w.end, "probability": w.probability})
                        total_confidence += w.probability
            full_text = " ".join(texts).strip()
            avg_confidence = (total_confidence / len(all_words)) if all_words else 0.9
            duration_ms = int((time.monotonic() - t0) * 1000)
            logger.info("transcribe whisper text_len=%d confidence=%.2f duration_ms=%d", len(full_text), avg_confidence, duration_ms)
            return jsonify({
                "text": full_text,
                "confidence": round(avg_confidence, 4),
                "words": all_words,
                "duration_ms": duration_ms,
                "source": "whisper",
            })
        else:
            # stub fallback — no model available
            duration_ms = int((time.monotonic() - t0) * 1000)
            logger.warning("transcribe stub fallback (no whisper model) duration_ms=%d", duration_ms)
            return jsonify({
                "text": "",
                "confidence": 0.0,
                "words": [],
                "duration_ms": duration_ms,
                "source": "stub",
            })
    except Exception as exc:
        logger.error("transcribe error: %s", exc)
        duration_ms = int((time.monotonic() - t0) * 1000)
        return jsonify({
            "text": "",
            "confidence": 0.0,
            "words": [],
            "duration_ms": duration_ms,
            "source": "stub",
            "error": str(exc),
        }), 200  # 200 so callers always get a usable response
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _init_engine()
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port)

