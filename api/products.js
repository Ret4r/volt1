import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  const { method, headers, query } = req;
  const adminPass = headers['x-admin-password'];
  const isAdmin = adminPass === process.env.ADMIN_PASSWORD;

  try {
    // GET — доступний усім (отримання списку товарів)
    if (method === 'GET') {
      const rows = await sql`SELECT * FROM products ORDER BY id DESC`;
      return res.status(200).json(rows);
    }

    // Для всіх запитів на зміну (POST, PUT, DELETE) потрібен пароль адміністратора
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized: Невірний або відсутній пароль адміністратора' });
      }
    }

    // POST — додавання нового товару
    if (method === 'POST') {
      const { title, category, capacity, price, specs, image_url } = req.body;
      const [newProd] = await sql`
        INSERT INTO products (title, category, capacity, price, specs, image_url)
        VALUES (
          ${title}, 
          ${category}, 
          ${capacity || 0}, 
          ${price || 0}, 
          ${JSON.stringify(specs || {})}, 
          ${JSON.stringify(image_url || [])}
        )
        RETURNING *
      `;
      return res.status(201).json(newProd);
    }

    // PUT — редагування існуючого товару
    if (method === 'PUT') {
      const { id, title, category, capacity, price, specs, image_url } = req.body;
      const [updated] = await sql`
        UPDATE products 
        SET title = ${title}, 
            category = ${category}, 
            capacity = ${capacity || 0}, 
            price = ${price || 0}, 
            specs = ${JSON.stringify(specs || {})}, 
            image_url = ${JSON.stringify(image_url || [])}
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json(updated);
    }

    // DELETE — видалення товару за ID
    if (method === 'DELETE') {
      const { id } = query;
      await sql`DELETE FROM products WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error('API Products Error:', err);
    return res.status(500).json({ error: err.message });
  }
}