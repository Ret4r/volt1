import { neon } from '@neondatabase/serverless';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export function getSql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  return new TextEncoder().encode(secret);
}

function cookieValue(req, name) {
  const cookies = req.headers.cookie || '';
  const entry = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

export async function getSession(req) {
  const token = cookieValue(req, 'volt_session');
  if (!token) return null;

  const key = sessionKey();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key, { algorithms: ['HS256'] }));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;

  const sql = getSql();
  const [user] = await sql`
    SELECT id, email, full_name, auth_version
    FROM users
    WHERE id = ${payload.sub}
  `;
  if (!user || user.auth_version !== payload.ver) return null;
  return user;
}

export async function setSession(res, user) {
  const token = await new SignJWT({ ver: user.auth_version })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(sessionKey());

  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `volt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`
  );
}

export function clearSession(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `volt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
  );
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export function hashOtp(code) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  return createHmac('sha256', secret).update(code).digest('hex');
}

export function verifyOtp(code, hash) {
  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashOtp(code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function sendOtp(email, code, purpose) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be configured');
  }
  const subject = purpose === 'register' ? 'Підтвердження реєстрації' : 'Скидання пароля';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject,
      html: `<div style="font-family:Arial,sans-serif"><h2>${subject}</h2><p>Ваш код підтвердження:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Код дійсний 10 хвилин. Якщо ви не запитували його, проігноруйте цей лист.</p></div>`
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${details.slice(0, 300)}`);
  }
}

export function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function requirePost(req, res) {
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Метод не підтримується' });
  return false;
}

export function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

export function handleError(res, error, message) {
  console.error(message, error);
  if (!res.headersSent) res.status(500).json({ error: 'Внутрішня помилка сервера' });
}
