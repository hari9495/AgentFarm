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

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    VNC_PORT=5900 \
    NOVNC_PORT=6080 \
    XVFB_SCREEN=1280x800x24 \
    # noVNC web root
    NOVNC_HOME=/opt/novnc \
    # Agent entry point script path
    AGENT_SCRIPT=/app/agent-entrypoint.js

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Virtual display + VNC
    xvfb \
    x11vnc \
    # websockify ships noVNC glue
    websockify \
    # Window manager (minimal, just enough for apps to render)
    openbox \
    # Screenshot + input emulation
    xdotool \
    scrot \
    # Fonts so rendered text is legible
    fonts-liberation \
    fonts-dejavu-core \
    # Python for PyAutoGUI
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
    && rm -rf /var/lib/apt/lists/*

# ── k6 load testing tool ─────────────────────────────────────────────────────
RUN curl -fsSL https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz \
    | tar -xz --strip-components=1 -C /usr/local/bin k6-v0.50.0-linux-amd64/k6 \
    && chmod +x /usr/local/bin/k6

# ── Apache JMeter ────────────────────────────────────────────────────────────
ENV JMETER_VERSION=5.6.3 \
    JMETER_HOME=/opt/jmeter
RUN mkdir -p ${JMETER_HOME} \
    && curl -fsSL https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz \
    | tar -xz --strip-components=1 -C ${JMETER_HOME} \
    && ln -sf ${JMETER_HOME}/bin/jmeter /usr/local/bin/jmeter

# ── OWASP ZAP CLI ────────────────────────────────────────────────────────────
ENV ZAP_VERSION=2.15.0 \
    ZAP_HOME=/opt/zaproxy
# Download with retries; if GitHub is unreachable at build time, create a
# stub so dependent RUN steps (PATH, HEALTHCHECK) don't break the image.
RUN mkdir -p ${ZAP_HOME} \
    && ( curl -sSL --retry 3 --retry-delay 5 --max-time 120 \
    "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz" \
    -o /tmp/zap.tar.gz \
    && tar -xz --strip-components=1 -C ${ZAP_HOME} -f /tmp/zap.tar.gz \
    && ln -sf ${ZAP_HOME}/zap.sh /usr/local/bin/zap \
    && rm -f /tmp/zap.tar.gz \
    || ( echo "WARNING: ZAP download failed — installing stub" \
    && printf '#!/bin/sh\necho "ZAP unavailable: download failed at image build time. Install manually or rebuild with network access."\nexit 1\n' \
    > /usr/local/bin/zap \
    && chmod +x /usr/local/bin/zap ) )

# ── Python automation libraries ──────────────────────────────────────────────
RUN pip3 install --no-cache-dir \
    pyautogui \
    pillow \
    opencv-python-headless \
    selenium \
    appium-python-client

# ── Node.js 20 (via NodeSource) ──────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── noVNC web client (static files) ─────────────────────────────────────────
RUN mkdir -p ${NOVNC_HOME} \
    && curl -fsSL https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz \
    | tar -xz --strip-components=1 -C ${NOVNC_HOME}

# ── Playwright + Chromium ────────────────────────────────────────────────────
RUN npm install -g playwright \
    && npx playwright install --with-deps chromium \
    && rm -rf /root/.cache/ms-playwright/chromium*/chrome-linux/*/nacl_helper

# ── Newman (Postman CLI) + Appium server ─────────────────────────────────────
RUN npm install -g newman newman-reporter-html appium

# ── Appium drivers for mobile/desktop testing ─────────────────────────────────
RUN appium driver install uiautomator2 || true \
    && appium driver install xcuitest || true

ENV PATH="${PATH}:/opt/jmeter/bin:/opt/zaproxy"

# ── Application code ─────────────────────────────────────────────────────────
WORKDIR /app
COPY . .

# ── Entrypoint ───────────────────────────────────────────────────────────────
# Files are at build context root (docker/desktop-agent/) so paths are relative
RUN chmod +x /app/entrypoint.sh

EXPOSE ${NOVNC_PORT}
EXPOSE 5003

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:5003/health || exit 1

CMD ["/app/entrypoint.sh"]
