#!/bin/bash
# entrypoint.sh — start Xvfb, lightweight desktop, VNC, noVNC, PulseAudio, avatar pipeline, then Flask API

set -e

DISPLAY="${DISPLAY:-:1}"
VNC_PORT="${VNC_PORT:-5901}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
APP_PORT="${APP_PORT:-5003}"
RESOLUTION="${RESOLUTION:-1280x800x24}"

echo "[desktop-agent] Starting Xvfb on display ${DISPLAY} at ${RESOLUTION}"
Xvfb "${DISPLAY}" -screen 0 "${RESOLUTION}" -nolisten tcp -ac &
XVFB_PID=$!
sleep 2

echo "[desktop-agent] Starting Openbox desktop"
DISPLAY="${DISPLAY}" openbox-session &
sleep 1

# ── PulseAudio virtual audio ─────────────────────────────────────────────────
# Provides a virtual microphone (virtual-source) and virtual speaker (virtual-sink).
# Chrome uses virtual-source as its microphone input in meeting calls.
# TTS audio is routed to virtual-sink so meeting participants hear the agent speak.
# Audio captured from virtual-sink.monitor is sent to Voicebox for transcription.
echo "[desktop-agent] Starting PulseAudio"
mkdir -p /tmp/pulse
export PULSE_RUNTIME_PATH=/tmp/pulse
export XDG_RUNTIME_DIR=/tmp/runtime
mkdir -p "$XDG_RUNTIME_DIR"
# Unset PULSE_SERVER during start so pulseaudio doesn't refuse with "user-configured server"
env -u PULSE_SERVER pulseaudio --start \
    --daemonize=yes \
    --disallow-exit \
    --disallow-module-loading=no \
    --exit-idle-time=-1 \
    --log-level=error \
    2>/dev/null || true
sleep 2
export PULSE_SERVER="unix:/tmp/pulse/native"

# Create virtual sink (virtual speaker) and loopback virtual source (virtual mic)
pactl load-module module-null-sink sink_name=virtual-sink sink_properties=device.description=VirtualSink 2>/dev/null || true
# chrome-output-sink: Chrome routes its speaker output here; capture-audio records from its monitor.
pactl load-module module-null-sink sink_name=chrome-output-sink sink_properties=device.description=ChromeOutputSink 2>/dev/null || true
# virtual-source: loopback from virtual-sink.monitor so Chrome uses it as its microphone.
# When we paplay to virtual-sink, Chrome picks it up and meeting participants hear the agent.
pactl load-module module-virtual-source source_name=virtual-source master=virtual-sink.monitor source_properties=device.description=VirtualSource 2>/dev/null || true
pactl set-default-sink virtual-sink 2>/dev/null || true
pactl set-default-source virtual-source 2>/dev/null || true
# Symlink PulseAudio socket to standard XDG path so Chrome finds it automatically.
mkdir -p /run/user/0/pulse
ln -sf "${PULSE_RUNTIME_PATH:-/tmp/pulse-runtime}/native" /run/user/0/pulse/native 2>/dev/null || true
echo "[desktop-agent] PulseAudio virtual audio ready (sink=virtual-sink, chrome-output-sink, source=virtual-source)"

# ── Avatar video loop ─────────────────────────────────────────────────────────
# Streams a pre-rendered avatar video through a named FIFO so Chromium can use
# it as a fake camera via --use-file-for-fake-video-capture.
# State switching (idle vs talking) is handled by app.py killing and restarting
# this ffmpeg process with the appropriate source file.
echo "[desktop-agent] Starting avatar idle video loop"
mkfifo /tmp/avatar.fifo 2>/dev/null || true
# Loop the idle avatar y4m file indefinitely into the FIFO in the background.
# The FIFO will block until a reader (Chromium) connects; we run it in a subshell
# so that the blocking does not stall the entrypoint.
(while true; do cat /app/avatar-idle.y4m > /tmp/avatar.fifo 2>/dev/null || sleep 0.1; done) &
AVATAR_PID=$!
echo "[desktop-agent] Avatar loop PID ${AVATAR_PID}"

# ── VNC + noVNC ───────────────────────────────────────────────────────────────
echo "[desktop-agent] Starting x11vnc on port ${VNC_PORT}"
x11vnc -display "${DISPLAY}" -nopw -forever -rfbport "${VNC_PORT}" -quiet -bg || true
sleep 1

echo "[desktop-agent] Starting noVNC WebSocket proxy on port ${NOVNC_PORT}"
websockify --web /usr/share/novnc "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
sleep 1

echo "[desktop-agent] Starting Flask API on port ${APP_PORT}"
export DISPLAY="${DISPLAY}"
exec python3 /app/app.py
