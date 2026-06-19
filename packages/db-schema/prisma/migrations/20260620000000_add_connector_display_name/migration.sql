-- Add a human-friendly display name to connector metadata.
-- Lets customers name each connector (esp. multiple custom_api connectors)
-- so they are distinguishable in the Connected Tools list.

ALTER TABLE "ConnectorAuthMetadata" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
