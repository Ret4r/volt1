import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const { customer_name, phone, delivery_info, items, total_price } = req.body;
    const [order] = await sql`
      INSERT INTO orders (customer_name, phone, delivery_info, items, total_price)
      VALUES (${customer_name}, ${phone}, ${delivery_info}, ${JSON.stringify(items)}, ${total_price})
      RETURNING *
    `;
    return res.status(201).json(order);
  }

  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Невірний пароль' });
  }

  if (req.method === 'GET') {
    const orders = await sql`SELECT * FROM orders ORDER BY id DESC`;
    return res.status(200).json(orders);
  }

  if (req.method === 'PUT') {
    const { id, status } = req.body;
    await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
    return res.status(200).json({ updated: true });
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM orders WHERE id = ${req.query.id}`;
    return res.status(200).json({ deleted: true });
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
