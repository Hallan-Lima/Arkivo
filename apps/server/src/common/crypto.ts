import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = process.env.APP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('APP_SECRET/JWT_SECRET não definida');
  return createHash('sha256').update(`arkivo:secrets:${secret}`).digest();
}

/** Criptografa um segredo (chave de API, senha SMTP) com AES-256-GCM. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(enc: string | null | undefined): string {
  if (!enc) return '';
  const [v, iv, tag, data] = enc.split(':');
  if (v !== 'v1') return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
