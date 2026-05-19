import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('d:/AgentFarm/apps/website/.auth.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
console.log('Users:', userCount?.c ?? 0);
if (userCount?.c > 0) {
    const users = db.prepare("SELECT id, email, name, role FROM users").all();
    console.log('Existing users:', JSON.stringify(users, null, 2));
}
db.close();
