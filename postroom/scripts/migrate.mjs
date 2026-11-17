// Applies db/*.sql in order. Usage: DATABASE_URL=... node scripts/migrate.mjs
import fs from 'node:fs';
import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL (Supabase → Connect → Session pooler or direct connection).');
const sql = postgres(url, { prepare: false, onnotice: () => {} });
for (const f of fs.readdirSync('db').filter((f) => f.endsWith('.sql')).sort()) {
  process.stdout.write(`applying ${f} … `);
  await sql.unsafe(fs.readFileSync(`db/${f}`, 'utf8'));
  console.log('ok');
}
await sql.end();
