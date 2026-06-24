-- C6.2: store the parsed OpenAPI tool catalog for self-describing Custom API connectors
ALTER TABLE "ConnectorAuthMetadata" ADD COLUMN "openapiCatalog" JSONB;
