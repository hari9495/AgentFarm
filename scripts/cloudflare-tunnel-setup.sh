#!/usr/bin/env bash
# =============================================================================
# AgentFarm — Cloudflare Tunnel Setup
# =============================================================================
# Routes public HTTPS traffic → your private Docker services.
#
# Architecture after setup:
#
#   https://agentfarms.in          → Cloudflare Workers (website — serverless)
#   https://api.agentfarms.in      → api-gateway    :3000  (via Tunnel)
#   https://dashboard.agentfarms.in → dashboard     :3001  (via Tunnel)
#   https://runtime.agentfarms.in  → agent-runtime  :4000  (via Tunnel)
#
# Prerequisites:
#   - cloudflared installed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/
#   - Logged in: cloudflared login
#   - agentfarms.in added to your Cloudflare account
#
# Usage:
#   chmod +x scripts/cloudflare-tunnel-setup.sh
#   ./scripts/cloudflare-tunnel-setup.sh
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

TUNNEL_NAME="agentfarm"
DOMAIN="agentfarms.in"
CONFIG_DIR="$HOME/.cloudflared"

echo ""
echo "=============================================="
echo "  AgentFarm — Cloudflare Tunnel Setup"
echo "=============================================="
echo ""

# --- Check cloudflared is installed ---
command -v cloudflared >/dev/null 2>&1 \
  || error "cloudflared not found. Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/"

# --- Check already authenticated ---
if [ ! -f "$CONFIG_DIR/cert.pem" ]; then
  info "Logging in to Cloudflare (browser will open)..."
  cloudflared login
fi

# --- Create tunnel ---
info "Creating tunnel '${TUNNEL_NAME}'..."
TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1) || true
if echo "$TUNNEL_OUTPUT" | grep -q "already exists"; then
  warn "Tunnel '${TUNNEL_NAME}' already exists — reusing it."
  TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null \
    | python3 -c "import sys,json; tunnels=json.load(sys.stdin); [print(t['id']) for t in tunnels if t['name']=='${TUNNEL_NAME}']" 2>/dev/null || echo "")
else
  TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP '(?<=Created tunnel )[a-f0-9\-]+' || echo "")
fi

if [ -z "$TUNNEL_ID" ]; then
  # fallback: list to find the ID
  TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null \
    | python3 -c "import sys,json; tunnels=json.load(sys.stdin); [print(t['id']) for t in tunnels if t['name']=='${TUNNEL_NAME}']" 2>/dev/null || echo "")
fi

[ -z "$TUNNEL_ID" ] && error "Could not determine tunnel ID. Run: cloudflared tunnel list"
success "Tunnel ID: ${TUNNEL_ID}"

# --- DNS routes ---
info "Creating DNS CNAME routes..."

SUBDOMAINS=("api" "dashboard" "runtime")
for sub in "${SUBDOMAINS[@]}"; do
  cloudflared tunnel route dns "$TUNNEL_NAME" "${sub}.${DOMAIN}" 2>&1 \
    | grep -v "already exists" || true
  success "  ${sub}.${DOMAIN} → ${TUNNEL_ID}.cfargotunnel.com"
done

# --- Write config file ---
CONFIG_FILE="$CONFIG_DIR/config.yml"
info "Writing tunnel config to ${CONFIG_FILE}..."

cat > "$CONFIG_FILE" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  # API Gateway — all /v1/* and /health traffic
  - hostname: api.${DOMAIN}
    service: http://localhost:3000
    originRequest:
      connectTimeout: 30s
      tcpKeepAlive: 30s
      noTLSVerify: false

  # Dashboard (Next.js operator UI)
  - hostname: dashboard.${DOMAIN}
    service: http://localhost:3001
    originRequest:
      connectTimeout: 30s

  # Agent Runtime (internal — expose only if needed for external callbacks)
  - hostname: runtime.${DOMAIN}
    service: http://localhost:4000
    originRequest:
      connectTimeout: 60s

  # Catch-all — return 404 for any unmatched hostname
  - service: http_status:404
EOF

success "Config written to ${CONFIG_FILE}"

# --- Install as systemd service (Linux) ---
if command -v systemctl >/dev/null 2>&1; then
  info "Installing cloudflared as a systemd service..."
  sudo cloudflared service install \
    && sudo systemctl start cloudflared \
    && sudo systemctl enable cloudflared \
    && success "cloudflared service installed and started." \
    || warn "Could not install systemd service. Start manually: cloudflared tunnel run ${TUNNEL_NAME}"
else
  warn "systemd not found. Start the tunnel manually:"
  warn "  cloudflared tunnel run ${TUNNEL_NAME}"
fi

echo ""
echo "=============================================="
echo -e "  ${GREEN}Cloudflare Tunnel setup complete!${NC}"
echo "=============================================="
echo ""
echo "DNS routes created:"
echo "  https://api.${DOMAIN}        → localhost:3000 (api-gateway)"
echo "  https://dashboard.${DOMAIN}  → localhost:3001 (dashboard)"
echo "  https://runtime.${DOMAIN}    → localhost:4000 (agent-runtime)"
echo ""
echo "Next: set these in your .env:"
echo "  ALLOWED_ORIGINS=https://${DOMAIN},https://dashboard.${DOMAIN}"
echo "  APP_DOMAIN=${DOMAIN}"
echo "  NEXT_PUBLIC_API_URL=https://api.${DOMAIN}"
echo "  AGENT_RUNTIME_URL=https://runtime.${DOMAIN}"
echo ""
