FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:1
ENV VNC_PORT=5901
ENV NOVNC_PORT=6080
ENV APP_PORT=5003
# PulseAudio virtual audio environment
ENV PULSE_SERVER=unix:/tmp/pulse/native
ENV XDG_RUNTIME_DIR=/tmp/runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    openbox \
    xdotool \
    scrot \
    ffmpeg \
    websockify \
    novnc \
    python3 \
    python3-pip \
    wget \
    curl \
    ca-certificates \
    fonts-liberation \
    fonts-noto \
    libx11-6 \
    libxext6 \
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    libpulse0 \
    fontconfig \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

# Install Playwright browsers once at build time (paid once, reused forever)
RUN playwright install chromium --with-deps \
    && rm -rf /var/lib/apt/lists/*

# Pre-generate avatar frames using ffmpeg (no external image dependencies).
# avatar-idle.y4m = blue background + "AI Agent / Ready" text (640x480 @ 15fps, 3s loop)
# avatar-talking.y4m = darker blue + "Speaking..." text (same dimensions)
RUN ffmpeg -y -f lavfi -i "color=c=0x1d4ed8:size=640x480:rate=15,drawtext=text='AI Agent':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='Ready':fontcolor=#93c5fd:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2+40" -t 3 -pix_fmt yuv420p /app/avatar-idle.y4m

RUN ffmpeg -y -f lavfi -i "color=c=0x1e40af:size=640x480:rate=15,drawtext=text='AI Agent':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='Speaking...':fontcolor=#fcd34d:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2+40" -t 3 -pix_fmt yuv420p /app/avatar-talking.y4m

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

COPY app.py /app/app.py

# noVNC WebSocket stream port + Flask API port
EXPOSE 6080 5003

ENTRYPOINT ["/app/entrypoint.sh"]
