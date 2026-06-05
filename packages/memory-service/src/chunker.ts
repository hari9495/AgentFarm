// ============================================================================
// SEMANTIC CHUNKER
//
// Splits large documents into overlapping chunks before embedding so that
// long PDFs/DOCX files are not silently truncated at the 8192-char API limit.
//
// Algorithm:
//   1. Split on blank lines (paragraph boundaries — cheapest semantic signal)
//   2. Merge consecutive short paragraphs up to CHUNK_MAX chars
//   3. Split paragraphs that exceed CHUNK_MAX at sentence boundaries
//   4. Prepend the last CHUNK_OVERLAP chars of each chunk onto the next one
//      so cross-boundary context is preserved during retrieval
// ============================================================================

export const CHUNK_MAX_CHARS = 1_500;
export const CHUNK_OVERLAP_CHARS = 200;

export interface ChunkOptions {
    maxChars?: number;
    overlapChars?: number;
}

/**
 * Split `text` into overlapping chunks suitable for separate embeddings.
 *
 * Each chunk stays within `maxChars` characters so the Azure OpenAI
 * embeddings API (8192-char hard cap) is never silently truncated.
 * Adjacent chunks share `overlapChars` characters to keep context across
 * paragraph boundaries.
 */
export function chunkText(
    text: string,
    { maxChars = CHUNK_MAX_CHARS, overlapChars = CHUNK_OVERLAP_CHARS }: ChunkOptions = {},
): string[] {
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return text.trim() ? [text.trim()] : [];

    // Build base segments: merge short paragraphs, sub-split long ones
    const segments: string[] = [];
    let buffer = '';

    const flush = () => {
        const trimmed = buffer.trim();
        if (trimmed) segments.push(trimmed);
        buffer = '';
    };

    for (const para of paragraphs) {
        if (para.length > maxChars) {
            flush();
            // Split at sentence boundaries (. ! ?) — lookbehind supported in Node 20+
            const sentences = para.split(/(?<=[.!?])\s+/);
            let sentBuf = '';
            for (const s of sentences) {
                if (sentBuf.length + (sentBuf ? 1 : 0) + s.length > maxChars) {
                    if (sentBuf) segments.push(sentBuf.trim());
                    sentBuf = s;
                } else {
                    sentBuf = sentBuf ? `${sentBuf} ${s}` : s;
                }
            }
            if (sentBuf.trim()) segments.push(sentBuf.trim());
        } else if (buffer.length + (buffer ? 2 : 0) + para.length > maxChars) {
            flush();
            buffer = para;
        } else {
            buffer = buffer ? `${buffer}\n\n${para}` : para;
        }
    }
    flush();

    if (segments.length <= 1 || overlapChars <= 0) return segments;

    // Add overlap: prepend the tail of the previous segment to each next segment
    const chunks: string[] = [segments[0]!];
    for (let i = 1; i < segments.length; i++) {
        const overlap = segments[i - 1]!.slice(-overlapChars);
        chunks.push(`${overlap}\n\n${segments[i]}`);
    }
    return chunks;
}
