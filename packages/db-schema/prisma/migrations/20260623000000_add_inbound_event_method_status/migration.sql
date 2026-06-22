-- Migration: add_inbound_event_method_status
-- 2026-06-23
-- Adds method and status columns to InboundWebhookEvent so the dashboard
-- Events tab can display HTTP method and processing outcome per event.
-- Also adds missing active column to WebhookSource to match the original migration.

ALTER TABLE "InboundWebhookEvent"
    ADD COLUMN IF NOT EXISTS "method"   TEXT NOT NULL DEFAULT 'POST',
    ADD COLUMN IF NOT EXISTS "status"   TEXT NOT NULL DEFAULT 'processed';

ALTER TABLE "WebhookSource"
    ADD COLUMN IF NOT EXISTS "active"   BOOLEAN NOT NULL DEFAULT true;
