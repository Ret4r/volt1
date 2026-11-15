import { hash } from 'bcryptjs';
import {
  createOtp,
  getBody,
  getSql,
  handleError,
  hashOtp,
  normalizeEmail,
  requirePost,
  sendOtp,
  setNoStore,
  validEmail,
  validPassword
} from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!requirePost(req, res)) return;

  try {
    const body = getBody(req);
    const email = normalizeEmail(body?.email);
    const password = body?.password;
    const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';

    if (!validEmail(email)) return res.status(400).json({ error: 'Вкажіть коректну email-адресу' });
    if (!validPassword(password)) {
      return res.status(400).json({ error: 'Пароль: від 8 до 128 символів, з великою і малою літерами та цифрою' });
    }
    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ error: 'Вкажіть ім’я (до 100 символів)' });
    }

    const sql = getSql();
    const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) return res.status(409).json({ error: 'Ця email-адреса вже зареєстрована' });

    const [pending] = await sql`
      SELECT last_sent_at
      FROM email_verifications
      WHERE email = ${email}
    `;
    if (pending && Date.now() - new Date(pending.last_sent_at).getTime() < 60_000) {
      return res.status(429).json({ error: 'Зачекайте хвилину перед повторним надсиланням коду' });
    }

    const passwordHash = await hash(password, 12);
    const code = createOtp();
    await sql`
      INSERT INTO email_verifications (email, purpose, password_hash, full_name, code_hash, expires_at, attempts, last_sent_at)
      VALUES (${email}, 'register', ${passwordHash}, ${fullName}, ${hashOtp(code)}, NOW() + INTERVAL '10 minutes', 0, NOW())
      ON CONFLICT (email) DO UPDATE SET
        purpose = EXCLUDED.purpose,
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        attempts = 0,
        last_sent_at = NOW()
    `;

    try {
      await sendOtp(email, code, 'register');
    } catch (error) {
      console.error('Registration OTP email failed', error);
      await sql`DELETE FROM email_verifications WHERE email = ${email} AND purpose = 'register'`;
      return res.status(502).json({ error: 'Не вдалося надіслати лист. Перевірте налаштування пошти та спробуйте ще раз' });
    }

    return res.status(200).json({ message: 'Код підтвердження надіслано на email' });
  } catch (error) {
    return handleError(res, error, 'Registration failed');
  }
}
