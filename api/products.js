import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // Додаємо заголовки CORS та підтримку OPTIONS запитів від браузера
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-admin-password'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method, headers, query } = req;
  const adminPass = headers['x-admin-password'];
  const isAdmin = adminPass === process.env.ADMIN_PASSWORD;

  try {
    // GET — отримання списку товарів (доступно всім)
    if (method === 'GET') {
      const rows = await sql`SELECT * FROM products ORDER BY id DESC`;
      return res.status(200).json(rows);
    }

    // Перевірка пароля адміністратора для зміни даних
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
      if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized: Невірний або відсутній пароль адміністратора' });
      }
    }

    // POST — додавання нового товару
    if (method === 'POST') {
      const { title, category, capacity, price, specs, image_url } = req.body;
      
      let imagesArray = [];
      if (Array.isArray(image_url)) {
        imagesArray = image_url;
      } else if (typeof image_url === 'string' && image_url.trim()) {
        imagesArray = image_url.split(',').map(s => s.trim()).filter(Boolean);
      }

      const [newProd] = await sql`
        INSERT INTO products (title, category, capacity, price, specs, image_url)
        VALUES (
          ${title}, 
          ${category}, 
          ${capacity || 0}, 
          ${price || 0}, 
          ${JSON.stringify(specs || {})}, 
          ${JSON.stringify(imagesArray)}
        )
        RETURNING *
      `;
      return res.status(201).json(newProd);
    }

    // PUT — редагування існуючого товару (ВИПРАВЛЕНО з POST на PUT і додано id)
    if (method === 'PUT') {
      const { id, title, category, capacity, price, specs, image_url } = req.body;
      
      let imagesArray = [];
      if (Array.isArray(image_url)) {
        imagesArray = image_url;
      } else if (typeof image_url === 'string' && image_url.trim()) {
        imagesArray = image_url.split(',').map(s => s.trim()).filter(Boolean);
      }

      const [updated] = await sql`
        UPDATE products 
        SET title = ${title}, 
            category = ${category}, 
            capacity = ${capacity || 0}, 
            price = ${price || 0}, 
            specs = ${JSON.stringify(specs || {})}, 
            image_url = ${JSON.stringify(imagesArray)}
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

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err) {
    console.error('API Products Error:', err);
    return res.status(500).json({ error: err.message });
  }
}