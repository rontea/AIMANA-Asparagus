import { describe, expect, it } from 'vitest';

import { deriveInstallState } from '../server/utils/installStatus.js';

describe('deriveInstallState', () => {
  it('returns needs-config when blocking issues are present', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [{ severity: 'error', code: 'env-file-missing', message: 'Missing .env.' }]
      })
    ).toBe('needs-config');
  });

  it('returns needs-admin-setup when config is clean but no admin exists', () => {
    expect(
      deriveInstallState({
        hasAdmin: false,
        issues: [],
        installRecord: {
          configCompletedAt: 1710000000000
        }
      })
    ).toBe('needs-admin-setup');
  });

  it('returns needs-config when installer settings have not been saved', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: []
      })
    ).toBe('needs-config');
  });

  it('returns ready for a legacy finalized install even when installer settings metadata is missing', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [],
        installRecord: {
          finalizedAt: 1710000001000
        }
      })
    ).toBe('ready');
  });

  it('returns ready for a populated legacy workspace with an admin', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [],
        hasExistingWorkspaceData: true
      })
    ).toBe('ready');
  });

  it('returns needs-finalize when settings and admin exist but install is not finalized', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [],
        installRecord: {
          configCompletedAt: 1710000000000
        }
      })
    ).toBe('needs-finalize');
  });

  it('returns degraded when only warnings remain after finalized admin setup', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [{ severity: 'warn', code: 'google-api-key-missing', message: 'Missing API key.' }],
        installRecord: {
          configCompletedAt: 1710000000000,
          finalizedAt: 1710000001000
        }
      })
    ).toBe('degraded');
  });

  it('returns ready when there are no warnings or errors and install is finalized', () => {
    expect(
      deriveInstallState({
        hasAdmin: true,
        issues: [],
        installRecord: {
          configCompletedAt: 1710000000000,
          finalizedAt: 1710000001000
        }
      })
    ).toBe('ready');
  });
});
