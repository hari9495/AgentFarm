import TurndownService from 'turndown';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

// ---------------------------------------------------------------------------
// MarkItDown helper (PDF + PPTX)
// Resolves the markitdown CLI from the workspace .venv so it works both
// locally (Windows/Linux) and inside Docker (where the venv is at /app/.venv).
// ---------------------------------------------------------------------------

function resolveMarkitdownCli(): string {
    const __filename = fileURLToPath(import.meta.url);
    // packages/document-converter/src → go 3 levels up to workspace root
    const workspaceRoot = resolve(dirname(__filename), '..', '..', '..');
    const candidates = [
        join(workspaceRoot, '.venv', 'Scripts', 'markitdown.exe'), // Windows dev
        join(workspaceRoot, '.venv', 'bin', 'markitdown'),          // Linux dev
        '/app/.venv/bin/markitdown',                                 // Docker / CI
    ];
    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    return 'markitdown'; // fall back to PATH
}

const MARKITDOWN_CLI = resolveMarkitdownCli();

async function markitdownConvert(buffer: Buffer, ext: string): Promise<string> {
    const tmpPath = join(tmpdir(), `af-doc-${randomBytes(8).toString('hex')}${ext}`);
    try {
        writeFileSync(tmpPath, buffer);
        const result = spawnSync(MARKITDOWN_CLI, [tmpPath], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30_000,
        });
        const out = result.stdout?.trim() ?? '';
        if (result.status === 0 && out) {
            return out;
        }
        // Fall back — caller will use legacy parser
        throw new Error(result.stderr?.trim() || `markitdown exited ${result.status}`);
    } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const SUPPORTED_MIME_TYPES = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',
    'text/xml',
    'application/json',
    'application/xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'message/rfc822',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

const EXT_MIME_MAP: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.eml': 'message/rfc822',
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

/**
 * Thrown when image OCR is attempted but neither MarkItDown (Azure Document
 * Intelligence) nor a local Tesseract installation is available.
 * Callers should surface this as a 503 so operators know it's a config gap,
 * not a bug in the document conversion pipeline.
 */
export class OcrNotConfiguredError extends Error {
    constructor() {
        super(
            'Image OCR is not available. Configure one of: ' +
            '(1) MarkItDown with AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT + AZURE_DOCUMENT_INTELLIGENCE_KEY, ' +
            'or (2) install Tesseract locally (apt-get install tesseract-ocr / brew install tesseract).',
        );
        this.name = 'OcrNotConfiguredError';
    }
}

// ---------------------------------------------------------------------------
// Tesseract local OCR fallback (system binary — no npm dep required)
// ---------------------------------------------------------------------------

async function tesseractOcr(buffer: Buffer, ext: string): Promise<string> {
    const id = randomBytes(8).toString('hex');
    const tmpIn  = join(tmpdir(), `af-ocr-in-${id}${ext}`);
    const tmpOut = join(tmpdir(), `af-ocr-out-${id}`); // tesseract appends .txt
    try {
        writeFileSync(tmpIn, buffer);
        const result = spawnSync('tesseract', [tmpIn, tmpOut, '-l', 'eng', 'quiet'], {
            encoding: 'utf8',
            timeout: 30_000,
        });
        if (result.status !== 0 || result.error) {
            throw new Error(result.stderr?.trim() || `tesseract exited ${result.status}`);
        }
        return readFileSync(`${tmpOut}.txt`, 'utf8').trim();
    } finally {
        try { unlinkSync(tmpIn); }            catch { /* ignore */ }
        try { unlinkSync(`${tmpOut}.txt`); }  catch { /* ignore */ }
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

        case 'text/markdown':
            // Already markdown — pass through unchanged.
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
            // MarkItDown produces structured Markdown (headings, tables) — significantly more
            // token-efficient and LLM-friendly than the raw text dump from pdf-parse.
            try {
                return await markitdownConvert(buffer, '.pdf');
            } catch {
                // Fallback: pdf-parse (CJS; dynamic import avoids ESM interop issues)
                const mod = await import('pdf-parse');
                const pdfParse = (mod.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
                const result = await pdfParse(buffer);
                return result.text;
            }
        }

        case 'text/xml':
        case 'application/xml': {
            try {
                return await markitdownConvert(buffer, '.xml');
            } catch {
                return buffer.toString('utf8');
            }
        }

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
            // MarkItDown produces cleaner Markdown than the mammoth→HTML→turndown chain.
            try {
                return await markitdownConvert(buffer, '.docx');
            } catch {
                const result = await mammoth.convertToHtml({ buffer });
                return td.turndown(result.value);
            }
        }

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            // MarkItDown produces proper Markdown tables vs ExcelJS's CSV-style rows.
            try {
                return await markitdownConvert(buffer, '.xlsx');
            } catch {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
                const sections = workbook.worksheets.map(ws => {
                    const rows: string[] = [];
                    ws.eachRow((row) => {
                        const cells = (row.values as unknown[]).slice(1);
                        rows.push(cells.map(v => (v == null ? '' : String(v))).join(','));
                    });
                    return `## ${ws.name}\n\n${rows.join('\n')}`;
                });
                return sections.join('\n\n');
            }
        }

        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
            try {
                return await markitdownConvert(buffer, '.pptx');
            } catch {
                // officeparser v7: parseOffice returns an AST; `.to('text')` yields plain text.
                const { parseOffice } = await import('officeparser');
                const ast = await parseOffice(buffer);
                return (await ast.to('text')).value;
            }
        }

        case 'image/png':
        case 'image/jpeg':
        case 'image/gif':
        case 'image/webp': {
            const imgExtMap: Record<string, string> = {
                'image/png': '.png', 'image/jpeg': '.jpg',
                'image/gif': '.gif', 'image/webp': '.webp',
            };
            const ext = imgExtMap[base]!;
            // Primary: MarkItDown with Azure Document Intelligence OCR
            try {
                return await markitdownConvert(buffer, ext);
            } catch { /* fall through to Tesseract */ }
            // Fallback: local Tesseract binary (no cloud credentials needed)
            try {
                return await tesseractOcr(buffer, ext);
            } catch { /* fall through to error */ }
            throw new OcrNotConfiguredError();
        }

        case 'message/rfc822': {
            try {
                return await markitdownConvert(buffer, '.eml');
            } catch {
                return buffer.toString('utf8');
            }
        }

        default:
            throw new UnsupportedFormatError(mimeType);
    }
}
