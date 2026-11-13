import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

function normalizeImageUrls(value) {
  let images = value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      images = Array.isArray(parsed) ? parsed : [value];
    } catch {
      images = [value];
    }
  }
  if (!Array.isArray(images) || images.length === 0 || images.length > 8) {
    return { error: 'Додайте від 1 до 8 посилань на фото' };
  }

  const urls = images.map(image => typeof image === 'string' ? image.trim() : '');
  const valid = urls.every(image => {
    if (!image || /^data:/i.test(image)) return false;
    if (/^https?:\/\//i.test(image)) {
      try {
        const url = new URL(image);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }
    return /^(?:\/(?!\/)|\.{1,2}\/)/.test(image);
  });
  return valid ? { images: [...new Set(urls)] } : { error: 'Фото мають бути HTTP(S)-посиланнями або локальними шляхами' };
}

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
      const normalized = normalizeImageUrls(image_url);
      if (normalized.error) return res.status(400).json({ error: normalized.error });

      const [newProd] = await sql`
        INSERT INTO products (title, category, capacity, price, specs, image_url)
        VALUES (
          ${title}, 
          ${category}, 
          ${capacity || 0}, 
          ${price || 0}, 
          ${JSON.stringify(specs || {})}, 
          ${JSON.stringify(normalized.images)}
        )
        RETURNING *
      `;
      return res.status(201).json(newProd);
    }

    // PUT — редагування існуючого товару (ВИПРАВЛЕНО з POST на PUT і додано id)
    if (method === 'PUT') {
      const { id, title, category, capacity, price, specs, image_url } = req.body;
      const normalized = normalizeImageUrls(image_url);
      if (normalized.error) return res.status(400).json({ error: normalized.error });

      const [updated] = await sql`
        UPDATE products 
        SET title = ${title}, 
            category = ${category}, 
            capacity = ${capacity || 0}, 
            price = ${price || 0}, 
            specs = ${JSON.stringify(specs || {})}, 
            image_url = ${JSON.stringify(normalized.images)}
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