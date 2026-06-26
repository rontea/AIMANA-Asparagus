import { dbGet, logSystemEvent, createErrorReport } from './db.js';
import { verifyAuthToken } from './utils/authToken.js';

export const securityHeaders = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://ui-avatars.com https://*.googleusercontent.com https://*.svgrepo.com; connect-src 'self' https://*.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com;");
    next();
};

const getBearerToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim();
};

const getCookieToken = (req) => {
    const raw = req.headers.cookie || '';
    if (!raw) return null;
    const parts = raw.split(';');
    for (const part of parts) {
        const [name, ...valueParts] = part.trim().split('=');
        if (name === 'aimana_session') {
            return decodeURIComponent(valueParts.join('=') || '');
        }
    }
    return null;
};

export const requireAuth = async (req, res, next) => {
    try {
        const token = getCookieToken(req) || getBearerToken(req);
        const decoded = verifyAuthToken(token);
        if (!decoded?.sub || !decoded?.sid) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const session = await dbGet(
            'SELECT id, userId, expiresAt, revokedAt FROM auth_sessions WHERE id = ?',
            [decoded.sid]
        );
        if (!session || session.userId !== decoded.sub || session.revokedAt) {
            return res.status(401).json({ error: 'Session is invalid' });
        }
        if (Number(session.expiresAt) <= Date.now()) {
            return res.status(401).json({ error: 'Session expired' });
        }

        const user = await dbGet(
            'SELECT id, email, name, role, provider, isBlocked, avatar, lastLogin, createdAt FROM users WHERE id = ?',
            [decoded.sub]
        );
        if (!user || user.isBlocked) {
            return res.status(401).json({ error: 'Session is invalid' });
        }

        req.user = user;
        req.authSession = session;
        next();
    } catch (err) {
        next(err);
    }
};

export const requireAdmin = (req, res, next) => {
    const role = req.user?.role;
    if (role === 'admin' || req.user?.id === 'admin-root') return next();
    return res.status(403).json({ error: 'Admin privileges required' });
};

export const requireDeleteVerification = async (req, res, next) => {
    try {
        const row = await dbGet("SELECT value FROM settings WHERE key = 'app_config'");
        const config = row ? JSON.parse(row.value) : {};

        const isItemProtectionEnabled = !!config.isItemProtectionEnabled;
        if (!isItemProtectionEnabled) return next();

        const isTotpEnforced = !!config.isTwoFactorRequiredForDelete;
        const isPinEnforced = !!config.isPinProtectionEnabled;

        // Fail-safe: deletion security must have at least one verification method selected.
        if (!isTotpEnforced && !isPinEnforced) {
            return res.status(403).json({
                error: 'Deletion security policy is active but no verification method is configured.'
            });
        }

        const user = await dbGet("SELECT twoFactorSecret, pinHash FROM users WHERE id = ?", [req.user.id]);
        const hasTotp = !!user?.twoFactorSecret;
        const hasPin = !!user?.pinHash;

        const needsSetup = (isTotpEnforced && !hasTotp) || (isPinEnforced && !hasPin);
        if (needsSetup) {
            return res.status(403).json({
                error: 'Deletion security setup required before permanent delete.'
            });
        }

        const verificationRequired = (isTotpEnforced && hasTotp) || (isPinEnforced && hasPin);
        if (!verificationRequired) return next();

        const verificationToken = req.headers['x-delete-verification'];
        const decoded = verifyAuthToken(typeof verificationToken === 'string' ? verificationToken : null);
        if (!decoded?.sub || decoded.sub !== req.user.id || decoded.dv !== 1) {
            return res.status(401).json({ error: 'Delete verification required' });
        }
        return next();
    } catch (err) {
        return next(err);
    }
};

export const superAdminOnly = async (req, res, next) => {
    const userId = req.user?.id;
    if (userId === 'admin-root') {
        next();
    } else {
        const actor = userId || 'anonymous';
        await logSystemEvent('WARN', 'SECURITY', `Blocked access to privileged route (${req.path}) by user: ${actor}`);
        res.status(403).json({ error: "Privileged action required" });
    }
};

/**
 * Global Neural Error Handler
 * Intercepts all system-level exceptions and commits them to the Audit Trail.
 */
export const globalErrorHandler = async (err, req, res, next) => {
    const userId = req.user?.id || 'system';
    const errorStack = err.stack || 'No stack trace provided';
    const message = `[UNHANDLED_EXCEPTION] ${req.method} ${req.path}: ${err.message}`;
    
    console.error(`[CRITICAL_ERR] ${message}\n${errorStack}`);
    
    try {
        await createErrorReport({
            level: 'ERROR',
            module: 'SYSTEM_PANIC',
            source: 'server',
            errorName: err?.name || 'Error',
            message,
            stack: errorStack,
            route: `${req.method} ${req.path}`,
            userId,
            context: {
                query: req.query || {},
                params: req.params || {}
            }
        });
    } catch (logErr) {
        console.error("Failed to log system error to DB", logErr);
    }

    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({ 
        error: "Neural Pipeline Failure", 
        message: err.message,
        eventId: Date.now() 
    });
};
