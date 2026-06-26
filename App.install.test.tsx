import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstallStatus } from './types';

const baseInstallStatus: InstallStatus = {
  name: 'AIMANA',
  version: '0.16.99-dev',
  checkedAt: 1710000000000,
  state: 'needs-config',
  issues: [
    {
      severity: 'error',
      code: 'env-file-missing',
      message: 'Project .env file is missing.'
    }
  ],
  admin: {
    exists: false,
    user: null
  },
  runtime: {
    nodeVersion: 'v22.0.0',
    environment: 'production',
    production: true
  },
  capabilities: {
    allowDemoAdminBootstrap: false,
    allowDemoAdminLogin: false,
    allowAdminBootstrap: true
  },
  installer: {
    instanceName: 'AIMANA',
    installStartedAt: null,
    bootstrapCompletedAt: null,
    configCompletedAt: null,
    finalizedAt: null,
    installedAt: null,
    installedBy: null
  }
};

const stubPage = (label: string) => () => <div>{label}</div>;

const installCommonMocks = (
  status: InstallStatus,
  isAuthenticated = false,
  getInstallStatusImplementation?: () => Promise<InstallStatus>
) => {
  const session = vi.fn().mockResolvedValue(undefined);
  const getInstallStatus = vi.fn(getInstallStatusImplementation || (() => Promise.resolve(status)));

  vi.doMock('./services/api', () => ({
    api: {
      auth: {
        session,
        logout: vi.fn().mockResolvedValue(undefined),
        isAuthenticated: vi.fn(() => isAuthenticated),
        getUser: vi.fn(() => null)
      },
      app: {
        getInstallStatus
      }
    }
  }));

  vi.doMock('./components/Layout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-shell">{children}</div>
  }));

  vi.doMock('./extensions/registry', () => ({
    isExtensionAccessibleToUser: vi.fn(() => true),
    registeredExtensionRouteEntries: []
  }));

  const pageMocks = [
    ['./pages/Home', 'Home Page'],
    ['./pages/ProjectDashboard', 'Project Dashboard'],
    ['./pages/Archived', 'Archived Page'],
    ['./pages/Settings', 'Settings Page'],
    ['./pages/Login', 'Login Page'],
    ['./pages/ForgotPassword', 'Forgot Password'],
    ['./pages/ResetPassword', 'Reset Password'],
    ['./pages/Maintenance', 'Maintenance Page'],
    ['./pages/AuditLogs', 'Audit Logs'],
    ['./pages/CheckpointHub', 'Checkpoint Hub'],
    ['./pages/GenerateContent', 'Generate Content'],
    ['./pages/AIChat', 'AI Chat'],
    ['./pages/BulkStudio', 'Bulk Studio'],
    ['./pages/ProjectsPreview', 'Projects Preview'],
    ['./pages/NeuralIntents', 'Neural Intents'],
    ['./pages/Extensions', 'Extensions'],
    ['./pages/AestheticLabContent', 'Aesthetic Lab'],
    ['./pages/Podcast', 'Podcast'],
    ['./pages/PromptManager', 'Prompt Manager'],
    ['./pages/NeuralVariableRegistry', 'Variable Registry']
  ] as const;

  for (const [specifier, label] of pageMocks) {
    vi.doMock(specifier, () => ({ default: stubPage(label) }));
  }

  vi.doMock('./pages/Install', () => ({
    default: ({ initialStatus }: { initialStatus: InstallStatus }) => (
      <div>
        Installer Page
        <div>{initialStatus.state}</div>
      </div>
    )
  }));
};

describe('App installer routing', () => {
  beforeEach(() => {
    vi.resetModules();
    window.location.hash = '#/login';
  });

  it('redirects login traffic to the installer while setup is incomplete', async () => {
    installCommonMocks(baseInstallStatus);

    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Installer Page')).toBeInTheDocument();
    });
    expect(screen.getByText('needs-config')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('redirects the installer route to login once installation is ready', async () => {
    window.location.hash = '#/install';
    installCommonMocks({
      ...baseInstallStatus,
      state: 'ready',
      issues: [],
      admin: {
        exists: true,
        user: {
          id: 'admin-root',
          email: 'admin@aimana.local',
          name: 'Root Admin',
          role: 'admin'
        }
      },
      capabilities: {
        allowDemoAdminBootstrap: false,
        allowDemoAdminLogin: false,
        allowAdminBootstrap: false
      },
      installer: {
        ...baseInstallStatus.installer,
        finalizedAt: 1710000002000,
        installedAt: 1710000002000,
        installedBy: 'admin-root'
      }
    });

    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Installer Page')).not.toBeInTheDocument();
  });

  it('keeps the installer route open while installation needs finalization', async () => {
    window.location.hash = '#/install';
    installCommonMocks({
      ...baseInstallStatus,
      state: 'needs-finalize',
      issues: [],
      admin: {
        exists: true,
        user: {
          id: 'admin-root',
          email: 'admin@aimana.local',
          name: 'Root Admin',
          role: 'admin'
        }
      },
      capabilities: {
        allowDemoAdminBootstrap: false,
        allowDemoAdminLogin: false,
        allowAdminBootstrap: false
      },
      installer: {
        ...baseInstallStatus.installer,
        configCompletedAt: 1710000001000,
        bootstrapCompletedAt: 1710000002000
      }
    });

    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Installer Page')).toBeInTheDocument();
    });
    expect(screen.getByText('needs-finalize')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('does not open installer when install status is temporarily unavailable', async () => {
    window.location.hash = '#/login';
    installCommonMocks(baseInstallStatus, false, async () => {
      throw new Error('backend restarting');
    });

    const { default: App } = await import('./App');
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(screen.queryByText('Installer Page')).not.toBeInTheDocument();
  });
});
