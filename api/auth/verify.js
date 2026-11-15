import { getBody, getSql, handleError, normalizeEmail, requirePost, setNoStore, setSession, validEmail, verifyOtp } from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!requirePost(req, res)) return;

  try {
    const body = getBody(req);
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Вкажіть email і 6-значний код' });
    }

    const sql = getSql();
    const [verification] = await sql`
      SELECT password_hash, full_name, code_hash, expires_at, attempts
      FROM email_verifications
      WHERE email = ${email} AND purpose = 'register'
    `;
    if (!verification || new Date(verification.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Код відсутній або прострочений. Запросіть новий' });
    }
    if (verification.attempts >= 5) {
      return res.status(429).json({ error: 'Перевищено кількість спроб. Запросіть новий код' });
    }
    if (!verifyOtp(code, verification.code_hash)) {
      await sql`
        UPDATE email_verifications
        SET attempts = attempts + 1
        WHERE email = ${email} AND purpose = 'register'
      `;
      return res.status(400).json({ error: 'Невірний код підтвердження' });
    }

    const [user] = await sql`
      INSERT INTO users (email, password_hash, full_name)
      VALUES (${email}, ${verification.password_hash}, ${verification.full_name})
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, full_name, auth_version
    `;
    if (!user) return res.status(409).json({ error: 'Ця email-адреса вже зареєстрована' });

    await sql`DELETE FROM email_verifications WHERE email = ${email} AND purpose = 'register'`;
    await setSession(res, user);
    return res.status(201).json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
  } catch (error) {
    return handleError(res, error, 'Email verification failed');
  }
}
