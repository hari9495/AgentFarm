variable "cloudflare_api_token" {
  description = "Cloudflare API token — needs Zone:Read, Zone:Edit, Firewall Services:Edit, Rate Limiting:Edit"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (visible in the right sidebar of dash.cloudflare.com)"
  type        = string
}

variable "zone_name" {
  description = "Root domain managed in Cloudflare"
  type        = string
  default     = "agentfarms.in"
}
