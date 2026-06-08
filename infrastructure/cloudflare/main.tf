terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Store state in Cloudflare R2 (or change to S3/local for simpler setups)
  # To use R2: uncomment and set R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY env vars
  # backend "s3" {
  #   bucket                      = "agentfarm-tf-state"
  #   key                         = "cloudflare/terraform.tfstate"
  #   region                      = "auto"
  #   endpoint                    = "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  #   skip_region_validation      = true
  # }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ---------------------------------------------------------------------------
# Zone lookup
# ---------------------------------------------------------------------------

data "cloudflare_zone" "main" {
  name = var.zone_name
}

# ---------------------------------------------------------------------------
# Zone-level security settings
# ---------------------------------------------------------------------------

resource "cloudflare_zone_settings_override" "main" {
  zone_id = data.cloudflare_zone.main.id

  settings {
    # Force HTTPS for all traffic
    always_use_https = "on"
    # TLS 1.2 minimum — TLS 1.0/1.1 are deprecated and insecure
    min_tls_version  = "1.2"
    # Enable TLS 1.3 for performance + forward secrecy
    tls_1_3          = "zrt"
    # Automatic HTTPS Rewrites — upgrade mixed-content links
    automatic_https_rewrites = "on"
    # Browser Integrity Check — block headless clients with no UA
    browser_check = "on"
    # Security level: medium — challenges suspicious IPs, allows normal traffic
    security_level = "medium"
    # Enable WAF
    waf = "on"
    # Bot Fight Mode — free tier bot protection
    bic = "on"
    # Enable HTTP/2 and HTTP/3 (QUIC)
    http2 = "on"
    http3 = "on"
    # 0-RTT Connection Resumption
    zero_rtt = "on"
    # Opportunistic Encryption
    opportunistic_encryption = "on"
    # Email obfuscation (irrelevant for API but harmless)
    email_obfuscation = "off"
    # Rocket Loader disabled — API backend, no JS to optimize
    rocket_loader = "off"
    # Polish disabled — no images to compress on the API gateway
    polish = "off"
  }
}

# ---------------------------------------------------------------------------
# Custom WAF ruleset — firewall rules (run BEFORE rate limits)
# ---------------------------------------------------------------------------

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = data.cloudflare_zone.main.id
  name        = "AgentFarm — Custom WAF Rules"
  description = "Block scanners, enforce payload limits, protect admin routes"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # ------------------------------------------------------------------
  # Rule 1: Block empty / missing User-Agent (automated scanners)
  # Real browsers and API clients always send a UA.
  # Webhooks from providers (Stripe, Slack, etc.) also send a UA.
  # ------------------------------------------------------------------
  rules {
    ref         = "block_empty_user_agent"
    description = "Block requests with no User-Agent header"
    expression  = "not http.request.headers[\"user-agent\"][0] matches \".*\""
    action      = "block"
    enabled     = true
  }

  # ------------------------------------------------------------------
  # Rule 2: Block known vulnerability scanners (Nikto, sqlmap, etc.)
  # ------------------------------------------------------------------
  rules {
    ref         = "block_scanners"
    description = "Block common scanner and exploit tool signatures in UA"
    expression  = <<-EOT
      http.request.headers["user-agent"][0] matches
        "(?i)(nikto|sqlmap|masscan|nmap|zgrab|nuclei|dirbuster|gobuster|ffuf|wfuzz|acunetix|nessus|openvas|w3af|hydra|medusa)"
    EOT
    action      = "block"
    enabled     = true
  }

  # ------------------------------------------------------------------
  # Rule 3: Managed Challenge on Tor exit nodes hitting auth routes
  # Tor is legitimate for privacy browsing but high-risk for auth abuse.
  # ------------------------------------------------------------------
  rules {
    ref         = "challenge_tor_auth"
    description = "Managed challenge for Tor exit nodes on auth endpoints"
    expression  = "cf.threat_score ge 50 and http.request.uri.path matches \"^/(v1/auth|auth|portal/auth)/\""
    action      = "managed_challenge"
    enabled     = true
  }

  # ------------------------------------------------------------------
  # Rule 4: Block path traversal attempts
  # ------------------------------------------------------------------
  rules {
    ref         = "block_path_traversal"
    description = "Block path traversal patterns in URL"
    expression  = "http.request.uri.path matches \"(\\.\\./|%2e%2e/|%252e%252e/)\""
    action      = "block"
    enabled     = true
  }

  # ------------------------------------------------------------------
  # Rule 5: Block requests > 10 MB at the edge (app limit is 1 MB for
  # JSON; 25 MB for file uploads — this blocks extreme payloads before
  # they hit origin bandwidth)
  # ------------------------------------------------------------------
  rules {
    ref         = "block_large_payloads"
    description = "Block oversized request bodies (> 10 MB)"
    expression  = "http.request.body.size gt 10485760"
    action      = "block"
    enabled     = true
  }

  # ------------------------------------------------------------------
  # Rule 6: Block direct access to internal service subdomains from
  # non-Cloudflare IPs (runtime.agentfarms.in should only be accessed
  # via the Tunnel, never directly from the internet)
  # ------------------------------------------------------------------
  rules {
    ref         = "block_internal_direct"
    description = "Block non-CF traffic hitting runtime subdomain"
    expression  = "http.host eq \"runtime.agentfarms.in\" and not cf.verified_bot_category in {\"Search Engine Crawler\"}"
    action      = "block"
    enabled     = false  # Enable only after confirming Tunnel is routing correctly
  }

  # ------------------------------------------------------------------
  # Rule 7: JS challenge on high-threat-score IPs for non-API traffic
  # ------------------------------------------------------------------
  rules {
    ref         = "challenge_high_threat"
    description = "JS challenge for IPs with high Cloudflare threat score"
    expression  = "cf.threat_score ge 25 and http.host eq \"agentfarms.in\""
    action      = "js_challenge"
    enabled     = true
  }
}

# ---------------------------------------------------------------------------
# Rate limiting ruleset
# Mirrors the in-app Redis rate limits exactly so the edge drops traffic
# before it consumes Redis / DB / LLM quota.
# ---------------------------------------------------------------------------

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = data.cloudflare_zone.main.id
  name        = "AgentFarm — Rate Limiting"
  description = "Edge rate limits mirroring app-level Redis limits"
  kind        = "zone"
  phase       = "http_ratelimit"

  # ------------------------------------------------------------------
  # Rule 1: Auth endpoints — 20 req/min per IP
  # Matches server.ts: limit = isAuthEndpoint ? 20 : 180
  # Paths: /v1/auth/*, /auth/*, /portal/auth/*
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_auth_per_ip"
    description = "Auth endpoints — 20 req/min per IP (mirrors app limit)"
    expression  = <<-EOT
      http.host eq "api.agentfarms.in" and
      http.request.uri.path matches "^/(v1/auth|auth|portal/auth)/"
    EOT
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 60   # Block for 60 seconds after limit hit
      requests_to_origin  = false
    }
  }

  # ------------------------------------------------------------------
  # Rule 2: General API — 180 req/min per IP
  # Matches server.ts: limit = 180 for non-auth routes
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_api_per_ip"
    description = "General API — 180 req/min per IP (mirrors app limit)"
    expression  = <<-EOT
      http.host eq "api.agentfarms.in" and
      not http.request.uri.path matches "^/(v1/auth|auth|portal/auth)/"
    EOT
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 180
      mitigation_timeout  = 60
      requests_to_origin  = false
    }
  }

  # ------------------------------------------------------------------
  # Rule 3: Webhook ingest — 300 req/min per IP
  # Webhooks are machine-to-machine (Stripe, Slack, Zoho) — higher
  # per-IP limit than auth but still bounded to prevent replay floods.
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_webhooks"
    description = "Webhook ingest — 300 req/min per IP"
    expression  = <<-EOT
      http.host eq "api.agentfarms.in" and
      http.request.uri.path matches "^/v1/webhooks/"
    EOT
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 300
      mitigation_timeout  = 30
      requests_to_origin  = false
    }
  }

  # ------------------------------------------------------------------
  # Rule 4: Dashboard — 400 req/min per IP
  # Next.js SSR + API proxy — slightly more generous than raw API.
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_dashboard"
    description = "Dashboard — 400 req/min per IP"
    expression  = "http.host eq \"dashboard.agentfarms.in\""
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 400
      mitigation_timeout  = 60
      requests_to_origin  = false
    }
  }

  # ------------------------------------------------------------------
  # Rule 5: Website — 600 req/min per IP
  # Marketing site served from Cloudflare Workers — generous limit,
  # most requests are cache-hits that never reach the Worker.
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_website"
    description = "Website (Workers) — 600 req/min per IP"
    expression  = "http.host eq \"agentfarms.in\" or http.host eq \"www.agentfarms.in\""
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 600
      mitigation_timeout  = 60
      requests_to_origin  = false
    }
  }

  # ------------------------------------------------------------------
  # Rule 6: Global hard ceiling — 1200 req/min per IP across all hosts
  # Safety net against distributed floods that spread across subdomains.
  # ------------------------------------------------------------------
  rules {
    ref         = "rl_global_ceiling"
    description = "Global hard ceiling — 1200 req/min per IP"
    expression  = "http.host contains \"agentfarms.in\""
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 1200
      mitigation_timeout  = 120
      requests_to_origin  = false
    }
  }
}

# ---------------------------------------------------------------------------
# Managed WAF ruleset — OWASP Core Rule Set
# Catches SQLi, XSS, RCE, LFI, RFI, and other OWASP Top 10 patterns.
# Requires Cloudflare Pro plan or higher.
# ---------------------------------------------------------------------------

resource "cloudflare_ruleset" "waf_managed" {
  zone_id     = data.cloudflare_zone.main.id
  name        = "AgentFarm — Managed WAF (OWASP)"
  description = "Cloudflare managed OWASP Core Rule Set"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules {
    ref         = "owasp_core"
    description = "Cloudflare OWASP Core Rule Set"
    # Deploy Cloudflare's managed OWASP ruleset
    action      = "execute"
    enabled     = true

    action_parameters {
      id      = "4814384a9e5d4991b9815dcfc25d2f1f"  # Cloudflare OWASP CRS
      version = "latest"

      overrides {
        # Set to block mode; change to "log" first to tune false-positive rate
        action = "block"

        # Paranoia level 1 — balanced; increase to 2 for higher security
        # at the cost of more false positives on valid API requests
        categories {
          category = "paranoia-level-2"
          enabled  = false
          action   = "log"
        }
        categories {
          category = "paranoia-level-3"
          enabled  = false
          action   = "log"
        }
        categories {
          category = "paranoia-level-4"
          enabled  = false
          action   = "log"
        }
      }
    }
  }

  rules {
    ref         = "cf_managed_rules"
    description = "Cloudflare Managed Ruleset (non-OWASP)"
    action      = "execute"
    enabled     = true

    action_parameters {
      id      = "efb7b8c949ac4650a09736fc376e9aee"  # Cloudflare Managed Rules
      version = "latest"
    }
  }
}

# ---------------------------------------------------------------------------
# Response header transform — add security headers at edge
# Complements the helmet headers already set in server.ts so the
# website (Cloudflare Workers) also gets these headers.
# ---------------------------------------------------------------------------

resource "cloudflare_ruleset" "response_headers" {
  zone_id     = data.cloudflare_zone.main.id
  name        = "AgentFarm — Security Response Headers"
  description = "Add security headers to all responses at the edge"
  kind        = "zone"
  phase       = "http_response_headers_transform"

  rules {
    ref         = "security_headers"
    description = "Add HSTS, X-Content-Type-Options, X-Frame-Options"
    expression  = "true"
    action      = "rewrite"
    enabled     = true

    action_parameters {
      headers {
        name      = "Strict-Transport-Security"
        operation = "set"
        value     = "max-age=31536000; includeSubDomains; preload"
      }
      headers {
        name      = "X-Content-Type-Options"
        operation = "set"
        value     = "nosniff"
      }
      headers {
        name      = "X-Frame-Options"
        operation = "set"
        value     = "DENY"
      }
      headers {
        name      = "X-XSS-Protection"
        operation = "set"
        value     = "1; mode=block"
      }
      headers {
        name      = "Referrer-Policy"
        operation = "set"
        value     = "strict-origin-when-cross-origin"
      }
      headers {
        name      = "Permissions-Policy"
        operation = "set"
        value     = "geolocation=(), microphone=(), camera=()"
      }
      # Remove Server header to avoid fingerprinting origin stack
      headers {
        name      = "Server"
        operation = "remove"
      }
    }
  }
}
