import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { User } from '../types';

type SessionUser = User;
const USER_STORAGE_KEY = 'aimana_user';

const parseStoredUser = (): SessionUser | null => {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
};

// Client-side session management wrapper
export const authService = {
  setUser: (user: User | null): void => {
    if (!user) {
      localStorage.removeItem(USER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  },

  logout: (): void => {
    localStorage.removeItem(USER_STORAGE_KEY);
  },

  getUser: (): User | null => {
    return parseStoredUser();
  },

  isAuthenticated: (): boolean => {
      return !!parseStoredUser();
  },

  // --- TOTP / 2FA Helpers ---
  generateSecret: (): string => {
    const secret = new OTPAuth.Secret({ size: 20 });
    return secret.base32;
  },

  generateTotpUrl: (secret: string, email: string = 'user@aimana.local'): string => {
    const totp = new OTPAuth.TOTP({
      issuer: 'AIMANA',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });
    return totp.toString();
  },

  renderQrCode: (canvas: HTMLCanvasElement, url: string): boolean => {
    try {
        QRCode.toCanvas(canvas, url, { width: 200, margin: 1 }, (error: any) => {
          if (error) console.error(error);
        });
        return true;
    } catch (e) {
        console.error("Failed to render QR", e);
        return false;
    }
  },

  verifyToken: (token: string, secret: string): boolean => {
    const totp = new OTPAuth.TOTP({
      issuer: 'AIMANA',
      label: 'AIMANA',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }
};
