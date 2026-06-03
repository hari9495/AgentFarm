import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
    convertToMarkdown,
    detectMimeType,
    isSupportedMimeType,
    UnsupportedFormatError,
    SUPPORTED_MIME_TYPES,
} from './index.js';

// ---------------------------------------------------------------------------
// detectMimeType
// ---------------------------------------------------------------------------

describe('detectMimeType', () => {
    test('maps known extensions', () => {
        assert.equal(detectMimeType('report.pdf'),   'application/pdf');
        assert.equal(detectMimeType('spec.docx'),    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        assert.equal(detectMimeType('data.xlsx'),    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.equal(detectMimeType('deck.pptx'),    'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        assert.equal(detectMimeType('page.html'),    'text/html');
        assert.equal(detectMimeType('page.htm'),     'text/html');
        assert.equal(detectMimeType('notes.txt'),    'text/plain');
        assert.equal(detectMimeType('config.json'),  'application/json');
        assert.equal(detectMimeType('export.csv'),   'text/csv');
    });

    test('is case-insensitive', () => {
        assert.equal(detectMimeType('Report.PDF'),  'application/pdf');
        assert.equal(detectMimeType('Data.XLSX'),   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    test('returns undefined for unknown extensions', () => {
        assert.equal(detectMimeType('file.xyz'),    undefined);
        assert.equal(detectMimeType('binary.bin'),  undefined);
        assert.equal(detectMimeType('no-ext'),      undefined);
    });
});

// ---------------------------------------------------------------------------
// isSupportedMimeType
// ---------------------------------------------------------------------------

describe('isSupportedMimeType', () => {
    test('returns true for every entry in SUPPORTED_MIME_TYPES', () => {
        for (const mime of SUPPORTED_MIME_TYPES) {
            assert.equal(isSupportedMimeType(mime), true, `expected true for ${mime}`);
        }
    });

    test('returns false for unsupported types', () => {
        assert.equal(isSupportedMimeType('image/png'),   false);
        assert.equal(isSupportedMimeType('video/mp4'),   false);
        assert.equal(isSupportedMimeType('audio/mpeg'),  false);
    });
});

// ---------------------------------------------------------------------------
// convertToMarkdown — pure / zero-dependency paths
// ---------------------------------------------------------------------------

describe('convertToMarkdown', () => {
    test('text/plain — passthrough', async () => {
        const input = 'Hello world\nLine 2';
        const result = await convertToMarkdown(Buffer.from(input), 'text/plain');
        assert.equal(result, input);
    });

    test('text/plain — strips charset param', async () => {
        const result = await convertToMarkdown(Buffer.from('Hello'), 'text/plain; charset=utf-8');
        assert.equal(result, 'Hello');
    });

    test('text/csv — passthrough', async () => {
        const csv = 'name,age\nAlice,30\nBob,25';
        const result = await convertToMarkdown(Buffer.from(csv), 'text/csv');
        assert.equal(result, csv);
    });

    test('application/json — formats to fenced code block', async () => {
        const json = JSON.stringify({ key: 'value', num: 42 });
        const result = await convertToMarkdown(Buffer.from(json), 'application/json');
        assert.match(result, /^```json\n/);
        assert.match(result, /\n```$/);
        assert.match(result, /"key": "value"/);
        assert.match(result, /"num": 42/);
    });

    test('application/json — falls back to raw string on invalid JSON', async () => {
        const bad = 'not {{ json }}';
        const result = await convertToMarkdown(Buffer.from(bad), 'application/json');
        assert.equal(result, bad);
    });

    test('text/html — converts headings', async () => {
        const html = '<h1>Title</h1><p>Body with <strong>bold</strong>.</p>';
        const result = await convertToMarkdown(Buffer.from(html), 'text/html');
        assert.match(result, /^# Title/m);
        assert.match(result, /\*\*bold\*\*/);
    });

    test('text/html — converts lists', async () => {
        const html = '<ul><li>Alpha</li><li>Beta</li></ul>';
        const result = await convertToMarkdown(Buffer.from(html), 'text/html');
        assert.match(result, /Alpha/);
        assert.match(result, /Beta/);
    });

    test('text/html — converts links', async () => {
        const html = '<a href="https://example.com">Example</a>';
        const result = await convertToMarkdown(Buffer.from(html), 'text/html');
        assert.match(result, /\[Example\]\(https:\/\/example\.com\)/);
    });

    // ---------------------------------------------------------------------------
    // XLSX — create a real workbook buffer using exceljs
    // ---------------------------------------------------------------------------

    test('xlsx — single sheet renders as markdown section with csv content', async () => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Results');
        ws.addRow(['Name', 'Score']);
        ws.addRow(['Alice', 95]);
        ws.addRow(['Bob', 88]);
        const raw = await wb.xlsx.writeBuffer();
        const buf = Buffer.from(raw);

        const result = await convertToMarkdown(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.match(result, /## Results/);
        assert.match(result, /Alice/);
        assert.match(result, /95/);
        assert.match(result, /Bob/);
    });

    test('xlsx — multiple sheets each get a ## heading', async () => {
        const wb = new ExcelJS.Workbook();
        const ws1 = wb.addWorksheet('Sheet1');
        ws1.addRow(['A', 1]);
        const ws2 = wb.addWorksheet('Sheet2');
        ws2.addRow(['B', 2]);
        const raw = await wb.xlsx.writeBuffer();
        const buf = Buffer.from(raw);

        const result = await convertToMarkdown(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        assert.match(result, /## Sheet1/);
        assert.match(result, /## Sheet2/);
    });

    // ---------------------------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------------------------

    test('unsupported mime type throws UnsupportedFormatError', async () => {
        await assert.rejects(
            () => convertToMarkdown(Buffer.from('data'), 'image/png'),
            (err: unknown) => {
                assert.ok(err instanceof UnsupportedFormatError);
                assert.match((err as Error).message, /Unsupported/);
                return true;
            },
        );
    });

    test('UnsupportedFormatError has correct name', async () => {
        await assert.rejects(
            () => convertToMarkdown(Buffer.from('x'), 'audio/mpeg'),
            (err: unknown) => {
                assert.equal((err as Error).name, 'UnsupportedFormatError');
                return true;
            },
        );
    });
});
