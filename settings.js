import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM site_settings`;
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return res.status(200).json(settings);
  }

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Невірний пароль' });
  }

  if (req.method === 'POST') {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await sql`
        INSERT INTO site_settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }
    return res.status(200).json({ saved: true });
  }
}