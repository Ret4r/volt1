import { hash } from 'bcryptjs';
import { getBody, getSql, handleError, normalizeEmail, requirePost, setNoStore, validEmail, validPassword, verifyOtp } from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!requirePost(req, res)) return;

  try {
    const body = getBody(req);
    const email = normalizeEmail(body?.email);
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const password = body?.password;
    if (!validEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Вкажіть email і 6-значний код' });
    }
    if (!validPassword(password)) {
      return res.status(400).json({ error: 'Пароль: від 8 до 128 символів, з великою і малою літерами та цифрою' });
    }

    const sql = getSql();
    const [verification] = await sql`
      SELECT code_hash, expires_at, attempts
      FROM email_verifications
      WHERE email = ${email} AND purpose = 'reset'
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
        WHERE email = ${email} AND purpose = 'reset'
      `;
      return res.status(400).json({ error: 'Невірний код підтвердження' });
    }

    const passwordHash = await hash(password, 12);
    const [updated] = await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, auth_version = auth_version + 1
      WHERE email = ${email}
      RETURNING id
    `;
    await sql`DELETE FROM email_verifications WHERE email = ${email} AND purpose = 'reset'`;
    if (!updated) return res.status(400).json({ error: 'Акаунт не знайдено' });
    return res.status(200).json({ message: 'Пароль змінено. Тепер увійдіть у кабінет' });
  } catch (error) {
    return handleError(res, error, 'Password reset failed');
  }
}
