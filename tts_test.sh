#!/bin/bash
export XDG_RUNTIME_DIR=/tmp/runtime
export PULSE_SERVER=unix:/tmp/runtime/pulse/native

# Write text to file
printf "Hello Hari Nani. This is AgentFarm AI assistant. Can you hear my voice now? Please say yes if you hear me. I am the AI agent from AgentFarm. Hello. Testing. One. Two. Three." > /tmp/tts_input.txt

# Generate WAV from file
espeak-ng -a 200 -s 150 -f /tmp/tts_input.txt -w /tmp/speech_final.wav
echo "espeak exit: $?"
python3 -c "import wave; f=wave.open('/tmp/speech_final.wav'); print(round(f.getnframes()/f.getframerate(),2), 'seconds')"

# Play it
paplay --device=virtual-sink /tmp/speech_final.wav
echo "paplay exit: $?"
