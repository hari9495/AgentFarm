-- Migration: add_webhook_verification_mode
-- 2026-06-23
-- Adds verificationMode to WebhookSource so customers can register sources
-- whose external service cannot sign its webhooks. "hmac" (default) requires
-- a valid HMAC-SHA256 signature; "none" accepts any POST to the source URL.

ALTER TABLE "WebhookSource"
    ADD COLUMN IF NOT EXISTS "verificationMode" TEXT NOT NULL DEFAULT 'hmac';
