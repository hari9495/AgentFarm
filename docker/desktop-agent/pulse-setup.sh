#!/usr/bin/env bash
# Configure PulseAudio inside the desktop-agent container so the meeting
# client sees a virtual microphone whose feed is whatever the meeting-agent
# pipes into the AgentMic sink, AND so the pipecat sidecar can capture from
# the meeting client's audio output (i.e. what other participants are saying).
#
# Layout once this script finishes:
#
#   AgentMic              null-sink   ←  paplay --device=AgentMic  (TTS in)
#   AgentMic.monitor      monitor of AgentMic
#   AgentMicSource        remap-source from AgentMic.monitor
#                         (default source — meeting client uses this as mic)
#
#   MeetingOut            null-sink   ←  Chromium audio output (participants)
#   MeetingOut.monitor    monitor  →   pipecat sidecar captures this for STT
#                         (set as PulseAudio default sink so Chromium routes
#                          its output here automatically)
#
# The script is idempotent: it only loads modules that aren't already
# present so re-running it during development doesn't stack duplicates.

set -euo pipefail

PULSE_LOG="${PULSE_LOG:-/tmp/pulseaudio.log}"
SINK_NAME="${PULSE_INJECT_SINK:-AgentMic}"
SOURCE_NAME="${SINK_NAME}Source"
MEETING_OUT_SINK="MeetingOut"

if ! command -v pulseaudio >/dev/null 2>&1; then
    echo "[pulse-setup] pulseaudio binary not found — skipping (voice path disabled)"
    exit 0
fi

echo "[pulse-setup] starting PulseAudio (user mode)"
pulseaudio \
    --start \
    --exit-idle-time=-1 \
    --disallow-exit \
    --log-target=file:"${PULSE_LOG}" \
    || echo "[pulse-setup] PulseAudio already running"

# Wait until the daemon is ready
for _ in $(seq 1 20); do
    if pactl info >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done

if ! pactl info >/dev/null 2>&1; then
    echo "[pulse-setup] PulseAudio failed to start — voice path disabled"
    cat "${PULSE_LOG}" 2>/dev/null || true
    exit 0
fi

# Helper: load a module only if no existing module advertises the same name
ensure_module() {
    local module="$1"
    local match="$2"
    shift 2
    if pactl list short modules | grep -q "${match}"; then
        echo "[pulse-setup] module ${module} (${match}) already loaded"
        return 0
    fi
    echo "[pulse-setup] loading ${module} $*"
    pactl load-module "${module}" "$@" >/dev/null
}

ensure_module module-null-sink "sink_name=${SINK_NAME}" \
    "sink_name=${SINK_NAME}" \
    "sink_properties=device.description=${SINK_NAME}"

ensure_module module-remap-source "source_name=${SOURCE_NAME}" \
    "source_name=${SOURCE_NAME}" \
    "master=${SINK_NAME}.monitor" \
    "source_properties=device.description=${SOURCE_NAME}"

# MeetingOut: null-sink that captures Chromium's audio output so the
# pipecat sidecar can hear what meeting participants are saying.
ensure_module module-null-sink "sink_name=${MEETING_OUT_SINK}" \
    "sink_name=${MEETING_OUT_SINK}" \
    "sink_properties=device.description=${MEETING_OUT_SINK}"

# Make MeetingOut the default output sink — Chromium will route its audio
# (participant speech) here, and pipecat captures MeetingOut.monitor.
pactl set-default-sink "${MEETING_OUT_SINK}" || true

# Make the remap source the default microphone so any meeting client picks
# it up automatically.
pactl set-default-source "${SOURCE_NAME}" || true

echo "[pulse-setup] PulseAudio ready: default-sink=$(pactl get-default-sink) default-source=$(pactl get-default-source)"
