-- Migration: inbound_event_cascade_delete
-- 2026-06-23
-- Change InboundWebhookEvent.sourceId FK from ON DELETE RESTRICT to ON DELETE CASCADE
-- so deleting a WebhookSource also removes its received events (previously the
-- delete failed with a foreign-key violation once any event had been received).

ALTER TABLE "InboundWebhookEvent"
    DROP CONSTRAINT "InboundWebhookEvent_sourceId_fkey";

ALTER TABLE "InboundWebhookEvent"
    ADD CONSTRAINT "InboundWebhookEvent_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "WebhookSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
