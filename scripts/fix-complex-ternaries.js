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

// Complex multi-way ternaries and remaining dark-panel colors
const REPLACEMENTS = [
  // adapter-discovery step indicator ternaries
  ["background: step === n ? '#0066cc' : done ? 'rgba(26,122,74,0.1)' : '#f5f5f7'",
   "background: step === n ? 'var(--accent)' : done ? 'var(--ok-bg)' : 'var(--bg)'"],
  ["color: step === n ? '#fff' : done ? '#1a7a4a' : '#aeaeb2'",
   "color: step === n ? '#fff' : done ? 'var(--ok)' : 'var(--ink-muted)'"],
  ["border: `1px solid ${step === n ? '#0066cc' : done ? 'rgba(26,122,74,0.3)' : '#d2d2d7'}`",
   "border: `1px solid ${step === n ? 'var(--accent)' : done ? 'var(--ok-border)' : 'var(--line)'}`"],
  ["color: step === n ? '#0066cc' : done ? '#1a7a4a' : '#aeaeb2'",
   "color: step === n ? 'var(--accent)' : done ? 'var(--ok)' : 'var(--ink-muted)'"],
  // auth type pill ternary
  ["border: `1px solid ${authType === a ? '#0066cc' : '#d2d2d7'}`",
   "border: `1px solid ${authType === a ? 'var(--accent)' : 'var(--line)'}`"],
  // connector PATCH purple (keep for now but add comment) — no CSS var
  ["color: '#7c2d92'", "color: '#7c2d92'"],  // intentionally no purple CSS var
  // observability panel dark red/green bg patterns
  ["background: '#14532d'", "background: 'var(--ok-bg)'"],
  ["color: '#86efac'", "color: 'var(--ok)'"],
  ["background: '#450a0a'", "background: 'var(--danger-bg)'"],
  ["background: '#431407'", "background: 'var(--danger-bg)'"],
  ["background: '#422006'", "background: 'var(--warn-bg)'"],
  ["color: '#fdba74'", "color: 'var(--warn)'"],
  ["color: '#16a34a'", "color: 'var(--ok)'"],
  ["color: '#d97706'", "color: 'var(--warn)'"],
  // knowledge-graph-explorer remaining
  ["color: '#007ba7'", "color: 'var(--info)'"],
  ["color: '#0891b2'", "color: 'var(--info)'"],
  ["color: '#7c3aed'", "color: 'var(--accent)'"],
  ["background: '#7c3aed'", "background: 'color-mix(in srgb, var(--accent) 15%, transparent)'"],
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["color: '#2563eb'", "color: 'var(--info)'"],
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  // runtime-observability status dot colors (bar chart data — these should stay as chart colors)
  // but text colors should use vars
  ["color: '#374151'", "color: 'var(--ink-soft)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  // Remaining dark bg panels
  ["background: '#1e293b'", "background: 'var(--bg-deep)'"],
  ["color: '#94a3b8'", "color: 'var(--ink-muted)'"],
  // talent-pipeline remaining
  ["background: '#f0f9ff'", "background: 'var(--info-bg)'"],
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  ["color: '#0369a1'", "color: 'var(--info)'"],
  // approvals mobile remaining
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  ["border: '1px solid #fecaca'", "border: '1px solid var(--danger-border)'"],
  ["background: '#dcfce7'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid #86efac'", "border: '1px solid var(--ok-border)'"],
  // health-status-panel remaining
  ["background: '#374151'", "background: 'var(--bg-deep)'"],
  ["color: '#22c55e'", "color: 'var(--ok)'"],
  ["color: '#f97316'", "color: 'var(--warn)'"],
  ["background: '#22c55e'", "background: 'var(--ok)'"],
  ["background: '#f97316'", "background: 'var(--warn)'"],
  ["background: '#dc2626'", "background: 'var(--danger)'"],
  ["background: '#f59e0b'", "background: 'var(--warn)'"],
  ["background: '#6366f1'", "background: 'var(--accent)'"],
  ["background: '#3b82f6'", "background: 'var(--info)'"],
  // internal-sidebar remaining
  ["color: '#d2d2d7'", "color: 'var(--line-strong)'"],
  // connector marketplace
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  ["border: '1px solid #bfdbfe'", "border: '1px solid var(--info-border)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  ["color: '#3b82f6'", "color: 'var(--info)'"],
  // meeting-sessions remaining
  ["background: '#f0fdf4'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid #bbf7d0'", "border: '1px solid var(--ok-border)'"],
  ["background: '#fffbeb'", "background: 'var(--warn-bg)'"],
  ["border: '1px solid #fde68a'", "border: '1px solid var(--warn-border)'"],
  // api-docs remaining
  ["color: '#6366f1'", "color: 'var(--accent)'"],
  ["background: '#6366f1'", "background: 'var(--accent)'"],
  // support-queue remaining
  ["background: '#fff5f5'", "background: 'var(--danger-bg)'"],
  ["background: '#f0fff4'", "background: 'var(--ok-bg)'"],
  ["background: '#fffaf0'", "background: 'var(--warn-bg)'"],
  // Wake-runs / routine-scheduler remaining
  ["color: '#0369a1'", "color: 'var(--info)'"],
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  // agent-chat panel remaining
  ["background: '#f5f5f7'", "background: 'var(--bg)'"],
  // Portal support history remaining
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["border: '1px solid #fde68a'", "border: '1px solid var(--warn-border)'"],
  ["background: '#ecfdf5'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid #6ee7b7'", "border: '1px solid var(--ok-border)'"],
  // subscription status card
  ["background: '#fff'", "background: 'var(--card)'"],
  // content-drafts remaining
  ["background: '#fef9c3'", "background: 'var(--warn-bg)'"],
  // operator-guide remaining
  ["background: '#e0f2fe'", "background: 'var(--info-bg)'"],
  ["border: '1px solid #7dd3fc'", "border: '1px solid var(--info-border)'"],
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  // notifications remaining
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
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
