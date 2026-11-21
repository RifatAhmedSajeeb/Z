// ============================================================================
// CineMega — Admin Authentication, Scrypt Password Hashing & Session Security
// ============================================================================

import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE_NAME = 'cinemega_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Ephemeral fallback secret for local dev if SESSION_SECRET is not set
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

export function getSessionSecret(envSecret?: string): string {
  return (envSecret && envSecret.trim().length >= 16)
    ? envSecret.trim()
    : (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16)
      ? process.env.SESSION_SECRET.trim()
      : EPHEMERAL_SECRET;
}

/**
 * Generates a cryptographically strong random salt and scrypt hash.
 */
export function hashPasswordScrypt(password: string, existingSalt?: string): {
  salt: string;
  hash: string;
} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return {
    salt,
    hash: derivedKey.toString('hex'),
  };
}

/**
 * Verifies a password against a stored salt and scrypt hash using timingSafeEqual.
 */
export function verifyPasswordScrypt(
  password: string,
  salt: string,
  expectedHashHex: string
): boolean {
  try {
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    if (derivedKey.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, expectedBuf);
  } catch {
    return false;
  }
}

export interface SessionTokenPayload {
  username: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Creates an HMAC-SHA256 signed session token.
 */
export function createAdminSessionToken(
  payload: Omit<SessionTokenPayload, 'iat' | 'exp'>,
  envSecret?: string
): string {
  const now = Date.now();
  const fullPayload: SessionTokenPayload = {
    username: payload.username,
    email: payload.email,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const secret = getSessionSecret(envSecret);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token and checks expiration.
 */
export function verifyAdminSessionToken(
  token: string | null | undefined,
  envSecret?: string
): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const secret = getSessionSecret(envSecret);
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (!decoded.exp || Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extracts the admin session token from either Authorization: Bearer <token> or HttpOnly Cookie.
 */
export function extractAdminTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const part of cookies) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/**
 * Builds a secure HttpOnly Set-Cookie header compatible with iframe & cross-worker deployments.
 */
export function buildSessionCookieHeader(token: string, clear = false): string {
  if (clear) {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0`;
  }
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAgeSec}`;
}
