import { dbRun } from '../db/connection.js';
import { logSystemEvent } from '../db/logger.js';

export const revokeActiveSessionsForStartup = async () => {
  const now = Date.now();
  const result = await dbRun(
    `UPDATE auth_sessions
     SET revokedAt = ?
     WHERE revokedAt IS NULL
       AND expiresAt > ?`,
    [now, now]
  );

  const revokedCount = Number(result?.changes || 0);
  if (revokedCount > 0) {
    await logSystemEvent(
      'INFO',
      'AUTH',
      `Revoked ${revokedCount} active session(s) during backend startup.`
    );
  }

  return revokedCount;
};
