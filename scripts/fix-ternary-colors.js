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

// These are targeted ternary patterns and remaining color tokens across all dashboard files
const REPLACEMENTS = [
  // ok/danger ternaries
  ["? '#1a7a4a' : '#c4161c'", "? 'var(--ok)' : 'var(--danger)'"],
  ["? '#1a7a4a' : '#c4161c'", "? 'var(--ok)' : 'var(--danger)'"],
  [": '#1a7a4a' : '#c4161c'", ": 'var(--ok)' : 'var(--danger)'"],
  // warn ternaries
  ["? '#b45309' : '#aeaeb2'", "? 'var(--warn)' : 'var(--ink-muted)'"],
  ["? '#aeaeb2' : '#b45309'", "? 'var(--ink-muted)' : 'var(--warn)'"],
  ["? '#aeaeb2' : '#0369a1'", "? 'var(--ink-muted)' : 'var(--info)'"],
  ["? '#aeaeb2' : '#0066cc'", "? 'var(--ink-muted)' : 'var(--accent)'"],
  ["? '#aeaeb2' : '#1a7a4a'", "? 'var(--ink-muted)' : 'var(--ok)'"],
  // info sky colors
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  ["color: '#1e3a5f'", "color: 'var(--info)'"],
  ["color: '#0369a1'", "color: 'var(--info)'"],
  ["color: '#0284c7'", "color: 'var(--info)'"],
  ["color: '#0ea5e9'", "color: 'var(--info)'"],
  ["background: '#f0f9ff'", "background: 'var(--info-bg)'"],
  ["background: '#e0f2fe'", "background: 'var(--info-bg)'"],
  ["background: '#bae6fd'", "background: 'var(--info-bg)'"],
  // bg-deep/warn ternaries for tab active states
  ["drawerTab === 'summary' ? '#fef3c7' : 'transparent'", "drawerTab === 'summary' ? 'var(--warn-bg)' : 'transparent'"],
  ["drawerTab === 'evidence' ? '#fef3c7' : 'transparent'", "drawerTab === 'evidence' ? 'var(--warn-bg)' : 'transparent'"],
  ["drawerTab === 'negotiate' ? '#f0f9ff' : 'transparent'", "drawerTab === 'negotiate' ? 'var(--info-bg)' : 'transparent'"],
  // gate_category ternaries
  ["gate_category === 'compliance' ? '#fef2f2' : selectedApproval.gate_category === 'strategy' ? '#f0f9ff' : '#f9fafb'",
   "gate_category === 'compliance' ? 'var(--danger-bg)' : selectedApproval.gate_category === 'strategy' ? 'var(--info-bg)' : 'var(--bg)'"],
  ["gate_category === 'compliance' ? '#fca5a5' : selectedApproval.gate_category === 'strategy' ? '#bae6fd' : '#e5e7eb'",
   "gate_category === 'compliance' ? 'var(--danger-border)' : selectedApproval.gate_category === 'strategy' ? 'var(--info-border)' : 'var(--line)'"],
  // Runtime observability chart-friendly colors that aren't chart data
  ["color: '#374151'", "color: 'var(--ink-soft)'"],
  ["color: '#1f2937'", "color: 'var(--ink-soft)'"],
  ["color: '#dc2626'", "color: 'var(--danger)'"],
  ["color: '#ef4444'", "color: 'var(--danger)'"],
  ["color: '#f59e0b'", "color: 'var(--warn)'"],
  ["color: '#0f766e'", "color: 'var(--ok)'"],
  ["color: '#166534'", "color: 'var(--ok)'"],
  ["color: '#22c55e'", "color: 'var(--ok)'"],
  ["color: '#6366f1'", "color: 'var(--accent)'"],
  ["color: '#f97316'", "color: 'var(--warn)'"],
  ["background: '#1f2937'", "background: 'var(--bg-deep)'"],
  // Remaining adapter-discovery / connector patterns
  ["color=\"#0066cc\"", "color=\"var(--accent)\""],
  ["color=\"#fff\"", "color=\"var(--card)\""],
  ["color=\"#aeaeb2\"", "color=\"var(--ink-muted)\""],
  ["color=\"#d2d2d7\"", "color=\"var(--line)\""],
  ["color=\"#1a7a4a\"", "color=\"var(--ok)\""],
  ["color=\"#424245\"", "color=\"var(--ink-soft)\""],
  ["color=\"#c4161c\"", "color=\"var(--danger)\""],
  ["color=\"#7c2d92\"", "color=\"var(--accent)\""],
  ["color=\"#b45309\"", "color=\"var(--warn)\""],
  ["color=\"#6b7280\"", "color=\"var(--ink-muted)\""],
  ["color=\"#374151\"", "color=\"var(--ink-soft)\""],
  ["color=\"#0f766e\"", "color=\"var(--ok)\""],
  ["color=\"#3b82f6\"", "color=\"var(--info)\""],
  ["color=\"#f59e0b\"", "color=\"var(--warn)\""],
  ["color=\"#dc2626\"", "color=\"var(--danger)\""],
  ["color=\"#6366f1\"", "color=\"var(--accent)\""],
  ["color=\"#22c55e\"", "color=\"var(--ok)\""],
  ["color=\"#f97316\"", "color=\"var(--warn)\""],
  ["color=\"#ef4444\"", "color=\"var(--danger)\""],
  // Disabled state button backgrounds
  ["background: busy || !reason.trim() ? '#f5f5f7' : 'rgba(180,83,9,0.08)'",
   "background: busy || !reason.trim() ? 'var(--bg-deep)' : 'color-mix(in srgb, var(--warn) 8%, transparent)'"],
  ["background: delegateBusy || !delegateTargetUserId ? '#f5f5f7' : 'rgba(3,105,161,0.08)'",
   "background: delegateBusy || !delegateTargetUserId ? 'var(--bg-deep)' : 'var(--info-bg)'"],
  // Selected states in approval queue
  ["border: `1px solid ${isSelected ? '#0284c7' : '#e2e8f0'}`",
   "border: `1px solid ${isSelected ? 'var(--info)' : 'var(--line)'}`"],
  ["background: isSelected ? '#e0f2fe' : '#f8fafc'",
   "background: isSelected ? 'var(--info-bg)' : 'var(--bg)'"],
  // Remaining muted ternaries
  ["? '#aeaeb2' : 'rgba(180,83,9,0.35)'", "? 'var(--line)' : 'var(--warn-border)'"],
  // Result ok/error inline
  ["color: result.ok ? '#1a7a4a' : '#c4161c'", "color: result.ok ? 'var(--ok)' : 'var(--danger)'"],
  ["color: delegateResult.ok ? '#1a7a4a' : '#c4161c'", "color: delegateResult.ok ? 'var(--ok)' : 'var(--danger)'"],
  // Health / status color ternaries common across many panels
  ["? '#1a7a4a' : '#78716c'", "? 'var(--ok)' : 'var(--ink-muted)'"],
  ["? '#c4161c' : '#b45309'", "? 'var(--danger)' : 'var(--warn)'"],
  ["? '#b45309' : '#c4161c'", "? 'var(--warn)' : 'var(--danger)'"],
  ["? '#1a7a4a' : '#b45309'", "? 'var(--ok)' : 'var(--warn)'"],
  ["? '#b45309' : '#1a7a4a'", "? 'var(--warn)' : 'var(--ok)'"],
  // knowledge-graph-explorer remaining
  ["color: '#0f172a'", "color: 'var(--ink)'"],
  ["border: '1px solid #f0f9ff'", "border: '1px solid var(--info-border)'"],
  ["border: '1px solid #bae6fd'", "border: '1px solid var(--info-border)'"],
  // Various remaining from health/support panels
  ["background: '#0f766e'", "background: 'color-mix(in srgb, var(--ok) 15%, transparent)'"],
  ["background: '#dc2626'", "background: 'var(--danger)'"],
  ["background: '#f59e0b'", "background: 'var(--warn)'"],
  ["background: '#6366f1'", "background: 'var(--accent)'"],
  ["background: '#374151'", "background: 'var(--bg-deep)'"],
  // Connectors hub remaining
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  ["border: '1px solid #bfdbfe'", "border: '1px solid var(--info-border)'"],
  ["background: '#f0fdf4'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid #bbf7d0'", "border: '1px solid var(--ok-border)'"],
  // Remaining warn-bg
  ["background: '#fffbeb'", "background: 'var(--warn-bg)'"],
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["background: '#fef9c3'", "background: 'var(--warn-bg)'"],
  ["border: '1px solid #fde68a'", "border: '1px solid var(--warn-border)'"],
  // remaining danger-bg
  ["background: '#fff1f2'", "background: 'var(--danger-bg)'"],
  // White on various contexts (not white-on-accent buttons)
  ["background: '#fff'", "background: 'var(--card)'"],
  ["background: '#ffffff'", "background: 'var(--card)'"],
  // Misc remaining
  ["color: '#166534'", "color: 'var(--ok)'"],
  ["color: '#15803d'", "color: 'var(--ok)'"],
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  ["color: '#b45309'", "color: 'var(--warn)'"],
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  ["color: '#aeaeb2'", "color: 'var(--ink-muted)'"],
  ["color: '#d2d2d7'", "color: 'var(--line)'"],
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
