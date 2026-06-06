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
  // runtime-observability STATE_COLORS record values
  ["created: '#6366f1'", "created: 'var(--accent)'"],
  ["starting: '#f59e0b'", "starting: 'var(--warn)'"],
  ["ready: '#3b82f6'", "ready: 'var(--info)'"],
  ["active: '#22c55e'", "active: 'var(--ok)'"],
  ["stopping: '#f97316'", "stopping: 'var(--warn)'"],
  ["stopped: '#6b7280'", "stopped: 'var(--ink-muted)'"],
  ["degraded: '#ef4444'", "degraded: 'var(--danger)'"],
  // isCurrent state pill ternary
  ["isCurrent ? '#fff' : '#374151'", "isCurrent ? '#fff' : 'var(--ink-soft)'"],
  ["isCurrent ? (STATE_COLORS[state] ?? '#6b7280') : '#e5e7eb'",
   "isCurrent ? (STATE_COLORS[state] ?? 'var(--ink-muted)') : 'var(--line)'"],
  // kill switch ternary
  ["killEngaged ? '#166534' : '#dc2626'", "killEngaged ? 'var(--ok)' : 'var(--danger)'"],
  // heartbeat/health ternaries
  ["health.heartbeat_loop_running ? '#16a34a' : '#dc2626'", "health.heartbeat_loop_running ? 'var(--ok)' : 'var(--danger)'"],
  ["> 0 ? '#dc2626' : '#374151'", "> 0 ? 'var(--danger)' : 'var(--ink-soft)'"],
  ["> 0 ? '#f59e0b' : '#374151'", "> 0 ? 'var(--warn)' : 'var(--ink-soft)'"],
  // STATE_COLORS fallback
  ["STATE_COLORS[t.to] ?? '#374151'", "STATE_COLORS[t.to] ?? 'var(--ink-soft)'"],
  ["STATE_COLORS[log.runtimeState] ?? '#94a3b8'", "STATE_COLORS[log.runtimeState] ?? 'var(--ink-muted)'"],
  ["STATE_COLORS[state] ?? '#6b7280'", "STATE_COLORS[state] ?? 'var(--ink-muted)'"],
  // EVENT_TYPE_BADGE log colors
  ["=== 'high' ? '#f87171'", "=== 'high' ? 'var(--danger)'"],
  ["=== 'low' ? '#86efac'", "=== 'low' ? 'var(--ok)'"],
  ["=== 'medium' ? '#fcd34d'", "=== 'medium' ? 'var(--warn)'"],
  [": '#94a3b8',", ": 'var(--ink-muted)',"],  // only trailing comma version (end of ternary)
  // remaining #374151 (ink-soft) / #6b7280 (ink-muted)
  ["color: '#374151'", "color: 'var(--ink-soft)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  // agent-observability CIRCUIT_COLORS remaining
  ["closed: { bg: '#14532d', text: '#86efac', label: 'CLOSED' }",
   "closed: { bg: 'var(--ok-bg)', text: 'var(--ok)', label: 'CLOSED' }"],
  ["open: { bg: '#450a0a', text: '#fca5a5', label: 'OPEN' }",
   "open: { bg: 'var(--danger-bg)', text: 'var(--danger)', label: 'OPEN' }"],
  ["'half-open': { bg: '#431407', text: '#fdba74', label: 'HALF-OPEN' }",
   "'half-open': { bg: 'color-mix(in srgb, var(--warn) 12%, transparent)', text: 'var(--warn)', label: 'HALF-OPEN' }"],
  // agent-observability STATUS_COLORS (provisioning states)
  ["active: { bg: '#14532d', text: '#86efac' }",
   "active: { bg: 'var(--ok-bg)', text: 'var(--ok)' }"],
  ["paused: { bg: '#422006', text: '#fde68a' }",
   "paused: { bg: 'color-mix(in srgb, var(--warn) 12%, transparent)', text: 'var(--warn)' }"],
  ["failed: { bg: '#450a0a', text: '#fca5a5' }",
   "failed: { bg: 'var(--danger-bg)', text: 'var(--danger)' }"],
  ["created: { bg: '#172554', text: '#bfdbfe' }",
   "created: { bg: 'var(--info-bg)', text: 'var(--info)' }"],
  ["bootstrapping: { bg: '#1c1917', text: '#e7e5e4' }",
   "bootstrapping: { bg: 'var(--bg-deep)', text: 'var(--ink-muted)' }"],
  // fallback default state color
  ["{ bg: '#1e293b', text: '#94a3b8' }", "{ bg: 'var(--bg-deep)', text: 'var(--ink-muted)' }"],
  // barColor ternary for rate-limit bar
  ["const barColor = pct >= 50 ? '#16a34a' : pct >= 20 ? '#d97706' : '#dc2626'",
   "const barColor = pct >= 50 ? 'var(--ok)' : pct >= 20 ? 'var(--warn)' : 'var(--danger)'"],
  // scoreColor ternary
  ["score === null ? '#475569' : score >= 0.7 ? '#16a34a' : score >= 0.4 ? '#d97706' : '#dc2626'",
   "score === null ? 'var(--ink-muted)' : score >= 0.7 ? 'var(--ok)' : score >= 0.4 ? 'var(--warn)' : 'var(--danger)'"],
  // dark-terminal backgrounds in observability panel
  ["background: '#060d1a'", "background: 'var(--bg-deep)'"],
  ["background: '#1c2b3a'", "background: 'var(--bg-deep)'"],
  ["color: '#7dd3fc'", "color: 'var(--info)'"],
  // knowledge-graph-explorer remaining
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["background: '#0066cc'", "background: 'var(--accent)'"],
  ["background: '#fff'", "background: 'var(--card)'"],
  // health-status-panel remaining status backgrounds (dcfce7 = tailwind green-100, fee2e2 = red-100)
  ["background: '#dcfce7'", "background: 'var(--ok-bg)'"],
  ["background: '#fee2e2'", "background: 'var(--danger-bg)'"],
  ["background: '#fef9c3'", "background: 'var(--warn-bg)'"],
  ["background: '#dbeafe'", "background: 'var(--info-bg)'"],
  ["color: '#1e40af'", "color: 'var(--info)'"],
  ["color: '#f1f5f9'", "color: 'var(--ink)'"],
  // remaining #e5e7eb in ternaries
  ["'#e5e7eb'", "'var(--line)'"],
  // Catch-all remaining
  ["color: '#1c1917'", "color: 'var(--ink-muted)'"],
  ["color: '#431407'", "color: 'var(--danger)'"],
  ["color: '#422006'", "color: 'var(--warn)'"],
  ["color: '#450a0a'", "color: 'var(--danger)'"],
  ["color: '#14532d'", "color: 'var(--ok)'"],
  // remaining chart/status badge colors for common patterns
  ["'#dc2626'", "'var(--danger)'"],
  ["'#ef4444'", "'var(--danger)'"],
  ["'#f87171'", "'var(--danger)'"],
  ["'#fca5a5'", "'var(--danger)'"],
  ["'#16a34a'", "'var(--ok)'"],
  ["'#22c55e'", "'var(--ok)'"],
  ["'#86efac'", "'var(--ok)'"],
  ["'#f59e0b'", "'var(--warn)'"],
  ["'#d97706'", "'var(--warn)'"],
  ["'#f97316'", "'var(--warn)'"],
  ["'#fde68a'", "'var(--warn)'"],
  ["'#fcd34d'", "'var(--warn)'"],
  ["'#94a3b8'", "'var(--ink-muted)'"],
  ["'#6b7280'", "'var(--ink-muted)'"],
  ["'#374151'", "'var(--ink-soft)'"],
  ["'#1f2937'", "'var(--ink-soft)'"],
  // info colors catch-all
  ["'#3b82f6'", "'var(--info)'"],
  ["'#93c5fd'", "'var(--info)'"],
  ["'#bfdbfe'", "'var(--info-bg)'"],
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
