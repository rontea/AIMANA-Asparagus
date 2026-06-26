import crypto from 'crypto';
import express from 'express';
import { dbGet, dbRun, verifyPassword, hashPassword, logSystemEvent } from '../db.js';
import { requireAuth } from '../middleware.js';
import { createAuthToken, verifyAuthToken } from '../utils/authToken.js';
import * as OTPAuth from 'otpauth';

const router = express.Router();
const AUTH_COOKIE_NAME = 'aimana_session';
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12;
const allowDemoAdminLogin = () => String(process.env.ALLOW_DEMO_ADMIN_LOGIN || '').trim().toLowerCase() === 'true';

const getCookieAttributes = (maxAgeSeconds) => {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    isProd ? 'Secure' : '',
    `Max-Age=${maxAgeSeconds}`
  ].filter(Boolean).join('; ');
};

const toSafeUser = (user) => {
  const { password: _password, twoFactorSecret: _twoFactorSecret, pinHash: _pinHash, ...safe } = user;
  return safe;
};

const getCookieToken = (req) => {
  const raw = req.headers.cookie || '';
  if (!raw) return null;
  const parts = raw.split(';');
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === AUTH_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join('=') || '');
    }
  }
  return null;
};

const buildSessionToken = (user, sessionId) =>
  createAuthToken({ sub: user.id, role: user.role, sid: sessionId }, AUTH_SESSION_TTL_SECONDS);
const buildSessionCookie = (token) =>
  `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${getCookieAttributes(AUTH_SESSION_TTL_SECONDS)}`;
const buildExpiredSessionCookie = () =>
  `${AUTH_COOKIE_NAME}=; ${getCookieAttributes(0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
const createSession = async (userId) => {
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const expiresAt = now + (AUTH_SESSION_TTL_SECONDS * 1000);
  await dbRun(
    `INSERT INTO auth_sessions (id, userId, createdAt, expiresAt, revokedAt)
     VALUES (?, ?, ?, ?, NULL)`,
    [sessionId, userId, now, expiresAt]
  );
  return sessionId;
};
const revokeSession = async (sessionId) => {
  if (!sessionId) return;
  await dbRun(
    `UPDATE auth_sessions
     SET revokedAt = COALESCE(revokedAt, ?)
     WHERE id = ?`,
    [Date.now(), sessionId]
  );
};

const toAuthResponse = (user) => ({
  user: toSafeUser(user)
});

const verifyGoogleToken = async (token) => {
  const allowMock = process.env.ALLOW_MOCK_GOOGLE_AUTH === 'true' && process.env.NODE_ENV !== 'production';
  if (allowMock && token.startsWith('MOCK_TOKEN_JSON:')) {
      return JSON.parse(token.replace('MOCK_TOKEN_JSON:', ''));
  }

  const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
  const verifyRes = await fetch(verifyUrl);
  if (!verifyRes.ok) throw new Error('Invalid Google token');

  const payload = await verifyRes.json();
  if (!payload?.email) throw new Error('Google token missing email');
  if (String(payload.email_verified) !== 'true') throw new Error('Google email is not verified');

  const requiredAud = process.env.GOOGLE_CLIENT_ID;
  if (requiredAud && payload.aud !== requiredAud) throw new Error('Google token audience mismatch');

  const now = Math.floor(Date.now() / 1000);
  const exp = parseInt(payload.exp || '0', 10);
  if (!exp || exp <= now) throw new Error('Google token expired');

  return payload;
};

router.post('/login', async (req, res) => {
  try {
      const { email, password, code } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const normalizedEmail = email.toLowerCase();
      const env = String(process.env.NODE_ENV || '').toLowerCase();
      const isAdminDemo = normalizedEmail === 'admin@aimana.local' && password === 'newpassword123';

      if ((env === 'development' || env === 'test' || allowDemoAdminLogin()) && isAdminDemo) {
        const now = Date.now();
        const hashed = hashPassword(password);
        const existing = await dbGet("SELECT * FROM users WHERE lower(email) = ?", [normalizedEmail]);
        if (!existing) {
          await dbRun(
            `INSERT INTO users (id, email, password, name, role, provider, isBlocked, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['admin-root', normalizedEmail, hashed, 'Root Admin', 'admin', 'email', 0, now]
          );
        } else {
          await dbRun(
            `UPDATE users SET password = ?, isBlocked = 0, role = 'admin' WHERE lower(email) = ?`,
            [hashed, normalizedEmail]
          );
        }
      }

      const user = await dbGet("SELECT * FROM users WHERE lower(email) = ?", [normalizedEmail]);
      if (!user || !verifyPassword(password, user.password)) {
          await logSystemEvent('WARN', 'AUTH', `Failed login attempt for email: ${email}`);
          return res.status(401).json({ error: "Invalid credentials" });
      }
      if (user.isBlocked) {
          await logSystemEvent('WARN', 'AUTH', `Blocked user attempt: ${email}`);
          return res.status(403).json({ error: "Blocked" });
      }

      const login2FAEnabled = !!user.isTwoFactorLoginEnabled;
      if (login2FAEnabled) {
          if (!user.twoFactorSecret) {
              // Self-heal stale state where policy was toggled without an active secret.
              await dbRun("UPDATE users SET isTwoFactorLoginEnabled = 0 WHERE id = ?", [user.id]);
          } else {
              if (!code || String(code).length !== 6) {
                  return res.status(401).json({ error: '2FA code required', requiresTwoFactor: true });
              }

              const totp = new OTPAuth.TOTP({
                  issuer: 'AIMANA',
                  label: user.email || 'AIMANA',
                  algorithm: 'SHA1',
                  digits: 6,
                  period: 30,
                  secret: user.twoFactorSecret
              });
              const delta = totp.validate({ token: String(code), window: 1 });
              if (delta === null) {
                  await logSystemEvent('WARN', 'AUTH', `Invalid 2FA code during login for email: ${email}`);
                  return res.status(401).json({ error: 'Invalid 2FA code', requiresTwoFactor: true });
              }
          }
      }

      await dbRun("UPDATE users SET lastLogin = ? WHERE id = ?", [Date.now(), user.id]);
      await logSystemEvent('INFO', 'AUTH', `User logged in: ${user.name} (${user.role})`, user.id);
      const sessionId = await createSession(user.id);
      res.setHeader('Set-Cookie', buildSessionCookie(buildSessionToken(user, sessionId)));
      res.json(toAuthResponse(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/google', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Google token is required' });
        }
        const payload = await verifyGoogleToken(token);
        const user = await dbGet("SELECT * FROM users WHERE lower(email) = ?", [payload.email.toLowerCase()]);
        if (!user || user.isBlocked) {
            await logSystemEvent('WARN', 'AUTH', `Google SSO failed (user not found or blocked): ${payload.email}`);
            return res.status(403).json({ error: "Blocked or unregistered" });
        }
        await dbRun("UPDATE users SET lastLogin = ? WHERE id = ?", [Date.now(), user.id]);
        await logSystemEvent('INFO', 'AUTH', `User logged in via Google: ${user.name}`, user.id);
        const sessionId = await createSession(user.id);
        res.setHeader('Set-Cookie', buildSessionCookie(buildSessionToken(user, sessionId)));
        res.json(toAuthResponse(user));
    } catch (e) {
        const msg = e?.message || 'Authentication failed';
        const status = msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired') ? 401 : 400;
        res.status(status).json({ error: msg });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const decoded = verifyAuthToken(getCookieToken(req));
        await revokeSession(decoded?.sid);
        res.setHeader('Set-Cookie', buildExpiredSessionCookie());
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use(requireAuth);

router.get('/session', async (req, res) => {
    try {
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [req.user.id]);
        if (!user || user.isBlocked) {
            res.setHeader('Set-Cookie', buildExpiredSessionCookie());
            return res.status(401).json({ error: 'Session is invalid' });
        }
        res.json({ user: toSafeUser(user) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/verify-password', async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;
        const user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user || !verifyPassword(password, user.password)) {
            await logSystemEvent('WARN', 'SECURITY', `Failed step-up password verification for user ID: ${userId}`, userId);
            return res.status(401).json({ error: "Invalid password" });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/password', async (req, res) => {
    try {
        const { current, newPass } = req.body;
        const userId = req.user.id;
        if (!current || !newPass) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }
        const user = await dbGet("SELECT password FROM users WHERE id = ?", [userId]);
        if (!user || !verifyPassword(current, user.password)) {
            return res.status(401).json({ error: "Current password incorrect" });
        }
        const hashed = hashPassword(newPass);
        await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashed, userId]);
        await dbRun(
            `UPDATE auth_sessions
             SET revokedAt = COALESCE(revokedAt, ?)
             WHERE userId = ? AND revokedAt IS NULL`,
            [Date.now(), userId]
        );
        await logSystemEvent('INFO', 'AUTH', `Password changed for user ID: ${userId}`, userId);
        res.setHeader('Set-Cookie', buildExpiredSessionCookie());
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
