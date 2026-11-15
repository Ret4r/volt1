import { getSession, handleError, setNoStore } from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Метод не підтримується' });
  }

  try {
    const user = await getSession(req);
    if (!user) return res.status(401).json({ error: 'Увійдіть у свій акаунт' });
    return res.status(200).json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
  } catch (error) {
    return handleError(res, error, 'Session lookup failed');
  }
}
