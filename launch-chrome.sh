#!/bin/sh
export DISPLAY=:1
export PULSE_SERVER=unix:/tmp/pulse-runtime/native
export PULSE_RUNTIME_PATH=/tmp/pulse-runtime
export XDG_RUNTIME_DIR=/run/user/0
export PULSE_SINK=chrome-output-sink

/usr/bin/google-chrome-stable \
  --use-fake-ui-for-media-stream \
  --use-file-for-fake-video-capture=/tmp/avatar.fifo \
  --autoplay-policy=no-user-gesture-required \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --new-window \
  "https://meet.google.com/zbj-emfq-vvf" \
  > /tmp/chrome.log 2>&1 &
echo "Chrome PID=$!"
