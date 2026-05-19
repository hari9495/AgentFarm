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

# Graceful shutdown on SIGTERM / SIGINT
cleanup() {
    echo "[desktop-agent] Shutting down..."
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
