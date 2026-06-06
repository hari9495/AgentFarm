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

// bg: property form (used in status badge objects like { bg: '#dcfce7', color: 'var(--ok)' })
const REPLACEMENTS = [
  // bg: property form — status colors
  ["bg: '#dcfce7'", "bg: 'var(--ok-bg)'"],
  ["bg: '#fee2e2'", "bg: 'var(--danger-bg)'"],
  ["bg: '#fef9c3'", "bg: 'var(--warn-bg)'"],
  ["bg: '#fef3c7'", "bg: 'var(--warn-bg)'"],
  ["bg: '#fffbeb'", "bg: 'var(--warn-bg)'"],
  ["bg: '#dbeafe'", "bg: 'var(--info-bg)'"],
  ["bg: '#eff6ff'", "bg: 'var(--info-bg)'"],
  ["bg: '#e0f2fe'", "bg: 'var(--info-bg)'"],
  ["bg: '#f0fdf4'", "bg: 'var(--ok-bg)'"],
  ["bg: '#ecfdf5'", "bg: 'var(--ok-bg)'"],
  ["bg: '#f5f5f5'", "bg: 'var(--bg)'"],
  ["bg: '#fafafa'", "bg: 'var(--bg)'"],
  ["bg: '#f1f5f9'", "bg: 'var(--bg)'"],
  ["bg: '#f8fafc'", "bg: 'var(--bg)'"],
  ["bg: '#f9fafb'", "bg: 'var(--bg)'"],
  ["bg: '#fef2f2'", "bg: 'var(--danger-bg)'"],
  ["bg: '#fff5f5'", "bg: 'var(--danger-bg)'"],
  // routine-scheduler purple/teal inline colors
  ["background: '#ede9fe'", "background: 'color-mix(in srgb, var(--accent) 12%, transparent)'"],
  ["color: '#6d28d9'", "color: 'var(--accent)'"],
  ["background: '#0f766e'", "background: 'var(--ok)'"],
  ["color: '#6366f1'", "color: 'var(--accent)'"],
  ["border: '1px solid #6366f1'", "border: '1px solid var(--accent)'"],
  ["background: creating ? '#d1d5db' : '#6366f1'", "background: creating ? 'var(--line)' : 'var(--accent)'"],
  ["background: isTriggeringThis || !task.enabled ? '#d1d5db' : '#0f766e'",
   "background: isTriggeringThis || !task.enabled ? 'var(--line)' : 'var(--ok)'"],
  ["background: task.enabled ? '#fff' : '#fafafa'", "background: task.enabled ? 'var(--card)' : 'var(--bg)'"],
  ["background: '#fafafa'", "background: 'var(--bg)'"],
  ["background: '#f5f5f5'", "background: 'var(--bg)'"],
  // routine-scheduler neutral gray
  ["bg: '#f5f5f5', color: '#737373'", "bg: 'var(--bg)', color: 'var(--ink-muted)'"],
  ["color: '#737373'", "color: 'var(--ink-muted)'"],
  ["color: '#d1d5db'", "color: 'var(--line)'"],
  ["background: '#d1d5db'", "background: 'var(--line)'"],
  ["border: '1px solid #d1d5db'", "border: '1px solid var(--line)'"],
  // knowledge-graph tab pill ternary
  ["activeTab === tab ? '#fff' : 'transparent'", "activeTab === tab ? 'var(--card)' : 'transparent'"],
  ["activeTab === tab ? '#1d1d1f' : '#6e6e73'", "activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)'"],
  // knowledge-graph KIND_TEXT record (node text colors)
  ["function: '#0066cc', class: '#7c2d92', interface: '#007ba7'",
   "function: 'var(--accent)', class: '#7c2d92', interface: 'var(--info)'"],
  ["type: '#1a7a4a', variable: '#6e6e73', unknown: '#aeaeb2'",
   "type: 'var(--ok)', variable: 'var(--ink-muted)', unknown: 'var(--ink-muted)'"],
  // knowledge-graph KIND_DOT record (SVG dot colors)
  ["function: '#2563eb', class: '#7c3aed', interface: '#0891b2'",
   "function: 'var(--info)', class: '#7c3aed', interface: 'var(--info)'"],
  ["type: '#059669', variable: 'var(--ink-muted)', unknown: '#9ca3af'",
   "type: 'var(--ok)', variable: 'var(--ink-muted)', unknown: 'var(--ink-muted)'"],
  // knowledge-graph kindFill function
  ["function: '#2563eb', class: '#7c3aed', interface: '#0891b2', variable: 'var(--ink-muted)'",
   "function: 'var(--info)', class: '#7c3aed', interface: 'var(--info)', variable: 'var(--ink-muted)'"],
  // knowledge-graph SVG stroke
  ["stroke={isSelected ? '#1d1d1f' : 'rgba(255,255,255,0.4)'}",
   "stroke={isSelected ? 'var(--ink)' : 'rgba(255,255,255,0.4)'}"],
  // talent-pipeline / agent-chat remaining
  ["background: '#f0f9ff'", "background: 'var(--info-bg)'"],
  // support-queue / issue-feed remaining
  ["background: '#fff0f0'", "background: 'var(--danger-bg)'"],
  ["background: '#fff8f0'", "background: 'var(--warn-bg)'"],
  // meetings/sessions remaining
  ["background: '#f0fdf4'", "background: 'var(--ok-bg)'"],
  // mobile-approvals remaining
  ["background: '#eff6ff'", "background: 'var(--info-bg)'"],
  // content-drafts / comms / business remaining
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  ["border: '1px solid #fecaca'", "border: '1px solid var(--danger-border)'"],
  // api-docs panel remaining
  ["color: '#059669'", "color: 'var(--ok)'"],
  // api-keys remaining
  ["color: '#9ca3af'", "color: 'var(--ink-muted)'"],
  // connector-marketplace remaining
  ["border: '1px solid #e0e7ff'", "border: '1px solid var(--info-border)'"],
  // wake-runs / routine remaining
  ["background: '#f0f0f0'", "background: 'var(--bg)'"],
  // portal-support-history remaining
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  ["border: '1px solid #fcd34d'", "border: '1px solid var(--warn-border)'"],
  // subscription-status-card
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
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
