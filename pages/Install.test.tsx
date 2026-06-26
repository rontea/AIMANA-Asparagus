import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Install from './Install';
import type { InstallStatus, InstallSummary, InstallerRuntimeConfig } from '../types';

const { mockNavigate, apiMock } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  apiMock: {
    app: {
      getRuntimeConfig: vi.fn(),
      getInstallSummary: vi.fn(),
      getInstallStatus: vi.fn(),
      saveInstallConfig: vi.fn(),
      bootstrapAdmin: vi.fn(),
      finalizeInstall: vi.fn(),
      saveRuntimeConfig: vi.fn()
    },
    auth: {
      isAuthenticated: vi.fn(() => false)
    }
  }
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('../services/api', () => ({
  api: apiMock
}));

const createStatus = (overrides: Partial<InstallStatus> = {}): InstallStatus => ({
  name: 'AIMANA',
  version: '0.16.99-dev',
  checkedAt: 1710000000000,
  state: 'needs-admin-setup',
  issues: [],
  admin: {
    exists: false,
    user: null
  },
  runtime: {
    nodeVersion: 'v22.0.0',
    environment: 'development',
    production: false
  },
  capabilities: {
    allowDemoAdminBootstrap: false,
    allowDemoAdminLogin: false,
    allowAdminBootstrap: true
  },
  installer: {
    instanceName: 'AIMANA',
    installStartedAt: 1710000000000,
    bootstrapCompletedAt: null,
    configCompletedAt: null,
    finalizedAt: null,
    installedAt: null,
    installedBy: null
  },
  ...overrides
});

const runtimeConfig: InstallerRuntimeConfig = {
  envFile: {
    exists: true,
    path: '/test-root/.env'
  },
  categories: [
    {
      id: 'core',
      label: 'Core Security',
      description: 'Required runtime protection.',
      fields: [
        {
          key: 'AUTH_SECRET',
          label: 'Auth Secret',
          category: 'core',
          kind: 'secret',
          required: true,
          description: 'Signing secret for sessions.',
          impact: 'Required for safe auth.',
          configured: true,
          currentValue: '',
          maskedValue: '********',
          options: null
        }
      ]
    }
  ],
  impacts: [
    {
      key: 'AUTH_SECRET',
      status: 'configured',
      message: 'Auth signing is configured.'
    }
  ]
};

const createSummary = (overrides: Partial<InstallSummary> = {}): InstallSummary => ({
  name: 'AIMANA',
  version: '0.16.99-dev',
  state: 'needs-admin-setup',
  instanceName: 'AIMANA',
  appUrl: 'http://127.0.0.1:3001',
  loginUrl: 'http://127.0.0.1:3001/#/login',
  adminAccount: null,
  storage: {
    root: '/test-root/storage',
    uploads: '/test-root/storage/uploads',
    database: '/test-root/storage/aimana.db',
    envFile: '/test-root/.env'
  },
  enabledIntegrations: [
    {
      key: 'google',
      label: 'Google AI',
      enabled: false,
      detail: 'Not configured.'
    }
  ],
  backup: {
    lastSuccessfulBackupAt: null,
    lastBackupType: null,
    lastBackupId: null,
    updatedAt: 1710000000000
  },
  recommendedHardeningSteps: ['Rotate AUTH_SECRET after rollout.'],
  ...overrides
});

describe('Install page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes the installer flow and exposes the post-install summary', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    let currentStatus = createStatus();
    let currentSummary = createSummary();

    apiMock.app.getRuntimeConfig.mockResolvedValue(runtimeConfig);
    apiMock.app.getInstallSummary.mockImplementation(async () => currentSummary);
    apiMock.app.getInstallStatus.mockImplementation(async () => currentStatus);
    apiMock.app.saveInstallConfig.mockImplementation(async ({ instanceName }: { instanceName: string }) => {
      currentStatus = createStatus({
        installer: {
          ...currentStatus.installer,
          instanceName,
          configCompletedAt: 1710000001000
        }
      });
      currentSummary = createSummary({ instanceName });
      return { success: true };
    });
    apiMock.app.bootstrapAdmin.mockImplementation(async ({ email, name }: { email: string; name: string }) => {
      currentStatus = createStatus({
        state: 'needs-finalize',
        admin: {
          exists: true,
          user: {
            id: 'admin-root',
            email,
            name,
            role: 'admin'
          }
        },
        installer: {
          ...currentStatus.installer,
          bootstrapCompletedAt: 1710000002000
        }
      });
      currentSummary = createSummary({
        state: 'ready',
        adminAccount: {
          id: 'admin-root',
          email,
          name
        }
      });
      return { success: true };
    });
    apiMock.app.finalizeInstall.mockImplementation(async () => {
      currentStatus = createStatus({
        state: 'ready',
        admin: {
          exists: true,
          user: {
            id: 'admin-root',
            email: 'admin@example.com',
            name: 'Root Admin',
            role: 'admin'
          }
        },
        installer: {
          ...currentStatus.installer,
          bootstrapCompletedAt: 1710000002000,
          finalizedAt: 1710000003000,
          installedAt: 1710000003000,
          installedBy: 'admin-root'
        }
      });
      currentSummary = createSummary({
        state: 'ready',
        adminAccount: {
          id: 'admin-root',
          email: 'admin@example.com',
          name: 'Root Admin'
        }
      });
      return { success: true };
    });

    render(
      <MemoryRouter>
        <Install initialStatus={currentStatus} onStatusChange={onStatusChange} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Runtime Secrets & Integrations')).toBeInTheDocument();
    expect(screen.getByLabelText(/create password/i)).toBeInTheDocument();

    const adminStep = screen.getByRole('heading', { name: /initial admin/i });
    const runtimeStep = screen.getByRole('heading', { name: /runtime secrets & integrations/i });
    expect(adminStep.compareDocumentPosition(runtimeStep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const instanceNameInput = screen.getByPlaceholderText('AIMANA Studio');
    await user.clear(instanceNameInput);
    await user.type(instanceNameInput, 'AIMANA QA');
    await user.click(screen.getByRole('button', { name: /save installer config/i }));

    await waitFor(() => {
      expect(apiMock.app.saveInstallConfig).toHaveBeenCalledWith({
        instanceName: 'AIMANA QA',
        mode: 'local-first',
        notes: ''
      });
    });

    const adminEmailInput = screen.getByPlaceholderText('admin@example.com');
    const passwordInputs = screen.getAllByPlaceholderText(/create a strong password/i);
    const confirmInputs = screen.getAllByPlaceholderText(/confirm password/i);

    await user.type(adminEmailInput, 'admin@example.com');
    await user.type(passwordInputs[0], 'VeryStrong123!');
    await user.type(confirmInputs[0], 'VeryStrong123!');
    await user.click(screen.getByRole('button', { name: /create initial admin/i }));

    await waitFor(() => {
      expect(apiMock.app.bootstrapAdmin).toHaveBeenCalledWith({
        name: 'Root Admin',
        email: 'admin@example.com',
        password: 'VeryStrong123!'
      });
    });

    const finalizeButton = await screen.findByRole('button', { name: /finalize installation/i });
    expect(finalizeButton).toBeEnabled();
    await user.click(finalizeButton);

    expect(await screen.findByText(/installation finalized/i)).toBeInTheDocument();
    expect(await screen.findByText('Post-Install Summary')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AIMANA QA')).toBeInTheDocument();
    expect(screen.getByText(/root admin \(admin@example\.com\)/i)).toBeInTheDocument();
    expect(screen.getByText('Rotate AUTH_SECRET after rollout.')).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /continue to login/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('does not show admin password creation after an admin already exists', async () => {
    apiMock.app.getRuntimeConfig.mockResolvedValue(runtimeConfig);
    apiMock.app.getInstallSummary.mockResolvedValue(createSummary());

    render(
      <MemoryRouter>
        <Install
          initialStatus={createStatus({
            state: 'ready',
            admin: {
              exists: true,
              user: {
                id: 'admin-root',
                email: 'admin@example.com',
                name: 'Root Admin',
                role: 'admin'
              }
            }
          })}
          onStatusChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Runtime Secrets & Integrations')).toBeInTheDocument();
    expect(screen.queryByLabelText(/create password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create initial admin/i })).not.toBeInTheDocument();
  });

  it('blocks finalization when required runtime config is missing', async () => {
    apiMock.app.getRuntimeConfig.mockResolvedValue({
      ...runtimeConfig,
      categories: runtimeConfig.categories.map((category) => ({
        ...category,
        fields: category.fields.map((field) =>
          field.key === 'AUTH_SECRET'
            ? { ...field, configured: false, maskedValue: '', currentValue: '' }
            : field
        )
      }))
    });
    apiMock.app.getInstallSummary.mockResolvedValue(createSummary());

    render(
      <MemoryRouter>
        <Install
          initialStatus={createStatus({
            state: 'needs-finalize',
            admin: {
              exists: true,
              user: {
                id: 'admin-root',
                email: 'admin@example.com',
                name: 'Root Admin',
                role: 'admin'
              }
            },
            installer: {
              ...createStatus().installer,
              configCompletedAt: 1710000001000,
              bootstrapCompletedAt: 1710000002000
            }
          })}
          onStatusChange={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('Required Checklist')).toBeInTheDocument();
    expect(screen.getByText(/missing auth secret/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /finalize installation/i })).toBeDisabled();
    expect(apiMock.app.finalizeInstall).not.toHaveBeenCalled();
  });
});
