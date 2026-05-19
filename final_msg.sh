#!/bin/bash
export XDG_RUNTIME_DIR=/tmp/runtime
export PULSE_SERVER=unix:/tmp/runtime/pulse/native
printf "Hello Hari Nani. This is AgentFarm AI assistant. I can now speak to you through Google Meet. The audio pipeline is fully working. You should be hearing my voice right now. Please confirm if you can hear me clearly." > /tmp/final_msg.txt
espeak-ng -a 200 -s 130 -f /tmp/final_msg.txt -w /tmp/final_speech.wav 2>/dev/null
paplay --device=virtual-sink /tmp/final_speech.wav
echo "done"
