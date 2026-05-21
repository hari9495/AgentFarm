#!/usr/bin/env bash
# Entrypoint for the AgentFarm Desktop Agent container.
# Starts the virtual display stack, VNC, noVNC web proxy, and the agent process.

set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
XVFB_SCREEN="${XVFB_SCREEN:-1280x800x24}"
NOVNC_HOME="${NOVNC_HOME:-/opt/novnc}"
AGENT_SCRIPT="${AGENT_SCRIPT:-/app/agent-entrypoint.js}"

echo "[desktop-agent] Starting Xvfb on display ${DISPLAY_NUM} (${XVFB_SCREEN})"
Xvfb "${DISPLAY_NUM}" -screen 0 "${XVFB_SCREEN}" -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait until the display is ready
for i in $(seq 1 20); do
    DISPLAY="${DISPLAY_NUM}" xdotool getactivewindow >/dev/null 2>&1 && break
    sleep 0.5
done

echo "[desktop-agent] Starting openbox window manager"
DISPLAY="${DISPLAY_NUM}" openbox --startup "" &

echo "[desktop-agent] Starting x11vnc on port ${VNC_PORT}"
x11vnc -display "${DISPLAY_NUM}" \
    -nopw \
    -listen 127.0.0.1 \
    -port "${VNC_PORT}" \
    -forever \
    -shared \
    -rfbversion 3.8 \
    -quiet &
X11VNC_PID=$!

echo "[desktop-agent] Starting noVNC websockify on port ${NOVNC_PORT}"
websockify \
    --web "${NOVNC_HOME}" \
    --heartbeat 30 \
    "${NOVNC_PORT}" \
    "127.0.0.1:${VNC_PORT}" &
NOVNC_PID=$!

echo "[desktop-agent] All display services started. noVNC accessible at http://localhost:${NOVNC_PORT}/vnc.html"

# ── Voice sidecar (pipecat_sidecar.py) ───────────────────────────────────────
# Optional — gated by ENABLE_VOICE_SIDECAR=1. When enabled we configure
# PulseAudio (virtual mic + monitor source) then launch the Python sidecar
# that exposes /v1/capture/start, /v1/capture/stop, /v1/inject. The Node
# agent on port 5003 is unaffected; the sidecar listens on PIPECAT_PORT
# (default 7800) and shares lifecycle with this entrypoint.
PIPECAT_PID=""
if [ "${ENABLE_VOICE_SIDECAR:-0}" = "1" ]; then
    if [ -x /app/pulse-setup.sh ]; then
        /app/pulse-setup.sh || echo "[desktop-agent] pulse-setup.sh exited non-zero (voice path degraded)"
        # AgentMicSource is the virtual mic Teams (and all new Chrome connections)
        # should read from. The pipecat sidecar uses PULSE_MONITOR_SOURCE to
        # explicitly target MeetingOut.monitor via parec, so the default does
        # not need to point there.
        pactl set-default-source AgentMicSource 2>/dev/null && \
            echo "[desktop-agent] PulseAudio default source → AgentMicSource" || \
            echo "[desktop-agent] Warning: could not set default PulseAudio source"
    fi
    if [ -f /app/pipecat_sidecar.py ]; then
        echo "[desktop-agent] Starting pipecat voice sidecar on port ${PIPECAT_PORT:-7800}"
        PULSE_MONITOR_SOURCE="MeetingOut.monitor" python3 /app/pipecat_sidecar.py &
        PIPECAT_PID=$!
    else
        echo "[desktop-agent] pipecat_sidecar.py missing — voice path disabled"
    fi
else
    echo "[desktop-agent] ENABLE_VOICE_SIDECAR != 1 — voice sidecar not started"
fi

# Graceful shutdown on SIGTERM / SIGINT
cleanup() {
    echo "[desktop-agent] Shutting down..."
    if [ -n "${PIPECAT_PID}" ]; then
        kill "${PIPECAT_PID}" 2>/dev/null || true
    fi
    kill "${NOVNC_PID}" "${X11VNC_PID}" "${XVFB_PID}" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

# Launch the Node.js agent process (runs in foreground — this is PID 1's main job)
if [ -f "${AGENT_SCRIPT}" ]; then
    echo "[desktop-agent] Starting agent process: node ${AGENT_SCRIPT}"
    DISPLAY="${DISPLAY_NUM}" exec node "${AGENT_SCRIPT}"
else
    echo "[desktop-agent] AGENT_SCRIPT not found at ${AGENT_SCRIPT}. Staying alive for manual use."
    wait "${XVFB_PID}"
fi
