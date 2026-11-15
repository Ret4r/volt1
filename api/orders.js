import { getBody, getSession, getSql, handleError, setNoStore } from '../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);

  try {
    const sql = getSql();
    const body = getBody(req);
    const adminPassword = process.env.ADMIN_PASSWORD;
    const isAdmin = Boolean(adminPassword) && req.headers['x-admin-password'] === adminPassword;

    if (req.method === 'POST') {
      const { customer_name, phone, delivery_info, delivery_city, delivery_branch, comment, items, total_price } = body || {};
      if (comment != null && typeof comment !== 'string') {
        return res.status(400).json({ error: 'Коментар має бути текстом' });
      }
      const orderComment = typeof comment === 'string' ? comment.trim() : '';
      if (orderComment.length > 500) {
        return res.status(400).json({ error: 'Коментар має містити не більше 500 символів' });
      }
      const city = typeof delivery_city === 'string' ? delivery_city.trim() : '';
      const branch = typeof delivery_branch === 'string' ? delivery_branch.trim() : '';
      const orderInfo = [
        city ? `Місто: ${city}` : '',
        branch ? `Відділення: ${branch}` : '',
        !city && !branch && typeof delivery_info === 'string' ? delivery_info.trim() : '',
        orderComment ? `Коментар: ${orderComment}` : ''
      ].filter(Boolean).join('\n');
      const user = await getSession(req);
      const [order] = await sql`
        INSERT INTO orders (customer_name, phone, delivery_info, items, total_price, user_id)
        VALUES (${customer_name}, ${phone}, ${orderInfo}, ${JSON.stringify(items)}, ${total_price}, ${user?.id ?? null})
        RETURNING *
      `;
      return res.status(201).json(order);
    }

    if (req.method === 'GET') {
      if (isAdmin) {
        const orders = await sql`SELECT * FROM orders ORDER BY id DESC`;
        return res.status(200).json(orders);
      }
      const user = await getSession(req);
      if (!user) return res.status(401).json({ error: 'Увійдіть у свій акаунт' });
      const orders = await sql`
        SELECT id, status, total_price, items, created_at
        FROM orders
        WHERE user_id = ${user.id}
        ORDER BY id DESC
      `;
      return res.status(200).json(orders);
    }

    if (!isAdmin) return res.status(401).json({ error: 'Невірний пароль адміністратора' });

    if (req.method === 'PUT') {
      const { id, status } = body || {};
      if (!['new', 'processing', 'shipped', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Невідомий статус замовлення' });
      }
      await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
      return res.status(200).json({ updated: true });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM orders WHERE id = ${req.query.id}`;
      return res.status(200).json({ deleted: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Метод не підтримується' });
  } catch (error) {
    return handleError(res, error, 'Orders API failed');
  }
}
