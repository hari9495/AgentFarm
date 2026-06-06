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

// text: property form (like { bg: 'var(--warn-bg)', text: '#92400e' })
const REPLACEMENTS = [
  // status text colors in badge data objects
  ["text: '#92400e'", "text: 'var(--warn)'"],
  ["text: '#b45309'", "text: 'var(--warn)'"],
  ["text: '#d97706'", "text: 'var(--warn)'"],
  ["text: '#1d4ed8'", "text: 'var(--info)'"],
  ["text: '#1e40af'", "text: 'var(--info)'"],
  ["text: '#2563eb'", "text: 'var(--info)'"],
  ["text: '#3b82f6'", "text: 'var(--info)'"],
  ["text: '#0369a1'", "text: 'var(--info)'"],
  ["text: '#15803d'", "text: 'var(--ok)'"],
  ["text: '#1a7a4a'", "text: 'var(--ok)'"],
  ["text: '#16a34a'", "text: 'var(--ok)'"],
  ["text: '#b91c1c'", "text: 'var(--danger)'"],
  ["text: '#c4161c'", "text: 'var(--danger)'"],
  ["text: '#991b1b'", "text: 'var(--danger)'"],
  ["text: '#dc2626'", "text: 'var(--danger)'"],
  ["text: '#ef4444'", "text: 'var(--danger)'"],
  ["text: '#0066cc'", "text: 'var(--accent)'"],
  ["text: '#059669'", "text: 'var(--ok)'"],
  ["text: '#6b7280'", "text: 'var(--ink-muted)'"],
  ["text: '#4b5563'", "text: 'var(--ink-muted)'"],
  ["text: '#374151'", "text: 'var(--ink-soft)'"],
  ["text: '#1d1d1f'", "text: 'var(--ink)'"],
  ["text: '#1e293b'", "text: 'var(--ink)'"],
  ["text: '#94a3b8'", "text: 'var(--ink-muted)'"],
  ["text: '#9ca3af'", "text: 'var(--ink-muted)'"],
  // portal support history chat bubbles
  ["msg.role === 'user' ? '#334155' : msg.role === 'agent' ? '#e2e8f0' : '#f8fafc'",
   "msg.role === 'user' ? 'var(--bg-deep)' : msg.role === 'agent' ? 'var(--bg)' : 'var(--bg)'"],
  ["color: msg.role === 'user' ? '#f8fafc' : '#1e293b'",
   "color: msg.role === 'user' ? 'var(--card)' : 'var(--ink)'"],
  // filter pill ternaries
  ["filter === s ? '#1e293b' : 'var(--card)'", "filter === s ? 'var(--bg-deep)' : 'var(--card)'"],
  ["color: filter === s ? 'var(--card)' : '#475569'", "color: filter === s ? 'var(--card)' : 'var(--ink-muted)'"],
  // "new issue" blue button
  ["background: '#2563eb', color: 'var(--card)'", "background: 'var(--info)', color: 'var(--card)'"],
  // signup page remaining (specific forms)
  ["'#0066cc'", "'var(--accent)'"],
  ["'#d2d2d7'", "'var(--line)'"],
  ["'#1d1d1f'", "'var(--ink)'"],
  ["'#8e8e93'", "'var(--ink-muted)'"],
  // various remaining across all files (broad catch-all for missed patterns)
  ["'#92400e'", "'var(--warn)'"],
  ["'#1d4ed8'", "'var(--info)'"],
  ["'#15803d'", "'var(--ok)'"],
  ["'#b91c1c'", "'var(--danger)'"],
  ["'#2563eb'", "'var(--info)'"],
  ["'#1e293b'", "'var(--bg-deep)'"],
  ["'#475569'", "'var(--ink-muted)'"],
  ["'#334155'", "'var(--bg-deep)'"],
  ["'#e2e8f0'", "'var(--bg)'"],
  ["'#f8fafc'", "'var(--bg)'"],
  ["'#4b5563'", "'var(--ink-muted)'"],
  ["'#374151'", "'var(--ink-soft)'"],
  ["'#9ca3af'", "'var(--ink-muted)'"],
  ["'#6b7280'", "'var(--ink-muted)'"],
  ["'#1f2937'", "'var(--ink-soft)'"],
  ["'#d1d5db'", "'var(--line)'"],
  ["'#e5e7eb'", "'var(--line)'"],
  ["'#f9fafb'", "'var(--bg)'"],
  ["'#f3f4f6'", "'var(--bg)'"],
  ["'#e7e5e4'", "'var(--bg)'"],
  ["'#166534'", "'var(--ok)'"],
  ["'#14532d'", "'var(--ok)'"],
  ["'#059669'", "'var(--ok)'"],
  ["'#16a34a'", "'var(--ok)'"],
  ["'#065f46'", "'var(--ok)'"],
  ["'#991b1b'", "'var(--danger)'"],
  ["'#7f1d1d'", "'var(--danger)'"],
  ["'#450a0a'", "'var(--danger)'"],
  ["'#431407'", "'var(--danger)'"],
  ["'#ca8a04'", "'var(--warn)'"],
  ["'#92400e'", "'var(--warn)'"],
  ["'#422006'", "'var(--warn)'"],
  ["'#0d9488'", "'var(--info)'"],
  ["'#0891b2'", "'var(--info)'"],
  ["'#0284c7'", "'var(--info)'"],
  ["'#0369a1'", "'var(--info)'"],
  ["'#0c4a6e'", "'var(--info)'"],
  ["'#1e40af'", "'var(--info)'"],
  ["'#4f46e5'", "'var(--accent)'"],
  ["'#6366f1'", "'var(--accent)'"],
  ["'#7c3aed'", "'var(--accent)'"],
  ["'#0066cc'", "'var(--accent)'"],
  ["'#0052cc'", "'var(--accent)'"],
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
