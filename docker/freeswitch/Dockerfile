# syntax=docker/dockerfile:1.7
# FreeSWITCH SIP server — AgentFarm voice connector.
#
# Provides:
#   - ESL (Event Socket Layer) on port 8021 — used by SipJoinAdapter to
#     originate SIP calls into meeting platforms.
#   - SIP profiles on ports 5060 (internal) and 5080 (external) for
#     dialling out via a SIP trunk (Twilio SIP, VoIP.ms, etc.).
#   - RTP media relay on UDP 16384-16484 (dev range, 50 concurrent calls).
#
# ESL password is injected at container start via the ESL_PASSWORD env var
# (default: ClueCon). Change it in .env before exposing port 8021 externally.
#
# Build:  docker build -t agentfarm-freeswitch docker/freeswitch
# Run:    docker compose --profile voice up freeswitch

FROM debian:bookworm-slim

# ── System packages ───────────────────────────────────────────────────────────

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       wget \
       ca-certificates \
       gnupg \
       netcat-openbsd \
       gettext-base \
    && rm -rf /var/lib/apt/lists/*

# ── FreeSWITCH packages from files.freeswitch.org (public, no auth required) ─

RUN wget -qO /etc/apt/trusted.gpg.d/freeswitch.gpg \
       https://files.freeswitch.org/repo/deb/debian-release/freeswitch_archive_g3.pub \
    && printf '%s\n' \
       'deb [signed-by=/etc/apt/trusted.gpg.d/freeswitch.gpg] https://files.freeswitch.org/repo/deb/debian-release/ bookworm main' \
       > /etc/apt/sources.list.d/freeswitch.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       freeswitch-meta-vanilla \
       freeswitch-mod-event-socket \
       freeswitch-cli \
    && rm -rf /var/lib/apt/lists/*

# ── Config ────────────────────────────────────────────────────────────────────

# ESL config template — ESL_PASSWORD is substituted by docker-entrypoint.sh
# at container start so the password can be set via environment variable
# without baking it into the image.
COPY conf/autoload_configs/event_socket.conf.xml.tpl \
     /etc/freeswitch/autoload_configs/event_socket.conf.xml.tpl

# ── Entrypoint ────────────────────────────────────────────────────────────────

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ── Ports ─────────────────────────────────────────────────────────────────────

# 5060 — SIP signaling (internal profile)
# 5080 — SIP signaling (external/outbound profile)
# 8021 — ESL (Event Socket Layer)
# 16384-16484 — RTP media (100-port dev range = ~50 concurrent calls)
EXPOSE 5060/tcp 5060/udp 5080/tcp 5080/udp 8021 16384-16484/udp

# ── Healthcheck ───────────────────────────────────────────────────────────────

# Check that ESL port is accepting TCP connections — simpler and more reliable
# than running fs_cli (avoids password dependency in image layer).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD nc -z 127.0.0.1 8021 || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["freeswitch", "-nonatmap", "-nonat", "-nf"]
