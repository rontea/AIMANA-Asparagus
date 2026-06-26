/**
 * AIMANA Privileged Session Service
 * Manages the "Step-Up" authentication state for sensitive zones.
 */

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 Minutes
let elevatedExpiry: number | null = null;

export const privilegedAuth = {
    /**
     * Check if the user is currently within a valid elevated session.
     */
    isAuthorized: (): boolean => {
        if (!elevatedExpiry) return false;
        const now = Date.now();
        if (now > elevatedExpiry) {
            elevatedExpiry = null;
            return false;
        }
        return true;
    },

    /**
     * Initialize a new elevated session (called after password verification).
     */
    authenticate: (): void => {
        elevatedExpiry = Date.now() + SESSION_DURATION_MS;
    },

    /**
     * Extend the existing session if the user is active.
     * Only works if a session hasn't already expired.
     */
    extend: (): void => {
        if (elevatedExpiry && Date.now() < elevatedExpiry) {
            elevatedExpiry = Date.now() + SESSION_DURATION_MS;
        }
    },

    /**
     * Instantly end the elevated session.
     */
    revoke: (): void => {
        elevatedExpiry = null;
    }
};