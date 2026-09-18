const path = require('path');
const fs = require('fs');

for (const name of ['.env.local', '.env']) {
  const p = path.join(__dirname, name);
  if (!fs.existsSync(p)) continue;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('='), k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const db = require('./db');
(async () => {
  try {
    await db.bootstrapFromJson(path.join(__dirname, 'data'));
    console.log('Viet Nom Nom local/database seed completed successfully.');
    await db.pool.end();
  } catch (e) {
    console.error('Migration failed:', e);
    process.exitCode = 1;
    try { await db.pool.end(); } catch {}
  }
})();
