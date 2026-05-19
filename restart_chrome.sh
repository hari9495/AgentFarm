#!/bin/bash
# Kill all Chrome processes
pkill -f "chrome" 2>/dev/null || true
pkill -f "chromium" 2>/dev/null || true
sleep 2

# Verify killed
CHROME_COUNT=$(ps aux | grep -E "[c]hrome|[c]hromium" | grep -v defunct | wc -l)
echo "Chrome processes after kill: $CHROME_COUNT"

# Set up environment pointing to new PulseAudio socket
export DISPLAY=:1
export XDG_RUNTIME_DIR=/tmp/runtime
export PULSE_SERVER=unix:/tmp/runtime/pulse/native
export PULSE_RUNTIME_PATH=/tmp/runtime/pulse
export PULSE_SINK=chrome-output-sink

# Verify PulseAudio is reachable
pactl info 2>&1 | head -2
pactl list sources short

# Launch Chrome with the meeting URL
CHROME_BIN=$(which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null || which chromium-browser 2>/dev/null || which chromium 2>/dev/null)
echo "Using Chrome: $CHROME_BIN"

"$CHROME_BIN" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --use-fake-ui-for-media-stream \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  --alsa-output-device=pulse \
  --window-size=1280,720 \
  --user-data-dir=/tmp/chrome-profile-meet \
  "https://meet.google.com/zbj-emfq-vvf" \
  > /tmp/chrome-meet.log 2>&1 &

CHROME_PID=$!
echo "Chrome launched PID=$CHROME_PID"
sleep 5

# Move sink-inputs to chrome-output-sink
for i in 1 2 3 4 5; do
  SINK_INPUTS=$(pactl list sink-inputs short 2>/dev/null)
  echo "Sink inputs at ${i}s: $SINK_INPUTS"
  if [ -n "$SINK_INPUTS" ]; then
    echo "$SINK_INPUTS" | while read -r line; do
      SID=$(echo "$line" | awk '{print $1}')
      pactl move-sink-input "$SID" chrome-output-sink 2>/dev/null && echo "Moved sink-input $SID to chrome-output-sink"
    done
    break
  fi
  sleep 1
done

echo "Done. Check source-outputs:"
pactl list source-outputs short
