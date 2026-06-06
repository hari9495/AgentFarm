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

const files = walk('apps/dashboard/app');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const matches = src.match(/'#[0-9a-fA-F]{3,6}'/g) || [];
  if (matches.length > 0) {
    const unique = [...new Set(matches)];
    const shortPath = f.split('apps\\dashboard\\app\\').pop().split('apps/dashboard/app/').pop();
    console.log(shortPath + ': ' + unique.join(', '));
  }
}
