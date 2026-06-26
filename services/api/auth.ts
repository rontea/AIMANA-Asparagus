import { authService } from '../auth';
import { API_BASE, handleResponse, getHeaders } from './utils';
import type { User } from '../../types';

const storeSessionUser = (user: User | null) => {
    authService.setUser(user);
    return user;
};

export const auth = {
    login: async (email: string, password?: string, code?: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password, code })
        });
        if(!res.ok) {
            const e = await res.json().catch(() => ({} as any));
            const err: any = new Error(e.error || 'Login failed');
            if (e.requiresTwoFactor) err.requiresTwoFactor = true;
            throw err;
        }
        const data = await res.json();
        storeSessionUser(data.user);
    },
    loginWithGoogle: async (token: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/auth/google`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token })
        });
        if(!res.ok) {
            const e = await res.json();
            throw new Error(e.error);
        }
        const data = await res.json();
        storeSessionUser(data.user);
    },
    session: async (): Promise<User | null> => {
        const res = await fetch(`${API_BASE}/auth/session`, {
            method: 'GET',
            credentials: 'same-origin'
        });
        if (res.status === 401 || res.status === 403) {
            storeSessionUser(null);
            return null;
        }
        if (!res.ok) {
            throw new Error(`Session check failed: ${res.status}`);
        }
        const data = await res.json();
        return storeSessionUser(data.user);
    },
    verifyPassword: async (password: string): Promise<void> => {
        await fetch(`${API_BASE}/auth/verify-password`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ password })
        }).then(handleResponse);
    },
    logout: async (): Promise<void> => {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                credentials: 'same-origin'
            });
        } catch {
            // Ignore network failures and clear the local cache anyway.
        }
        authService.logout();
    },
    verifyResetToken: async (token: string): Promise<boolean> => {
        return token === 'demo-token-123';
    },
    resetPassword: async (email: string, newPassword: string): Promise<void> => {
        await new Promise(r => setTimeout(r, 1000));
    },
    updatePassword: async (current: string, newPass: string): Promise<void> => {
        const user = authService.getUser();
        if (!user) throw new Error("Not authenticated");
        await fetch(`${API_BASE}/auth/password`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ current, newPass })
        }).then(handleResponse);
    },
    getUser: () => authService.getUser(),
    getAuthHeaders: (overrides: Record<string, string> = {}) => ({ ...overrides }),
    isAuthenticated: () => authService.isAuthenticated(),
    generateSecret: () => authService.generateSecret(),
    generateTotpUrl: (secret: string, email?: string) => authService.generateTotpUrl(secret, email),
    renderQrCode: (canvas: HTMLCanvasElement, url: string) => authService.renderQrCode(canvas, url),
    verify: (token: string, secret: string) => authService.verifyToken(token, secret)
};
