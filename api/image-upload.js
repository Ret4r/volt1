import Busboy from 'busboy';
import { put } from '@vercel/blob';

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const config = {
  api: { bodyParser: false }
};

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const parser = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_FILE_SIZE, fields: 0 }
    });
    const chunks = [];
    let upload;
    let uploadError;

    parser.on('file', (field, file, info) => {
      if (field !== 'file' || upload) {
        uploadError = new Error('Очікується один файл зображення');
        file.resume();
        return;
      }
      if (!ALLOWED_TYPES.has(info.mimeType)) {
        uploadError = new Error('Дозволені формати: JPEG, PNG та WebP');
        file.resume();
        return;
      }

      upload = { filename: info.filename, contentType: info.mimeType };
      file.on('data', chunk => chunks.push(chunk));
      file.on('limit', () => { uploadError = new Error('Файл перевищує ліміт 3 МБ'); });
      file.on('error', reject);
    });
    parser.on('filesLimit', () => { uploadError = new Error('Можна завантажити лише один файл за раз'); });
    parser.on('fieldsLimit', () => { uploadError = new Error('Неприпустимий формат запиту'); });
    parser.on('error', reject);
    parser.on('finish', () => {
      if (uploadError) return reject(uploadError);
      if (!upload || chunks.length === 0) return reject(new Error('Файл не отримано'));
      resolve({ ...upload, buffer: Buffer.concat(chunks) });
    });

    req.pipe(parser);
  });
}

function matchesImageType(buffer, contentType) {
  if (contentType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Невірний пароль розробника' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Не налаштовано BLOB_READ_WRITE_TOKEN у Vercel' });
  }

  let file;
  try {
    file = await parseUpload(req);
  } catch (error) {
    const message = error && error.message ? error.message : 'Не вдалося прочитати файл';
    console.warn('[image-upload] Request rejected:', message);
    return res.status(400).json({ error: message });
  }
  if (!matchesImageType(file.buffer, file.contentType)) {
    console.warn('[image-upload] File signature does not match MIME type:', file.contentType);
    return res.status(400).json({ error: 'Вміст файлу не відповідає формату зображення' });
  }

  try {
    const safeName = (file.filename || 'product-image').replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = await put(`products/${Date.now()}-${safeName}`, file.buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return res.status(201).json({ url: blob.url });
  } catch (error) {
    const message = error && error.message ? error.message : 'Не вдалося завантажити зображення';
    console.error('[image-upload] Blob upload failed:', error);
    return res.status(502).json({ error: message });
  }
}
