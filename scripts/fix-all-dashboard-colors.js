const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      results.push(...walk(full));
    } else if (e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts'))) {
      results.push(full);
    }
  }
  return results;
}

// These replacements are safe string replacements across all dashboard files
const REPLACEMENTS = [
  // ── Text colors (safe to replace universally in style props) ──
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  ["color: '#111827'", "color: 'var(--ink)'"],
  ["color: '#374151'", "color: 'var(--ink)'"],
  ["color: '#1a1a2e'", "color: 'var(--ink)'"],
  ["color: '#424245'", "color: 'var(--ink-soft)'"],
  ["color: '#44403c'", "color: 'var(--ink-soft)'"],
  ["color: '#4b5563'", "color: 'var(--ink-soft)'"],
  ["color: '#334155'", "color: 'var(--ink-soft)'"],
  ["color: '#1e293b'", "color: 'var(--ink-soft)'"],
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["color: '#57534e'", "color: 'var(--ink-muted)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  ["color: '#78716c'", "color: 'var(--ink-muted)'"],
  ["color: '#aeaeb2'", "color: 'var(--ink-muted)'"],
  ["color: '#94a3b8'", "color: 'var(--ink-muted)'"],
  ["color: '#9ca3af'", "color: 'var(--ink-muted)'"],
  ["color: '#a0a0a0'", "color: 'var(--ink-muted)'"],
  ["color: '#888'", "color: 'var(--ink-muted)'"],
  // ── Accent blue ──
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["color: '#0052cc'", "color: 'var(--accent)'"],
  ["color: '#0369a1'", "color: 'var(--info)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  ["color: '#2563eb'", "color: 'var(--info)'"],
  ["color: '#6366f1'", "color: 'var(--accent)'"],
  ["color: '#4f46e5'", "color: 'var(--accent)'"],
  ["color: '#3b82f6'", "color: 'var(--info)'"],
  // ── OK/success green ──
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  ["color: '#166534'", "color: 'var(--ok)'"],
  ["color: '#16a34a'", "color: 'var(--ok)'"],
  ["color: '#15803d'", "color: 'var(--ok)'"],
  ["color: '#059669'", "color: 'var(--ok)'"],
  // ── Warning amber/orange ──
  ["color: '#b45309'", "color: 'var(--warn)'"],
  ["color: '#92400e'", "color: 'var(--warn)'"],
  ["color: '#854d0e'", "color: 'var(--warn)'"],
  ["color: '#d97706'", "color: 'var(--warn)'"],
  ["color: '#f59e0b'", "color: 'var(--warn)'"],
  // ── Danger/error red ──
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  ["color: '#b91c1c'", "color: 'var(--danger)'"],
  ["color: '#991b1b'", "color: 'var(--danger)'"],
  ["color: '#dc2626'", "color: 'var(--danger)'"],
  ["color: '#ef4444'", "color: 'var(--danger)'"],
  ["color: '#e53e3e'", "color: 'var(--danger)'"],
  ["color: '#9b2c2c'", "color: 'var(--danger)'"],
  // ── Backgrounds ──
  ["background: '#fff'", "background: 'var(--card)'"],
  ["background: '#ffffff'", "background: 'var(--card)'"],
  ["background: '#f9fafb'", "background: 'var(--bg)'"],
  ["background: '#f8fafc'", "background: 'var(--bg)'"],
  ["background: '#f5f5f7'", "background: 'var(--bg)'"],
  ["background: '#f3f4f6'", "background: 'var(--bg)'"],
  ["background: '#f9f9f9'", "background: 'var(--bg)'"],
  ["background: '#f0f0f2'", "background: 'var(--bg)'"],
  ["background: '#f1f5f9'", "background: 'var(--bg)'"],
  ["background: '#f8f9fa'", "background: 'var(--bg)'"],
  ["background: '#e5e7eb'", "background: 'var(--line)'"],
  ["background: '#e2e8f0'", "background: 'var(--line)'"],
  ["background: '#f3f4f6'", "background: 'var(--bg)'"],
  // Status backgrounds
  ["background: '#fee2e2'", "background: 'var(--danger-bg)'"],
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  ["background: '#fef0f0'", "background: 'var(--danger-bg)'"],
  ["background: '#fff5f5'", "background: 'var(--danger-bg)'"],
  ["background: '#dcfce7'", "background: 'var(--ok-bg)'"],
  ["background: '#f0fdf4'", "background: 'var(--ok-bg)'"],
  ["background: '#d1fae5'", "background: 'var(--ok-bg)'"],
  ["background: '#ecfdf5'", "background: 'var(--ok-bg)'"],
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["background: '#fef9c3'", "background: 'var(--warn-bg)'"],
  ["background: '#fffbeb'", "background: 'var(--warn-bg)'"],
  ["background: '#dbeafe'", "background: 'var(--info-bg)'"],
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  ["background: '#e0f2fe'", "background: 'var(--info-bg)'"],
  // ── Borders ──
  ["border: '1px solid #e5e7eb'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #e2e8f0'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #d2d2d7'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #e5e5ea'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #d1d5db'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #e8e8ed'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #eee'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #ddd'", "border: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #e5e7eb'", "borderBottom: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #e2e8f0'", "borderBottom: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #d2d2d7'", "borderBottom: '1px solid var(--line)'"],
  ["borderBottom: '2px solid #e5e7eb'", "borderBottom: '2px solid var(--line)'"],
  ["borderBottom: '1px solid #f3f4f6'", "borderBottom: '1px solid var(--line)'"],
  ["borderTop: '1px solid #e5e7eb'", "borderTop: '1px solid var(--line)'"],
  ["borderTop: '1px solid #e2e8f0'", "borderTop: '1px solid var(--line)'"],
  ["borderLeft: '1px solid #e5e7eb'", "borderLeft: '1px solid var(--line)'"],
  ["borderRight: '1px solid #e5e7eb'", "borderRight: '1px solid var(--line)'"],
  // Status borders
  ["border: '1px solid #fca5a5'", "border: '1px solid var(--danger-border)'"],
  ["border: '1px solid #fecaca'", "border: '1px solid var(--danger-border)'"],
  ["border: '1px solid #bbf7d0'", "border: '1px solid var(--ok-border)'"],
  ["border: '1px solid #86efac'", "border: '1px solid var(--ok-border)'"],
  ["border: '1px solid #fde68a'", "border: '1px solid var(--warn-border)'"],
  ["border: '1px solid #93c5fd'", "border: '1px solid var(--info-border)'"],
  ["border: '1px solid #bfdbfe'", "border: '1px solid var(--info-border)'"],
  // rgba status colors
  ["background: 'rgba(196,22,28,0.07)'", "background: 'var(--danger-bg)'"],
  ["background: 'rgba(196,22,28,0.06)'", "background: 'var(--danger-bg)'"],
  ["background: 'rgba(196,22,28,0.08)'", "background: 'var(--danger-bg)'"],
  ["border: '1px solid rgba(196,22,28,0.2)'", "border: '1px solid var(--danger-border)'"],
  ["border: '1px solid rgba(196,22,28,0.25)'", "border: '1px solid var(--danger-border)'"],
  ["background: 'rgba(26,122,74,0.06)'", "background: 'var(--ok-bg)'"],
  ["background: 'rgba(26,122,74,0.07)'", "background: 'var(--ok-bg)'"],
  ["background: 'rgba(26,122,74,0.08)'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid rgba(26,122,74,0.2)'", "border: '1px solid var(--ok-border)'"],
  ["background: 'rgba(180,83,9,0.07)'", "background: 'var(--warn-bg)'"],
  ["background: 'rgba(180,83,9,0.08)'", "background: 'color-mix(in srgb, var(--warn) 8%, transparent)'"],
  ["border: '1px solid rgba(180,83,9,0.2)'", "border: '1px solid var(--warn-border)'"],
  ["background: 'rgba(0,102,204,0.07)'", "background: 'color-mix(in srgb, var(--accent) 7%, transparent)'"],
  ["background: 'rgba(0,102,204,0.08)'", "background: 'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["background: 'rgba(0,52,204,0.08)'", "background: 'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["border: '1px solid rgba(0,102,204,0.2)'", "border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)'"],
  // Icon color props in JSX (color="...") — replace common patterns
  // Don't do these broadly as they may conflict with intentional multi-color uses
];

const files = walk('apps/dashboard/app');
let totalChanges = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, src, 'utf8');
    totalChanges++;
    console.log('fixed:', f.replace(/\\/g, '/'));
  }
}
console.log(`\nTotal files modified: ${totalChanges}`);
