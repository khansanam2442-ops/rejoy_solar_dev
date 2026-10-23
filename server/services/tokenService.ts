import crypto from 'crypto';

const TOKEN_SECRET = process.env.SESSION_SECRET || 'rejoy-solar-epc-erp-production-secret-2026';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days session lifetime

export interface AuthTokenPayload {
  sub: string; // userId or customerId
  email: string;
  role: string;
  name?: string;
  iat: number; // issued at (timestamp in seconds)
  exp: number; // expires at (timestamp in seconds)
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate a cryptographically signed HMAC-SHA256 session token
 */
export function generateToken(user: { id: string; email: string; role: string; name?: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: (user.email || '').toLowerCase().trim(),
    role: user.role || 'Admin',
    name: user.name,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify token signature, expiration and payload integrity
 */
export function verifyToken(token: string): { valid: boolean; payload?: AuthTokenPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided' };
  }

  // Strip Bearer prefix if present
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  const parts = cleanToken.split('.');

  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    return { valid: false, error: 'Invalid token signature' };
  }

  try {
    const payload: AuthTokenPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Invalid token payload' };
  }
}
