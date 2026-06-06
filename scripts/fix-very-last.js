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

const REPLACEMENTS = [
  // subscription-banner Bootstrap-style dark colors
  ["'#856404'", "'var(--warn)'"],
  ["'#721c24'", "'var(--danger)'"],
  ["'#fff3cd'", "'var(--warn-bg)'"],
  ["'#f8d7da'", "'var(--danger-bg)'"],
  // operator-guide
  ["'#fecaca'", "'var(--danger-bg)'"],
  ["'#fafbff'", "'var(--bg)'"],
  ["'#4338ca'", "'var(--accent)'"],
  ["'#e0e7ff'", "'var(--info-bg)'"],
  // skill-invoke-panel dark theme
  ["'#2a0a0a'", "'var(--danger-bg)'"],
  ["'#1a1a2e'", "'var(--bg-deep)'"],
  ["'#0a0a14'", "'var(--bg-deep)'"],
  ["'#a5f3fc'", "'var(--info)'"],
  ["'#aaa'", "'var(--ink-muted)'"],
  // support-issue-feed orange/purple
  ["'#ffedd5'", "'var(--warn-bg)'"],
  ["'#9a3412'", "'var(--warn)'"],
  ["'#854d0e'", "'var(--warn)'"],
  ["'#ede9fe'", "'color-mix(in srgb, var(--accent) 10%, transparent)'"],
  ["'#6d28d9'", "'var(--accent)'"],
  // agent-health purple states
  ["'#9333ea'", "'var(--accent)'"],
  ["'#f3e8ff'", "'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["'#e9d5ff'", "'color-mix(in srgb, var(--accent) 12%, transparent)'"],
  // wake-runs purple/orange
  ["'#fdf4ff'", "'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["'#fff7ed'", "'var(--warn-bg)'"],
  ["'#c2410c'", "'var(--warn)'"],
  ["'#fefce8'", "'var(--warn-bg)'"],
  // provisioning stone/warm-gray
  ["'#f5f5f4'", "'var(--bg)'"],
  ["'#d6d3d1'", "'var(--line)'"],
  ["'#ece6dc'", "'var(--bg)'"],
  ["'#a8a29e'", "'var(--ink-muted)'"],
  // ci-triage remaining
  ["'#1e3a5f'", "'var(--info)'"],
  // content-drafts remaining
  ["'#047857'", "'var(--ok)'"],
  // governance-kpis remaining
  ["'#166534'", "'var(--ok)'"],
  // suspension-wall remaining
  ["'#420a0a'", "'var(--danger-bg)'"],
  // task-retry remaining
  ["'#7e22ce'", "'var(--accent)'"],
  // approvals-mobile remaining
  ["'#1e40af'", "'var(--info)'"],
  // page.tsx remaining
  ["'#eab308'", "'var(--warn)'"],
  ["'#facc15'", "'var(--warn)'"],
  // api-keys remaining
  ["'#f5f0ff'", "'color-mix(in srgb, var(--accent) 8%, transparent)'"],
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
