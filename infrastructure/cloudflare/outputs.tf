output "zone_id" {
  description = "Cloudflare Zone ID for agentfarms.in"
  value       = data.cloudflare_zone.main.id
}

output "waf_custom_ruleset_id" {
  description = "ID of the custom WAF ruleset"
  value       = cloudflare_ruleset.waf_custom.id
}

output "rate_limit_ruleset_id" {
  description = "ID of the rate limiting ruleset"
  value       = cloudflare_ruleset.rate_limits.id
}

output "waf_managed_ruleset_id" {
  description = "ID of the managed WAF ruleset (OWASP)"
  value       = cloudflare_ruleset.waf_managed.id
}
