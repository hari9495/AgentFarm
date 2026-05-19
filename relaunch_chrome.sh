#!/bin/bash
# Kill old Chrome
kill -9 $(ps aux | grep -E "[c]hrome|[c]hromium" | grep -v defunct | awk '{print $1}') 2>/dev/null || true
sleep 2

echo "Chrome procs after kill: $(ps aux | grep -E '[c]hrome|[c]hromium' | grep -v defunct | wc -l)"

export DISPLAY=:1
export XDG_RUNTIME_DIR=/tmp/runtime
export PULSE_SERVER=unix:/tmp/runtime/pulse/native
export PULSE_RUNTIME_PATH=/tmp/runtime/pulse
export PULSE_SINK=chrome-output-sink

# Verify PulseAudio
pactl info 2>&1 | head -1

CHROME_BIN=$(which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null || which chromium-browser 2>/dev/null || which chromium 2>/dev/null)
echo "Chrome bin: $CHROME_BIN"

"$CHROME_BIN" \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --use-fake-ui-for-media-stream \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  --disable-blink-features=AutomationControlled \
  --window-size=1280,720 \
  --user-data-dir=/tmp/chrome-profile-meet2 \
  "https://meet.google.com/zbj-emfq-vvf" \
  > /tmp/chrome-meet.log 2>&1 &

echo "Chrome PID=$!"
sleep 8

echo "Source outputs after Chrome launch:"
pactl list source-outputs short

echo "Sink inputs:"
pactl list sink-inputs short

# Move Chrome sink inputs to chrome-output-sink
pactl list sink-inputs short | awk '{print $1}' | while read SID; do
  pactl move-sink-input "$SID" chrome-output-sink 2>/dev/null && echo "Moved $SID to chrome-output-sink"
done
