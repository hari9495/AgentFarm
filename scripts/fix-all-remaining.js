/**
 * Final cleanup: convert every remaining hex color literal to the best CSS var.
 * This is a best-effort broad sweep — some edge cases (chart data, brand logos,
 * decorative macOS traffic-light buttons) are intentionally left unchanged below.
 */
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

// Broad hex-to-var mapping (applied as bare string replace, both with and without surrounding quotes)
const MAP = [
  // ── Text (ink) ────────────────────────────────────────────────────────────────
  ['#1d1d1f', 'var(--ink)'],
  ['#111827', 'var(--ink)'],
  ['#0f172a', 'var(--ink)'],
  ['#1e293b', 'var(--ink)'],   // as text color context
  ['#0f0f1a', 'var(--ink)'],
  ['#374151', 'var(--ink-soft)'],
  ['#1f2937', 'var(--ink-soft)'],
  ['#2d3748', 'var(--ink-soft)'],
  ['#424245', 'var(--ink-soft)'],
  ['#44403c', 'var(--ink-soft)'],
  ['#334155', 'var(--ink-muted)'],
  ['#4b5563', 'var(--ink-muted)'],
  ['#475569', 'var(--ink-muted)'],
  ['#6b7280', 'var(--ink-muted)'],
  ['#6e6e73', 'var(--ink-muted)'],
  ['#57534e', 'var(--ink-muted)'],
  ['#78716c', 'var(--ink-muted)'],
  ['#737373', 'var(--ink-muted)'],
  ['#71717a', 'var(--ink-muted)'],
  ['#64748b', 'var(--ink-muted)'],
  ['#52525b', 'var(--ink-muted)'],
  ['#94a3b8', 'var(--ink-muted)'],
  ['#9ca3af', 'var(--ink-muted)'],
  ['#a0a0a0', 'var(--ink-muted)'],
  ['#a1a1aa', 'var(--ink-muted)'],
  ['#aeaeb2', 'var(--ink-muted)'],
  ['#818cf8', 'var(--accent)'],
  // ── Accent/info blues ────────────────────────────────────────────────────────
  ['#0066cc', 'var(--accent)'],
  ['#0052cc', 'var(--accent)'],
  ['#4f46e5', 'var(--accent)'],
  ['#6366f1', 'var(--accent)'],
  ['#3b82f6', 'var(--info)'],
  ['#2563eb', 'var(--info)'],
  ['#1d4ed8', 'var(--info)'],
  ['#0369a1', 'var(--info)'],
  ['#0284c7', 'var(--info)'],
  ['#0891b2', 'var(--info)'],
  ['#0d9488', 'var(--info)'],
  ['#0c4a6e', 'var(--info)'],
  ['#1e3a5f', 'var(--info)'],
  ['#1a3a6b', 'var(--info)'],
  ['#1e1b4b', 'var(--info)'],
  ['#60a5fa', 'var(--info)'],
  ['#93c5fd', 'var(--info)'],
  ['#a5c8ff', 'var(--info)'],
  ['#bfdbfe', 'var(--info)'],
  ['#c7d2fe', 'var(--info)'],
  // ── OK/green ─────────────────────────────────────────────────────────────────
  ['#1a7a4a', 'var(--ok)'],
  ['#166534', 'var(--ok)'],
  ['#14532d', 'var(--ok)'],
  ['#15803d', 'var(--ok)'],
  ['#16a34a', 'var(--ok)'],
  ['#059669', 'var(--ok)'],
  ['#065f46', 'var(--ok)'],
  ['#0f766e', 'var(--ok)'],
  ['#22c55e', 'var(--ok)'],
  ['#34d399', 'var(--ok)'],
  ['#6ee7b7', 'var(--ok)'],
  ['#86efac', 'var(--ok)'],
  ['#a8e6cf', 'var(--ok)'],
  ['#bbf7d0', 'var(--ok)'],
  // ── Warn/amber/orange ────────────────────────────────────────────────────────
  ['#b45309', 'var(--warn)'],
  ['#92400e', 'var(--warn)'],
  ['#ca8a04', 'var(--warn)'],
  ['#d97706', 'var(--warn)'],
  ['#f59e0b', 'var(--warn)'],
  ['#ea580c', 'var(--warn)'],
  ['#f97316', 'var(--warn)'],
  ['#fcd34d', 'var(--warn)'],
  ['#fde68a', 'var(--warn)'],
  ['#fdba74', 'var(--warn)'],
  ['#ffd93d', 'var(--warn)'],
  // ── Danger/red ───────────────────────────────────────────────────────────────
  ['#c4161c', 'var(--danger)'],
  ['#b91c1c', 'var(--danger)'],
  ['#991b1b', 'var(--danger)'],
  ['#dc2626', 'var(--danger)'],
  ['#ef4444', 'var(--danger)'],
  ['#e11d48', 'var(--danger)'],
  ['#f87171', 'var(--danger)'],
  ['#fca5a5', 'var(--danger)'],
  ['#ff6b6b', 'var(--danger)'],
  // ── Backgrounds ──────────────────────────────────────────────────────────────
  ['#ffffff', 'var(--card)'],
  ['#fff', 'var(--card)'],
  ['#f5f5f7', 'var(--bg)'],
  ['#f5f5f5', 'var(--bg)'],
  ['#fafafa', 'var(--bg)'],
  ['#f8fafc', 'var(--bg)'],
  ['#f9fafb', 'var(--bg)'],
  ['#f3f4f6', 'var(--bg)'],
  ['#f9f9f9', 'var(--bg)'],
  ['#f0f0f2', 'var(--bg)'],
  ['#f1f5f9', 'var(--bg)'],
  ['#f8f9fa', 'var(--bg)'],
  ['#0f172a', 'var(--bg-deep)'],
  ['#0f1117', 'var(--bg-deep)'],
  ['#111113', 'var(--bg-deep)'],
  ['#1a1a1c', 'var(--bg-deep)'],
  ['#0c0e1c', 'var(--bg-deep)'],
  ['#0f0f1a', 'var(--bg-deep)'],
  ['#111827', 'var(--bg-deep)'],
  ['#1c1917', 'var(--bg-deep)'],
  ['#1e293b', 'var(--bg-deep)'],
  ['#18181b', 'var(--bg-deep)'],
  ['#09090b', 'var(--bg-deep)'],
  ['#27272a', 'var(--bg-deep)'],
  ['#161929', 'var(--bg-deep)'],
  ['#1e2235', 'var(--bg-deep)'],
  ['#1e1e2e', 'var(--bg-deep)'],
  ['#1c2b3a', 'var(--bg-deep)'],
  ['#2a2d45', 'var(--bg-deep)'],
  // Status backgrounds
  ['#dcfce7', 'var(--ok-bg)'],
  ['#d1fae5', 'var(--ok-bg)'],
  ['#ecfdf5', 'var(--ok-bg)'],
  ['#f0fdf4', 'var(--ok-bg)'],
  ['#1c2d1e', 'var(--ok-bg)'],
  ['#1e3a2f', 'var(--ok-bg)'],
  ['#14532d', 'var(--ok-bg)'],
  ['#fef9c3', 'var(--warn-bg)'],
  ['#fef3c7', 'var(--warn-bg)'],
  ['#fffbeb', 'var(--warn-bg)'],
  ['#fde68a', 'var(--warn-bg)'],
  ['#422006', 'var(--warn-bg)'],
  ['#431407', 'var(--warn-bg)'],
  ['#fee2e2', 'var(--danger-bg)'],
  ['#fef2f2', 'var(--danger-bg)'],
  ['#fef0f0', 'var(--danger-bg)'],
  ['#fff5f5', 'var(--danger-bg)'],
  ['#450a0a', 'var(--danger-bg)'],
  ['#3b0d0d', 'var(--danger-bg)'],
  ['#7f1d1d', 'var(--danger-bg)'],
  ['#dbeafe', 'var(--info-bg)'],
  ['#eff6ff', 'var(--info-bg)'],
  ['#e0f2fe', 'var(--info-bg)'],
  ['#f0f9ff', 'var(--info-bg)'],
  ['#bae6fd', 'var(--info-bg)'],
  ['#1e3a8a', 'var(--info-bg)'],
  ['#172554', 'var(--info-bg)'],
  // ── Borders/lines ────────────────────────────────────────────────────────────
  ['#d2d2d7', 'var(--line)'],
  ['#d1d5db', 'var(--line)'],
  ['#e5e7eb', 'var(--line)'],
  ['#e2e8f0', 'var(--line)'],
  ['#e5e5ea', 'var(--line)'],
  ['#e8e8ed', 'var(--line)'],
  ['#eee', 'var(--line)'],
  ['#ddd', 'var(--line)'],
  ['#ccc', 'var(--line-strong)'],
  // ── Shorthand ────────────────────────────────────────────────────────────────
  ['#555', 'var(--ink-soft)'],
  ['#666', 'var(--ink-muted)'],
  ['#888', 'var(--ink-muted)'],
  ['#999', 'var(--ink-muted)'],
  ['#333', 'var(--ink)'],
  ['#444', 'var(--ink-soft)'],
  ['#000', 'var(--ink)'],
];

// INTENTIONALLY KEPT (do not replace):
// '#ff5f57', '#febc2e', '#28c840' — macOS traffic-light buttons (sse-stream-panel)
// '#7c2d92', '#7c3aed', '#db2777' — purple/pink brand colors (no CSS var equivalent)
// '#34c759', '#c7c7cc', '#0071e3', '#5599d8' — iOS/Apple UI colors (signup page)
// '#4a154b', '#e8d5ff' — Slack brand colors (notifications)
// '#f43f5e', '#e11d48' — rose-red (may have been mapped to --danger already)

function applyMap(src) {
  for (const [hex, cssVar] of MAP) {
    const quoted = `'${hex}'`;
    const replacement = `'${cssVar}'`;
    if (src.includes(quoted)) {
      src = src.split(quoted).join(replacement);
    }
  }
  return src;
}

const files = walk('apps/dashboard/app');
let totalChanges = 0;

for (const f of files) {
  const original = fs.readFileSync(f, 'utf8');
  const updated = applyMap(original);
  if (original !== updated) {
    fs.writeFileSync(f, updated, 'utf8');
    totalChanges++;
    console.log('fixed:', f.replace(/\\/g, '/'));
  }
}
console.log(`\nTotal files modified: ${totalChanges}`);
