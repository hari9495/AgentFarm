# syntax=docker/dockerfile:1.7
# Desktop Agent Container
# Full virtual desktop for tasks that require GUI interaction:
#   - Visual app testing  (browser automation, desktop apps)
#   - Screen-read loops   (LLM vision → click/type)
#   - noVNC stream to the customer dashboard
#
# Stack: Ubuntu 22.04 → Xvfb (virtual framebuffer) → x11vnc (VNC server)
#        → websockify + noVNC (browser-accessible stream)
#        → Node.js 20 (agent process) + Python 3 (PyAutoGUI)
#        → Playwright Chromium (headless-optional browser automation)
#
# Build stages (each is a resumable cache checkpoint):
#   system      — OS packages, k6, JMeter, ZAP, Node.js, noVNC
#   py-light    — lightweight Python automation libs
#   py-heavy    — heavy ML voice-sidecar wheels (faster-whisper, silero-vad)
#   node-tools  — global npm packages (Playwright Chromium, Newman, Appium)
#   runtime     — application code (fastest-changing, always last)
#
# BuildKit cache mounts on pip/apt/npm mean that if a layer fails mid-way
# and you re-run the build, downloaded packages are already on disk and the
# step resumes in seconds rather than re-downloading gigabytes.

# ── Stage 1: system ──────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS system

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    VNC_PORT=5900 \
    NOVNC_PORT=6080 \
    XVFB_SCREEN=1280x800x24 \
    NOVNC_HOME=/opt/novnc \
    AGENT_SCRIPT=/app/agent-entrypoint.js \
    JMETER_VERSION=5.6.3 \
    JMETER_HOME=/opt/jmeter \
    ZAP_VERSION=2.17.0 \
    ZAP_HOME=/opt/zaproxy

# apt cache is mounted so the layer itself stays lean but re-runs are instant.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    # Virtual display + VNC
    xvfb \
    x11vnc \
    websockify \
    openbox \
    xdotool \
    scrot \
    fonts-liberation \
    fonts-dejavu-core \
    # Python
    python3 \
    python3-pip \
    # General utilities
    curl \
    wget \
    unzip \
    ca-certificates \
    git \
    # Java runtime for JMeter and ZAP
    default-jdk-headless \
    # Chromium + ChromeDriver for Selenium cross-browser
    chromium-browser \
    chromium-chromedriver \
    # Firefox for cross-browser Selenium testing
    firefox \
    # Audio stack for the pipecat voice sidecar
    pulseaudio \
    pulseaudio-utils \
    alsa-utils \
    ffmpeg \
    libavcodec-extra \
    libportaudio2 \
    libsndfile1

# ── k6 ───────────────────────────────────────────────────────────────────────
RUN curl -fsSL https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz \
    | tar -xz --strip-components=1 -C /usr/local/bin k6-v0.50.0-linux-amd64/k6 \
    && chmod +x /usr/local/bin/k6

# ── Apache JMeter ────────────────────────────────────────────────────────────
RUN mkdir -p ${JMETER_HOME} \
    && curl -fsSL https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz \
    | tar -xz --strip-components=1 -C ${JMETER_HOME} \
    && ln -sf ${JMETER_HOME}/bin/jmeter /usr/local/bin/jmeter

# ── OWASP ZAP CLI ────────────────────────────────────────────────────────────
# If GitHub is unreachable at build time a no-op stub is installed instead.
RUN mkdir -p ${ZAP_HOME} \
    && ( curl -fsSL --retry 3 --retry-delay 5 --max-time 180 \
    "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" \
    | tar -xz --strip-components=1 -C ${ZAP_HOME} \
    && ln -sf ${ZAP_HOME}/zap.sh /usr/local/bin/zap \
    || ( printf '#!/bin/sh\necho "ZAP stub: rebuild with network access"\nexit 1\n' \
    > /usr/local/bin/zap && chmod +x /usr/local/bin/zap ) )

# ── Node.js 20 ───────────────────────────────────────────────────────────────
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    ( curl -fsSL --max-time 60 https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    ) \
    || ( apt-get install -y --no-install-recommends nodejs npm )

# ── noVNC static files ───────────────────────────────────────────────────────
RUN mkdir -p ${NOVNC_HOME} \
    && curl -fsSL https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz \
    | tar -xz --strip-components=1 -C ${NOVNC_HOME}

# ── Stage 2: py-light — lightweight Python automation packages ───────────────
FROM system AS py-light

# pip download cache is mounted: wheels survive a layer rebuild so re-runs
# after a crash skip network downloads and resolve from disk in seconds.
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m pip install --upgrade pip \
    && python3 -m pip install --prefer-binary \
    "pyautogui==0.9.54" \
    "pillow==10.4.0" \
    "opencv-python-headless==4.9.0.80" \
    "selenium==4.21.0" \
    "appium-python-client==3.2.0"

# ── Stage 3: py-heavy — ML voice-sidecar wheels ──────────────────────────────
# Kept in its own stage so a failed re-run doesn't invalidate the py-light
# checkpoint.  faster-whisper pulls CTranslate2 + torch — several hundred MB.
FROM py-light AS py-heavy

RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m pip install --prefer-binary \
    "faster-whisper==1.0.3" \
    "silero-vad==5.1.2" \
    "sounddevice==0.4.7" \
    "soundfile==0.12.1" \
    "numpy>=1.24,<2.0" \
    "requests>=2.31.0"

# ── Stage 4: node-tools — global npm packages ────────────────────────────────
# npm cache is mounted so Playwright Chromium (~170 MB) and Newman wheels are
# not re-downloaded on unrelated source changes.
FROM py-heavy AS node-tools

RUN --mount=type=cache,target=/root/.npm \
    npm install -g playwright \
    && npx playwright install --with-deps chromium \
    && rm -rf /root/.cache/ms-playwright/chromium*/chrome-linux/*/nacl_helper

RUN --mount=type=cache,target=/root/.npm \
    npm install -g newman newman-reporter-html appium

RUN appium driver install uiautomator2 || true \
    && appium driver install xcuitest || true

# ── Stage 5: runtime — application code (fastest-changing layer last) ────────
FROM node-tools AS runtime

ENV PATH="${PATH}:/opt/jmeter/bin:/opt/zaproxy"

WORKDIR /app
COPY . .

RUN chmod +x /app/entrypoint.sh /app/pulse-setup.sh \
    # Playwright is installed globally (npm install -g playwright) but ESM
    # dynamic import() does not search /usr/lib/node_modules.  Symlinking it
    # into /app/node_modules means `import('playwright')` resolves without
    # NODE_PATH hacks.
    && mkdir -p /app/node_modules \
    && ln -sf /usr/lib/node_modules/playwright /app/node_modules/playwright

EXPOSE ${NOVNC_PORT}
EXPOSE 5003
# pipecat voice sidecar HTTP control plane
EXPOSE 7800

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:5003/health || exit 1

CMD ["/app/entrypoint.sh"]
