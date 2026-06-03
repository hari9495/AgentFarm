import TurndownService from 'turndown';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
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
        if (result.status === 0 && result.stdout) {
            return result.stdout.trim();
        }
        // Fall back — caller will use legacy parser
        throw new Error(result.stderr || `markitdown exited ${result.status}`);
    } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
}

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
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
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

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
            const result = await mammoth.convertToHtml({ buffer });
            return td.turndown(result.value);
        }

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
            const workbook = new ExcelJS.Workbook();
            // exceljs load() accepts Buffer; cast through unknown to satisfy strict overload types
            await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
            const sections = workbook.worksheets.map(ws => {
                const rows: string[] = [];
                ws.eachRow((row) => {
                    // row.values is 1-indexed; slice(1) drops the undefined 0th slot
                    const cells = (row.values as unknown[]).slice(1);
                    rows.push(cells.map(v => (v == null ? '' : String(v))).join(','));
                });
                return `## ${ws.name}\n\n${rows.join('\n')}`;
            });
            return sections.join('\n\n');
        }

        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
            // MarkItDown produces slide-by-slide Markdown structure vs officeparser's flat text.
            try {
                return await markitdownConvert(buffer, '.pptx');
            } catch {
                // Fallback: officeparser
                const { parseOfficeAsync } = await import('officeparser');
                return parseOfficeAsync(buffer as unknown as string);
            }
        }

        default:
            throw new UnsupportedFormatError(mimeType);
    }
}
