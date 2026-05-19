#!/bin/bash
DISPLAY=:1 xdotool search --name "Meet" windowactivate --sync 2>/dev/null || true
sleep 0.3
DISPLAY=:1 xdotool mousemove 780 682 click 1
sleep 0.3
DISPLAY=:1 xdotool type --clearmodifiers "navigator.mediaDevices.enumerateDevices().then(d=>console.log(d.map(x=>x.kind+chr(58)+x.label).join(chr(124))))"
DISPLAY=:1 xdotool key Return
sleep 1.5
DISPLAY=:1 ffmpeg -y -f x11grab -video_size 1280x720 -i :1+0,0 -frames:v 1 /tmp/sc_dev.png -loglevel quiet
