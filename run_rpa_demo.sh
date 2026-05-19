#!/bin/bash
# run_rpa_demo.sh — start screen recording, run RPA challenge, stop recording
set -e

DISPLAY=":1"
SESSION_ID=$(date +%Y%m%d-%H%M%S)-$(cat /proc/sys/kernel/random/uuid | tr -d '-' | head -c 8)
RECORDING="/tmp/rpa_recording.mp4"

export DISPLAY
export RPA_SESSION_ID="${SESSION_ID}"

echo "[record] Session: ${SESSION_ID}"
echo "[record] Starting ffmpeg screen capture → ${RECORDING}"
ffmpeg -y \
  -video_size 1280x800 \
  -framerate 15 \
  -f x11grab \
  -i :1.0+0,0 \
  -vcodec libx264 \
  -preset ultrafast \
  -pix_fmt yuv420p \
  "${RECORDING}" > /tmp/ffmpeg.log 2>&1 &
FFMPEG_PID=$!
echo "[record] ffmpeg PID ${FFMPEG_PID}"
sleep 2

# Run the automation (it will upload screenshot to blob when done)
echo "[rpa] Launching RPA challenge script..."
python3 /app/rpa_challenge.py
RPA_STATUS=$?

# Give browser a moment to show the final score on screen
sleep 3

# Stop recording gracefully (SIGINT lets ffmpeg flush MP4 trailer)
echo "[record] Stopping ffmpeg..."
kill -SIGINT ${FFMPEG_PID} 2>/dev/null || true
wait ${FFMPEG_PID} 2>/dev/null || true

echo "[record] Recording ready: ${RECORDING}"
ls -lh "${RECORDING}"

# Upload recording to blob (script handles deletion of local file on success)
AZURE_STORAGE_CONNECTION_STRING="${AZURE_STORAGE_CONNECTION_STRING}" \
AZURE_AUDIT_CONTAINER="${AZURE_AUDIT_CONTAINER:-agent-audit-logs}" \
RPA_SESSION_ID="${SESSION_ID}" \
python3 - <<'EOF'
import os, sys
recording = "/tmp/rpa_recording.mp4"
conn_str = os.environ.get("AZURE_STORAGE_CONNECTION_STRING", "")
session_id = os.environ.get("RPA_SESSION_ID", "unknown")
container = os.environ.get("AZURE_AUDIT_CONTAINER", "agent-audit-logs")
if not conn_str or "YOUR_ACCOUNT" in conn_str:
    print("[blob] Blob storage not configured — recording kept locally")
    sys.exit(0)
from datetime import datetime, timezone
from azure.storage.blob import ContainerClient
date_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
blob_path = f"rpa-sessions/{date_prefix}/{session_id}/recording.mp4"
client = ContainerClient.from_connection_string(conn_str, container)
client.create_container()
with open(recording, "rb") as f:
    client.upload_blob(blob_path, f, overwrite=True)
url = f"{client.url}/{blob_path}"
print(f"[blob] Recording uploaded → {url}")
os.remove(recording)
print(f"[blob] Local file removed: {recording}")
EOF

exit ${RPA_STATUS}

