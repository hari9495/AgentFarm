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

// INTENTIONALLY KEPT (not in this list):
// '#7c2d92', '#8b5cf6' — purple brand/chart colors
// '#0ea5e9', '#10b981' — chart colors (sky/emerald)
// '#db2777' — pink brand
// '#4a154b', '#e8d5ff' — Slack brand
// '#ff5f57', '#febc2e', '#28c840' — macOS traffic lights
// '#34c759', '#c7c7cc', '#0071e3', '#5599d8' — iOS/Apple colors

const REPLACEMENTS = [
  // amber-900 warn
  ["'#78350f'", "'var(--warn)'"],
  // sky-300/400 info
  ["'#38bdf8'", "'var(--info)'"],
  // very dark red bg (dark theme danger bg)
  ["'#1a0505'", "'var(--danger-bg)'"],
  // dark slate bg
  ["'#263244'", "'var(--bg-deep)'"],
  // dark red bg
  ["'#4c1313'", "'var(--danger-bg)'"],
  // dark green bgs
  ["'#0d2b1f'", "'var(--ok-bg)'"],
  ["'#113526'", "'var(--ok-bg)'"],
  ["'#052e16'", "'var(--ok-bg)'"],
  // green-400 ok
  ["'#4ade80'", "'var(--ok)'"],
  // indigo-50 info bg
  ["'#eef2ff'", "'var(--info-bg)'"],
  // amber-950 warn
  ["'#451a03'", "'var(--warn)'"],
  // near-black terminal bg
  ["'#0a0a0a'", "'var(--bg-deep)'"],
  // zinc-100 bg
  ["'#f4f4f5'", "'var(--bg)'"],
  // green-200 ok border
  ["'#a7f3d0'", "'var(--ok-border)'"],
  // slate-200 line/border
  ["'#cbd5e1'", "'var(--line)'"],
  // purple-50 accent tint bg
  ["'#faf5ff'", "'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  // near-black shorthand
  ["'#111'", "'var(--ink)'"],
  // rose-700 danger
  ["'#be123c'", "'var(--danger)'"],
  // light bg
  ["'#f0f0f5'", "'var(--bg)'"],
  // warm yellow warn (playground lang color)
  ["'#ffd580'", "'var(--warn)'"],
  // blue-300 info (playground lang color)
  ["'#82b4ff'", "'var(--info)'"],
  // purple-800 accent (retention policy anonymize badge)
  ["'#6b21a8'", "'var(--accent)'"],
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
