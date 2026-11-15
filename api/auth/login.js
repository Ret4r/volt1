import { compare } from 'bcryptjs';
import { getBody, getSql, handleError, normalizeEmail, requirePost, setNoStore, setSession, validEmail } from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!requirePost(req, res)) return;

  try {
    const body = getBody(req);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!validEmail(email) || !password) return res.status(400).json({ error: 'Вкажіть email і пароль' });

    const sql = getSql();
    const [user] = await sql`
      SELECT id, email, full_name, password_hash, auth_version
      FROM users
      WHERE email = ${email}
    `;
    if (!user || !(await compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Невірна email-адреса або пароль' });
    }

    await setSession(res, user);
    return res.status(200).json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
  } catch (error) {
    return handleError(res, error, 'Login failed');
  }
}
