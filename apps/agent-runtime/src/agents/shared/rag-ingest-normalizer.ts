import { convertToMarkdown, isSupportedMimeType } from '@agentfarm/document-converter';

/**
 * Normalise raw string content to Markdown before RAG ingestion.
 *
 * text/html        → strip tags, ATX headings, bold/italic preserved
 * application/json → fenced ```json block
 * text/csv         → passthrough (already compact)
 * text/plain/none  → passthrough
 *
 * Binary MIME types (PDF, DOCX, XLSX, PPTX) cannot be sent as strings —
 * callers that have binary data should use POST /v1/knowledge-base/ingest-file.
 *
 * Always non-fatal: conversion errors return the original string unchanged.
 */
export async function normalizeIngestContent(content: string, mimeType?: string): Promise<string> {
    if (!mimeType) return content;
    const base = mimeType.split(';')[0].trim().toLowerCase();
    if (base === 'text/plain' || !isSupportedMimeType(base)) return content;
    try {
        return await convertToMarkdown(Buffer.from(content, 'utf8'), base);
    } catch {
        return content;
    }
}
