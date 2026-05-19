#!/bin/bash
# Full restart: PulseAudio stable + Chrome with fixed env

# 1. Kill Chrome
kill -9 $(ps aux | grep -E "[c]hrome|[c]hromium" | grep -v defunct | awk '{print $1}') 2>/dev/null || true
sleep 1

# 2. Kill old PulseAudio (non-zombie)
kill -9 $(ps aux | grep "[p]ulseaudio" | grep -v defunct | awk '{print $1}') 2>/dev/null || true
sleep 1

# 3. Clean stale state
rm -f /tmp/runtime/pulse/pid /tmp/runtime/pulse/native /tmp/runtime/pulse/.lk*
rm -f /tmp/pulse-runtime/pid /tmp/pulse-runtime/native
mkdir -p /tmp/runtime/pulse

# 4. Start dbus session bus for Chrome
if [ ! -S /run/dbus/system_bus_socket ]; then
  mkdir -p /run/dbus
  dbus-daemon --system --fork 2>/dev/null || true
  sleep 0.5
fi
eval $(dbus-launch --sh-syntax 2>/dev/null) || true
export DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-""}

# 5. Start PulseAudio with minimal config - NO virtual-source (it may crash)
export XDG_RUNTIME_DIR=/tmp/runtime
pulseaudio \
  --start \
  --daemonize=yes \
  --exit-idle-time=-1 \
  --disallow-exit \
  --disallow-module-loading=no \
  --log-target=file:/tmp/pa_stable.log \
  --log-level=debug \
  2>&1
sleep 2

# Check if started
if ! pactl info > /dev/null 2>&1; then
  echo "ERROR: PulseAudio failed to start"
  cat /tmp/pa_stable.log | tail -10
  exit 1
fi

echo "PulseAudio started OK"

# 6. Load ONLY null sinks (no virtual-source - that may be crasher)
pactl load-module module-null-sink sink_name=virtual-sink sink_properties=device.description=VirtualSink
pactl load-module module-null-sink sink_name=chrome-output-sink sink_properties=device.description=ChromeOutputSink
pactl set-default-sink virtual-sink
# Use virtual-sink.monitor directly as Chrome's mic (no virtual-source module)
pactl set-default-source virtual-sink.monitor

# Boost monitor volume  
pactl set-source-volume virtual-sink.monitor 150%

# Symlinks
rm -f /run/user/0/pulse/native /tmp/pulse-runtime/native
mkdir -p /run/user/0/pulse /tmp/pulse-runtime
ln -sf /tmp/runtime/pulse/native /run/user/0/pulse/native
ln -sf /tmp/runtime/pulse/native /tmp/pulse-runtime/native

echo "Sources:"
pactl list sources short

# 7. Launch Chrome in APP MODE (no address bar, opens directly to Meet)
#    --app=URL  → frameless window, same as "Install as app" on Linux
#    --remote-debugging-port=9222  → CDP for reliable element-based joining
export DISPLAY=:1
export PULSE_SERVER=unix:/tmp/runtime/pulse/native
export PULSE_RUNTIME_PATH=/tmp/runtime/pulse
unset PULSE_SINK

CHROME_BIN=$(which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null || which chromium-browser 2>/dev/null || which chromium 2>/dev/null)
echo "Launching: $CHROME_BIN"

"$CHROME_BIN" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --use-fake-ui-for-media-stream \
  --window-size=1280,720 \
  --remote-debugging-port=9222 \
  --remote-allow-origins=http://localhost:9222 \
  --user-data-dir=/tmp/chrome-profile-stable \
  --app="https://meet.google.com/zbj-emfq-vvf" \
  > /tmp/chrome-stable.log 2>&1 &

CHROME_PID=$!
echo "Chrome PID=$CHROME_PID"
sleep 8

# 8. Load virtual-source so Chrome receives agent audio as its microphone input
#    virtual-source monitors virtual-sink → agent paplay → Chrome mic → Meet
pactl load-module module-virtual-source source_name=virtual-source master=virtual-sink.monitor 2>/dev/null || true
pactl set-default-source virtual-source
pactl set-source-volume virtual-source 150%
echo "virtual-source loaded (Chrome mic = agent voice)"

# 9. Route Chrome's PLAYBACK to chrome-output-sink
#    This separates Hari's incoming Meet audio from agent's outgoing voice.
#    parec from chrome-output-sink.monitor → ONLY Hari's voice (zero agent echo).
sleep 3
CHROME_SI=$(pactl list sink-inputs short | awk 'NR==1{print $1}')
if [ -n "$CHROME_SI" ]; then
  pactl move-sink-input "$CHROME_SI" chrome-output-sink
  echo "Chrome sink-input $CHROME_SI moved to chrome-output-sink (Hari's voice isolated)"
else
  echo "WARNING: No Chrome sink-input found -- Chrome may still be loading"
fi

echo "=== Audio routing after Chrome ==="
pactl list sources short
pactl list sink-inputs short

# 10. Join the meeting via CDP (element-based, not pixel coordinates)
echo "=== Joining Meet via CDP ==="
python3 /tmp/join_meet.py

echo "=== Launch complete. Chrome PID=$CHROME_PID ==="
echo "=== Run: python3 /tmp/conversation_agent.py ==="
