#!/usr/bin/env bash
# voice-dev.sh — Start the AgentFarm voice stack for local Teams development.
#
# What it does:
#   1. Starts all voice-profile services (including ngrok and teams-media-bot).
#   2. Polls the ngrok API until a public HTTPS tunnel URL appears.
#   3. Injects that URL into teams-media-bot as TEAMS_CALLBACK_BASE_URL by
#      recreating just that container (all other services are unaffected).
#
# Prerequisites:
#   - Docker + Docker Compose v2
#   - NGROK_AUTHTOKEN exported (free account: https://dashboard.ngrok.com)
#
# Usage:
#   export NGROK_AUTHTOKEN=your_token
#   ./scripts/voice-dev.sh
#
# Options:
#   --down   Stop and remove all voice-profile containers instead of starting them.

set -euo pipefail

COMPOSE_CMD="docker compose"
PROFILE="voice"
NGROK_API="http://localhost:4040/api/tunnels"
MAX_WAIT=60   # seconds to wait for ngrok tunnel
POLL_INTERVAL=3

# ── helpers ────────────────────────────────────────────────────────────────────

log()  { printf '\033[1;34m[voice-dev]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[voice-dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[voice-dev]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[voice-dev]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

# ── --down shortcut ────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--down" ]]; then
  log "Stopping voice stack…"
  $COMPOSE_CMD --profile "$PROFILE" down
  ok "Voice stack stopped."
  exit 0
fi

# ── pre-flight checks ──────────────────────────────────────────────────────────

command -v docker >/dev/null 2>&1 || die "docker not found in PATH."
command -v curl   >/dev/null 2>&1 || die "curl not found in PATH."

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  warn "NGROK_AUTHTOKEN is not set."
  warn "Get a free token at https://dashboard.ngrok.com/get-started/your-authtoken"
  warn "Then: export NGROK_AUTHTOKEN=<token>"
  die  "Cannot start ngrok without an auth token."
fi

# ── start the voice stack ──────────────────────────────────────────────────────

log "Starting voice stack (profile: $PROFILE)…"
$COMPOSE_CMD --profile "$PROFILE" up -d

# ── wait for ngrok tunnel ──────────────────────────────────────────────────────

log "Waiting for ngrok tunnel (up to ${MAX_WAIT}s)…"
elapsed=0
PUBLIC_URL=""

while [[ $elapsed -lt $MAX_WAIT ]]; do
  if response=$(curl -sf "$NGROK_API" 2>/dev/null); then
    # Extract first HTTPS tunnel URL. Works without jq using grep+sed.
    if command -v jq >/dev/null 2>&1; then
      PUBLIC_URL=$(printf '%s' "$response" | jq -r '[.tunnels[] | select(.proto=="https")] | first | .public_url // empty' 2>/dev/null || true)
    else
      PUBLIC_URL=$(printf '%s' "$response" | grep -o '"https://[^"]*"' | head -1 | tr -d '"' || true)
    fi
    [[ -n "$PUBLIC_URL" ]] && break
  fi
  sleep "$POLL_INTERVAL"
  elapsed=$((elapsed + POLL_INTERVAL))
done

if [[ -z "$PUBLIC_URL" ]]; then
  die "Timed out waiting for ngrok tunnel. Check: docker compose --profile voice logs ngrok"
fi

ok "ngrok tunnel ready: $PUBLIC_URL"

# ── inject URL into teams-media-bot ───────────────────────────────────────────

log "Injecting TEAMS_CALLBACK_BASE_URL into teams-media-bot…"
TEAMS_CALLBACK_BASE_URL="$PUBLIC_URL" \
  $COMPOSE_CMD --profile "$PROFILE" up -d --no-deps --force-recreate teams-media-bot

# ── summary ───────────────────────────────────────────────────────────────────

echo ""
ok "Voice stack is ready."
echo ""
echo "  Callback URL : $PUBLIC_URL"
echo "  ngrok UI     : http://localhost:4040"
echo "  Bot health   : http://localhost:8090/health"
echo ""
echo "  To stop:  ./scripts/voice-dev.sh --down"
echo "  Logs:     docker compose --profile voice logs -f teams-media-bot"
echo ""
