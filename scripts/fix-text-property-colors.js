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

// text: property form (used in badge/chip color data structures)
const REPLACEMENTS = [
  // internal-sidebar AGENT_COLORS text values
  ["text: '#0066cc'", "text: 'var(--accent)'"],
  ["text: '#059669'", "text: 'var(--ok)'"],
  ["text: '#e11d48'", "text: 'var(--danger)'"],
  ["text: '#ea580c'", "text: 'var(--warn)'"],
  ["text: '#0d9488'", "text: 'var(--info)'"],
  ["text: '#0891b2'", "text: 'var(--info)'"],
  ["text: '#4f46e5'", "text: 'var(--accent)'"],
  ["text: '#0284c7'", "text: 'var(--info)'"],
  ["text: '#ca8a04'", "text: 'var(--warn)'"],
  ["text: '#475569'", "text: 'var(--ink-muted)'"],
  // internal-sidebar active icon color ternary
  ["color: active ? '#0066cc' : c.text", "color: active ? 'var(--accent)' : c.text"],
  // portal/support/history remaining
  ["color: '#475569'", "color: 'var(--ink-muted)'"],
  ["color: '#1e293b'", "color: 'var(--ink)'"],
  ["color: '#f8fafc'", "color: 'var(--bg)'"],
  ["background: '#f8fafc'", "background: 'var(--bg)'"],
  ["color: '#92400e'", "color: 'var(--warn)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  ["color: '#15803d'", "color: 'var(--ok)'"],
  ["color: '#b91c1c'", "color: 'var(--danger)'"],
  ["color: '#2563eb'", "color: 'var(--info)'"],
  ["color: '#334155'", "color: 'var(--ink-muted)'"],
  ["color: '#e2e8f0'", "color: 'var(--ink)'"],
  // signup/page remaining
  ["background: '#0066cc'", "background: 'var(--accent)'"],
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["border: '1px solid #d2d2d7'", "border: '1px solid var(--line)'"],
  ["color: '#d2d2d7'", "color: 'var(--line)'"],
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  ["color: '#8e8e93'", "color: 'var(--ink-muted)'"],
  // various remaining across all files
  ["color: '#374151'", "color: 'var(--ink-soft)'"],
  ["color: '#9ca3af'", "color: 'var(--ink-muted)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  ["color: '#4b5563'", "color: 'var(--ink-muted)'"],
  ["color: '#1f2937'", "color: 'var(--ink-soft)'"],
  ["color: '#111827'", "color: 'var(--ink)'"],
  ["color: '#374151'", "color: 'var(--ink-soft)'"],
  ["color: '#d1d5db'", "color: 'var(--line)'"],
  ["color: '#e5e7eb'", "color: 'var(--line)'"],
  ["color: '#2d3748'", "color: 'var(--ink-soft)'"],
  // background forms remaining
  ["background: '#1e293b'", "background: 'var(--bg-deep)'"],
  ["background: '#334155'", "background: 'var(--bg-deep)'"],
  ["background: '#2d3748'", "background: 'var(--bg-deep)'"],
  ["background: '#1a202c'", "background: 'var(--bg-deep)'"],
  ["background: '#e2e8f0'", "background: 'var(--bg)'"],
  ["background: '#f8fafc'", "background: 'var(--bg)'"],
  // agent-detail/insights remaining
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  ["background: '#dcfce7'", "background: 'var(--ok-bg)'"],
  // meeting-sessions remaining
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  // api-keys remaining
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  // support-queue remaining
  ["background: '#ecfdf5'", "background: 'var(--ok-bg)'"],
  // notifications remaining
  ["background: '#fef9c3'", "background: 'var(--warn-bg)'"],
  // connector-marketplace remaining
  ["background: '#27272a'", "background: 'var(--bg-deep)'"],
  ["background: '#09090b'", "background: 'var(--bg-deep)'"],
  // agent-control panel remaining
  ["background: '#fee2e2'", "background: 'var(--danger-bg)'"],
  ["background: '#dcfce7'", "background: 'var(--ok-bg)'"],
  // page.tsx (main dashboard) remaining
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  // provisioning remaining
  ["background: '#dbeafe'", "background: 'var(--info-bg)'"],
  // misc remaining border forms
  ["borderColor: '#e5e7eb'", "borderColor: 'var(--line)'"],
  ["borderColor: '#d1d5db'", "borderColor: 'var(--line)'"],
];

const files = walk('apps/dashboard/app');
let totalChanges = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (from !== to && src.includes(from)) {
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
