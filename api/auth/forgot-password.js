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
  validEmail
} from '../../lib/auth.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!requirePost(req, res)) return;

  try {
    const email = normalizeEmail(getBody(req)?.email);
    if (!validEmail(email)) return res.status(400).json({ error: 'Вкажіть коректну email-адресу' });

    const sql = getSql();
    const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (!user) return res.status(200).json({ message: 'Якщо акаунт існує, код надіслано на email' });

    const [pending] = await sql`
      SELECT last_sent_at
      FROM email_verifications
      WHERE email = ${email}
    `;
    if (pending && Date.now() - new Date(pending.last_sent_at).getTime() < 60_000) {
      return res.status(429).json({ error: 'Зачекайте хвилину перед повторним надсиланням коду' });
    }

    const code = createOtp();
    await sql`
      INSERT INTO email_verifications (email, purpose, password_hash, full_name, code_hash, expires_at, attempts, last_sent_at)
      VALUES (${email}, 'reset', NULL, NULL, ${hashOtp(code)}, NOW() + INTERVAL '10 minutes', 0, NOW())
      ON CONFLICT (email) DO UPDATE SET
        purpose = 'reset',
        password_hash = NULL,
        full_name = NULL,
        code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        attempts = 0,
        last_sent_at = NOW()
    `;
    try {
      await sendOtp(email, code, 'reset');
    } catch (error) {
      console.error('Password reset OTP email failed', error);
      await sql`DELETE FROM email_verifications WHERE email = ${email} AND purpose = 'reset'`;
      return res.status(502).json({ error: 'Не вдалося надіслати лист. Перевірте налаштування пошти та спробуйте ще раз' });
    }

    return res.status(200).json({ message: 'Якщо акаунт існує, код надіслано на email' });
  } catch (error) {
    return handleError(res, error, 'Password reset request failed');
  }
}
