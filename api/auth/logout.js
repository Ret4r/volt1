import { clearSession, setNoStore } from '../../lib/auth.js';

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Метод не підтримується' });
  }
  clearSession(res);
  return res.status(200).json({ message: 'Ви вийшли з акаунта' });
}
