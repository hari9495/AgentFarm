FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir flask flask-cors playwright anthropic

RUN playwright install chromium --with-deps

# ── Node.js 20 + agent-browser CLI (primary browser automation path) ─────────
# Playwright Chromium is detected automatically by agent-browser, so no
# duplicate Chrome download is needed.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g agent-browser \
    && agent-browser install

COPY app.py /app/app.py

EXPOSE 5002

CMD ["python", "app.py"]
