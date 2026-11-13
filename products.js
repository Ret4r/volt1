import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM products ORDER BY id DESC`;
    return res.status(200).json(rows);
  }

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Невірний пароль' });
  }

  if (req.method === 'POST') {
    const { title, category, capacity, price, specs, image_url } = req.body;
    const [created] = await sql`
      INSERT INTO products (title, category, capacity, price, specs, image_url)
      VALUES (${title}, ${category}, ${capacity}, ${price}, ${specs}, ${image_url})
      RETURNING *
    `;
    return res.status(201).json(created);
  }

  if (req.method === 'PUT') {
    const { id, title, category, capacity, price, specs, image_url } = req.body;
    const [updated] = await sql`
      UPDATE products 
      SET title=${title}, category=${category}, capacity=${capacity}, price=${price}, specs=${specs}, image_url=${image_url}
      WHERE id=${id} RETURNING *
    `;
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM products WHERE id = ${req.query.id}`;
    return res.status(200).json({ deleted: true });
  }
}