import TurndownService from 'turndown';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SUPPORTED_MIME_TYPES = [
    'text/plain',
    'text/html',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

const EXT_MIME_MAP: Record<string, string> = {
    '.txt':  'text/plain',
    '.html': 'text/html',
    '.htm':  'text/html',
    '.csv':  'text/csv',
    '.json': 'application/json',
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function detectMimeType(filename: string): string | undefined {
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return undefined;
    return EXT_MIME_MAP[filename.slice(dot).toLowerCase()];
}

export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
    return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export class UnsupportedFormatError extends Error {
    constructor(mimeType: string) {
        super(`Unsupported MIME type: ${mimeType}`);
        this.name = 'UnsupportedFormatError';
    }
}

// ---------------------------------------------------------------------------
// Core converter
// ---------------------------------------------------------------------------

export async function convertToMarkdown(buffer: Buffer, mimeType: string): Promise<string> {
    const base = mimeType.split(';')[0].trim().toLowerCase();

    switch (base) {
        case 'text/plain':
            return buffer.toString('utf8');

        case 'text/csv':
            return buffer.toString('utf8');

        case 'text/html':
            return td.turndown(buffer.toString('utf8'));

        case 'application/json': {
            try {
                return '```json\n' + JSON.stringify(JSON.parse(buffer.toString('utf8')), null, 2) + '\n```';
            } catch {
                return buffer.toString('utf8');
            }
        }

        case 'application/pdf': {
            // pdf-parse is CJS; dynamic import avoids ESM interop issues at module load time
            const mod = await import('pdf-parse');
            const pdfParse = (mod.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
            const result = await pdfParse(buffer);
            return result.text;
        }

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
            const result = await mammoth.convertToHtml({ buffer });
            return td.turndown(result.value);
        }

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const sections = wb.SheetNames.map(name => {
                const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]!);
                return `## ${name}\n\n${csv}`;
            });
            return sections.join('\n\n');
        }

        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
            // officeparser v4+ accepts a Buffer directly and auto-detects PPTX from ZIP structure
            const { parseOfficeAsync } = await import('officeparser');
            return parseOfficeAsync(buffer as unknown as string);
        }

        default:
            throw new UnsupportedFormatError(mimeType);
    }
}
