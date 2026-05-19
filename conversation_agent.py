#!/usr/bin/env python3
# AgentFarm Conversation Agent -- Human Voice + Real-Time Conversation
# Voice: Microsoft Jenny Neural (edge-tts)
# STT  : Whisper tiny (local, offline, no API key)
# LLM  : OpenAI | Groq | Ollama
#
# SETUP: In your PowerShell terminal type:
#   docker exec agentfarm-desktop-agent bash -c "echo 'sk-proj-YOUR-KEY' > /tmp/.openai_key"
# Then run:
#   docker exec -it agentfarm-desktop-agent python3 -u /tmp/conversation_agent.py

import asyncio
import subprocess
import os
import sys
import json
import struct
import wave
import time
import urllib.request

# ── key loading (env var OR /tmp/.openai_key file) ────────────────────────────
def _load_key(env_var: str, key_file: str = "") -> str:
    val = os.environ.get(env_var, "").strip()
    if val:
        return val
    if key_file:
        try:
            return open(key_file).read().strip()
        except Exception:
            pass
    return ""

OPENAI_KEY = _load_key("OPENAI_API_KEY", "/tmp/.openai_key")
GROQ_KEY   = _load_key("GROQ_API_KEY",   "/tmp/.groq_key")

# ── config ────────────────────────────────────────────────────────────────────
PA_ENV = {
    "XDG_RUNTIME_DIR": "/tmp/runtime",
    "PULSE_SERVER": "unix:/tmp/runtime/pulse/native",
}

RECORD_SOURCE  = "chrome-output-sink.monitor"
PLAY_SINK      = "virtual-sink"
RECORD_SECONDS = 5
SILENCE_THRESH = 200
EDGE_VOICE     = "en-US-JennyNeural"
WHISPER_MODEL  = "tiny"

OLLAMA_HOST   = "http://host.docker.internal:11434"
OLLAMA_MODEL  = "llama3.2"
GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL    = "llama3-8b-8192"
OPENAI_URL    = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL  = "gpt-4o-mini"

SYSTEM_PROMPT = (
    "You are AgentFarm AI on a Google Meet call with Hari Nani. "
    "Keep every response SHORT -- 1 to 3 sentences only. "
    "Be warm, friendly, and natural. No bullet points, no markdown. "
    "Speak plainly as in a real voice conversation."
)

# Global speaking lock -- prevents recording while agent is speaking
_speaking = False
# Cooldown: number of full recording turns to skip after speaking (echo guard)
_cooldown_turns = 0


# ── audio ─────────────────────────────────────────────────────────────────────

def record_wav(outfile: str, duration: int) -> bool:
    """Record from chrome-output-sink.monitor and write WAV."""
    byte_count = 16000 * 2 * duration
    pcm = "/tmp/_raw.pcm"
    env = {**os.environ, **PA_ENV}
    cmd = (
        f"parec --device={RECORD_SOURCE} --format=s16le --rate=16000 "
        f"--channels=1 --latency-msec=100 2>/dev/null "
        f"| dd of={pcm} bs=1 count={byte_count} 2>/dev/null"
    )
    subprocess.run(cmd, shell=True, env=env, timeout=duration + 3)
    try:
        raw = open(pcm, "rb").read()
    except FileNotFoundError:
        return False
    if len(raw) < 3200:
        return False
    with wave.open(outfile, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(raw)
    return True


def rms_wav(path: str) -> float:
    try:
        with wave.open(path, "rb") as wf:
            frames = wf.readframes(wf.getnframes())
        samples = struct.unpack(f"{len(frames)//2}h", frames)
        return (sum(s * s for s in samples) / len(samples)) ** 0.5
    except Exception:
        return 0.0


async def speak(text: str):
    """Speak through Jenny Neural voice into Meet. Sets speaking lock."""
    global _speaking
    import edge_tts
    print(f"  [AGENT] {text}")
    sys.stdout.flush()
    mp3, wav = "/tmp/_reply.mp3", "/tmp/_reply.wav"
    await edge_tts.Communicate(text, EDGE_VOICE).save(mp3)
    subprocess.run(
        f"ffmpeg -i {mp3} -ar 44100 -ac 2 {wav} -y -loglevel quiet",
        shell=True,
    )
    _speaking = True
    env = {**os.environ, **PA_ENV}
    subprocess.run(f"paplay --device={PLAY_SINK} {wav}", shell=True, env=env)
    _speaking = False
    _cooldown_turns = 1  # skip next recording window entirely (echo guard)


# ── LLM ──────────────────────────────────────────────────────────────────────

def _post(url: str, data: dict, headers: dict) -> dict:
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json", **headers},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def detect_llm() -> str:
    if OPENAI_KEY:
        print(f"  [LLM] OpenAI active ({OPENAI_MODEL})")
        return "openai"
    if GROQ_KEY:
        print(f"  [LLM] Groq active ({GROQ_MODEL})")
        return "groq"
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=3) as r:
            models = [m["name"] for m in json.loads(r.read()).get("models", [])]
            print(f"  [LLM] Ollama online -- models: {models}")
            return "ollama"
    except Exception:
        pass
    return "none"


def llm_reply(history: list, backend: str) -> str:
    try:
        if backend == "openai":
            d = _post(
                OPENAI_URL,
                {"model": OPENAI_MODEL, "messages": history, "max_tokens": 150},
                {"Authorization": f"Bearer {OPENAI_KEY}"},
            )
            return d["choices"][0]["message"]["content"].strip()
        if backend == "groq":
            d = _post(
                GROQ_URL,
                {"model": GROQ_MODEL, "messages": history, "max_tokens": 150},
                {"Authorization": f"Bearer {GROQ_KEY}"},
            )
            return d["choices"][0]["message"]["content"].strip()
        if backend == "ollama":
            d = _post(
                f"{OLLAMA_HOST}/api/chat",
                {"model": OLLAMA_MODEL, "messages": history, "stream": False},
                {},
            )
            return d["message"]["content"].strip()
    except Exception as e:
        return f"I had a thinking error: {e}"
    return "I need an LLM key to think -- set OPENAI_API_KEY!"


# ── meetguard ─────────────────────────────────────────────────────────────────

async def meetguard():
    """Background task: warn every 60s if Meet tab is no longer in Chrome."""
    await asyncio.sleep(30)  # initial grace period
    while True:
        await asyncio.sleep(60)
        try:
            with urllib.request.urlopen("http://localhost:9222/json", timeout=3) as r:
                tabs = json.loads(r.read())
            if not any("meet.google.com" in t.get("url", "") for t in tabs):
                print("\n  [MEETGUARD] WARNING: Meet tab missing from Chrome!")
                print("  [MEETGUARD] Run: python3 /tmp/join_meet.py  to rejoin\n")
                sys.stdout.flush()
        except Exception:
            pass  # Chrome may be briefly busy -- don't crash the agent


# ── main ──────────────────────────────────────────────────────────────────────

async def main():
    print("\n" + "=" * 60)
    print("  AgentFarm Conversation Agent")
    print("=" * 60 + "\n")

    backend = detect_llm()

    if backend == "none":
        print("  [!] No LLM key found.")
        print("  Run this in PowerShell:")
        print('  docker exec agentfarm-desktop-agent bash -c "echo \'sk-proj-...\' > /tmp/.openai_key"')
        print("  Then restart the agent.\n")

    greeting = (
        "Hello Hari Nani! I am AgentFarm AI. "
        + (
            "I am connected and ready. Go ahead and talk to me!"
            if backend != "none"
            else "I can speak but I need an OpenAI key to think. Please set it up!"
        )
    )
    await speak(greeting)

    print("  [STT] Loading Whisper model...")
    sys.stdout.flush()
    from faster_whisper import WhisperModel
    stt = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    print("  [STT] Whisper ready!\n")

    history = [{"role": "system", "content": SYSTEM_PROMPT}]
    turn = 0

    # Start background meetguard watcher
    asyncio.create_task(meetguard())

    print(f"  Listening on: {RECORD_SOURCE}")
    print("  Speak in Google Meet -- I will respond.\n")
    sys.stdout.flush()

    while True:
        # Skip recording while agent is speaking to avoid echo
        if _speaking:
            await asyncio.sleep(0.2)
            continue

        # Skip one full window after speaking (echo cooldown -- cleaner than time.sleep)
        if _cooldown_turns > 0:
            _cooldown_turns -= 1
            print(f"  [ECHO-GUARD] Post-speech cooldown -- skipping window ({RECORD_SECONDS}s)")
            sys.stdout.flush()
            await asyncio.sleep(RECORD_SECONDS)
            continue

        turn += 1
        wav = f"/tmp/_rec{turn % 10}.wav"
        print(f"  [LISTEN] Turn {turn} -- {RECORD_SECONDS}s window...")
        sys.stdout.flush()

        if not record_wav(wav, RECORD_SECONDS):
            print("  [LISTEN] No audio, retrying...")
            continue

        # Skip if agent started speaking mid-recording
        if _speaking:
            print("  [LISTEN] Agent speaking -- discarding captured audio")
            continue

        rms = rms_wav(wav)
        print(f"  [AMP] RMS={rms:.0f}  (threshold={SILENCE_THRESH})")
        sys.stdout.flush()

        if rms < SILENCE_THRESH:
            print("  [LISTEN] Silence -- waiting for you to speak...")
            continue

        print("  [STT] Transcribing...")
        sys.stdout.flush()
        segs, _ = stt.transcribe(wav, beam_size=1, language="en")
        user_text = " ".join(s.text.strip() for s in segs).strip()

        if not user_text or len(user_text) < 3:
            print("  [STT] Empty transcript, skipping...")
            continue

        print(f"  [HARI]  '{user_text}'")

        if backend != "none":
            history.append({"role": "user", "content": user_text})
            reply = llm_reply(history, backend)
            history.append({"role": "assistant", "content": reply})
            if len(history) > 21:
                history = [history[0]] + history[-20:]
        else:
            reply = "I heard you but I need an OpenAI key to reply properly!"

        await speak(reply)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nGoodbye!")
