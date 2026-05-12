// ── CLI output helpers ────────────────────────────────────────────────────────

export function printTable(rows: Array<Record<string, string | number | null | undefined>>, columns: string[]): void {
    const widths = columns.map((col) =>
        Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length)),
    );
    const header = columns.map((col, i) => col.padEnd(widths[i]!)).join('  ');
    const divider = widths.map((w) => '─'.repeat(w)).join('  ');
    console.log(header);
    console.log(divider);
    for (const row of rows) {
        console.log(columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i]!)).join('  '));
    }
}

export function printJson(value: unknown): void {
    console.log(JSON.stringify(value, null, 2));
}

export function printError(message: string): void {
    console.error(`Error: ${message}`);
}

export function printSuccess(message: string): void {
    console.log(`✓ ${message}`);
}
