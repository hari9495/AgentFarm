import os
import io
import uuid
import logging
from flask import Flask, request, jsonify, send_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# TODO: Replace with real VoxCPM2 HuggingFace model ID when available
# e.g. "myorg/voxcpm2" — swap the string below and remove this comment
MODEL_ID = os.environ.get("VOXCPM2_MODEL_ID", "TODO/voxcpm2-placeholder")
SAMPLE_RATE = int(os.environ.get("SAMPLE_RATE", "48000"))

model = None
processor = None

def load_model():
    global model, processor
    try:
        logger.info(f"Loading VoxCPM2 model from HuggingFace: {MODEL_ID}")
        from voxcpm import VoxCPM
        model = VoxCPM.from_pretrained(MODEL_ID)
        model.eval()
        processor = None
        logger.info("VoxCPM2 model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}. Running in stub mode.")
        model = None
        processor = None

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if model is not None else "stub",
        "model_id": MODEL_ID,
        "sample_rate": SAMPLE_RATE
    })

@app.route("/v1/synthesize", methods=["POST"])
def synthesize():
    data = request.get_json(force=True)
    text = data.get("text", "")
    language = data.get("language", "en")
    voice_id = data.get("voice_id")

    if model is None:
        # stub: return 1 second of WAV silence
        import wave, struct
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(struct.pack("<" + "h" * SAMPLE_RATE, *([0] * SAMPLE_RATE)))
        buf.seek(0)
        return send_file(buf, mimetype="audio/wav")

    try:
        import soundfile as sf
        wav = model.generate(
            text=text,
            reference_wav_path=None,
            cfg_value=2.0,
            inference_timesteps=10,
        )
        buf = io.BytesIO()
        sf.write(buf, wav, model.tts_model.sample_rate, format='WAV')
        buf.seek(0)
        return send_file(buf, mimetype="audio/wav")
    except Exception as e:
        logger.error(f"Synthesis error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/v1/clone-voice", methods=["POST"])
def clone_voice():
    # Voice cloning requires a real model — stub returns a UUID for now
    voice_id = str(uuid.uuid4())
    return jsonify({"voice_id": voice_id, "status": "cloned"})

@app.route("/v1/voices", methods=["GET"])
def list_voices():
    return jsonify({"voices": []})

if __name__ == "__main__":
    load_model()
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port)
