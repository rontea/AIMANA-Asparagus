import React from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { Navigate, Outlet } from 'react-router';
import Layout from './components/Layout';
import BrandMark from './components/BrandMark';
import Home from './pages/Home';
import PublicDashboard from './pages/PublicDashboard';
import ProjectDashboard from './pages/ProjectDashboard';
import Archived from './pages/Archived';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Maintenance from './pages/Maintenance';
import AuditLogs from './pages/AuditLogs';
import CheckpointHub from './pages/CheckpointHub';
import GenerateContent from './pages/GenerateContent';
import AIChat from './pages/AIChat';
import BulkStudio from './pages/BulkStudio';
import ProjectsPreview from './pages/ProjectsPreview';
import NeuralIntents from './pages/NeuralIntents';
import Extensions from './pages/Extensions';
import AestheticLabContent from './pages/AestheticLabContent';
import Podcast from './pages/Podcast';
import PromptManager from './pages/PromptManager';
import NeuralVariableRegistry from './pages/NeuralVariableRegistry';
import Install from './pages/Install';
import SearchResults from './pages/SearchResults';
import { api } from './services/api';
import type { InstallStatus } from './types';
import { isExtensionAccessibleToUser, registeredExtensionRouteEntries, type ExtensionManifest, type ExtensionRouteDefinition } from './extensions/registry';
import { BulkStudioProvider } from './hooks/useBulkStudioContext';

const isInstallReadyForApp = (status: InstallStatus | null) => {
  if (!status) return false;
  return status.state === 'ready' || status.state === 'degraded';
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const getInstallStatusWithRetry = async (attempts = 4): Promise<InstallStatus> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await api.app.getInstallStatus();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(350 * (attempt + 1));
      }
    }
  }
  throw lastError;
};

const createInstallStatusUnavailable = (): InstallStatus => ({
  name: 'AIMANA',
  version: 'unknown',
  checkedAt: Date.now(),
  state: 'degraded',
  issues: [
    {
      severity: 'warn',
      code: 'install-status-unavailable',
      message: 'Unable to load installer status from the backend. The app will retry after the server is reachable.'
    }
  ],
  admin: {
    exists: true,
    user: null
  },
  runtime: {
    nodeVersion: 'unknown',
    environment: 'unknown',
    production: false
  },
  capabilities: {
    allowDemoAdminBootstrap: false,
    allowDemoAdminLogin: false,
    allowAdminBootstrap: false
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
});

const ProtectedRoute: React.FC<{ installStatus: InstallStatus | null }> = ({ installStatus }) => {
  if (!isInstallReadyForApp(installStatus)) {
    return <Navigate to="/install" replace />;
  }
  if (!api.auth.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return (
    <BulkStudioProvider>
      <Layout>
        <Outlet />
      </Layout>
    </BulkStudioProvider>
  );
};

const LoginRoute: React.FC<{ installStatus: InstallStatus | null }> = ({ installStatus }) => {
  if (installStatus && !isInstallReadyForApp(installStatus)) {
    return <Navigate to="/install" replace />;
  }
  return <Login />;
};

const InstallRoute: React.FC<{
  installStatus: InstallStatus | null;
  onStatusChange: (status: InstallStatus) => void | Promise<void>;
}> = ({ installStatus, onStatusChange }) => {
  if (!installStatus) return null;
  if (isInstallReadyForApp(installStatus)) {
    return <Navigate to={api.auth.isAuthenticated() ? '/' : '/login'} replace />;
  }
  return <Install initialStatus={installStatus} onStatusChange={onStatusChange} />;
};

const AdminRoute: React.FC = () => {
  const user = api.auth.getUser();
  const isAdmin = user?.role === 'admin' || user?.id === 'admin-root';
  if (!isAdmin) return <Navigate to="/" replace />;
  return <CheckpointHub />;
};

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = api.auth.getUser();
  if (user?.id !== 'admin-root') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const ExtensionRouteElement: React.FC<{
  extension: Pick<ExtensionManifest, 'accessLevel'>;
  route: Pick<ExtensionRouteDefinition, 'component'>;
}> = ({ extension, route }) => {
  const user = api.auth.getUser();

  if (!isExtensionAccessibleToUser(extension, user)) {
    return <Navigate to="/extensions" replace />;
  }

  const Component = route.component;
  return <Component />;
};

const App: React.FC = () => {
  const [isBootReady, setIsBootReady] = React.useState(false);
  const [installStatus, setInstallStatus] = React.useState<InstallStatus | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      try {
        const [sessionResult, installResult] = await Promise.allSettled([
          api.auth.session(),
          getInstallStatusWithRetry()
        ]);

        if (!isMounted) return;

        if (installResult.status === 'fulfilled') {
          setInstallStatus(installResult.value);
        } else {
          setInstallStatus(createInstallStatusUnavailable());
        }

        if (sessionResult.status === 'rejected') {
          await api.auth.logout();
        }
      } finally {
        if (isMounted) {
          setIsBootReady(true);
        }
      }
    };

    void boot();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const shouldRetryInstallStatus = installStatus?.issues.some((issue) => issue.code === 'install-status-unavailable');
    if (!shouldRetryInstallStatus) return;

    let isMounted = true;
    const retry = window.setInterval(() => {
      void api.app.getInstallStatus()
        .then((nextStatus) => {
          if (isMounted) setInstallStatus(nextStatus);
        })
        .catch(() => {
          // Keep the transient degraded state until the backend is reachable.
        });
    }, 2500);

    return () => {
      isMounted = false;
      window.clearInterval(retry);
    };
  }, [installStatus]);

  const router = React.useMemo(() => createHashRouter([
    {
      path: '/install',
      element: <InstallRoute installStatus={installStatus} onStatusChange={setInstallStatus} />
    },
    {
      path: '/login',
      element: <LoginRoute installStatus={installStatus} />
    },
    {
      path: '/forgot-password',
      element: <ForgotPassword />
    },
    {
      path: '/reset-password',
      element: <ResetPassword />
    },
    {
      path: '/',
      element: <ProtectedRoute installStatus={installStatus} />,
      children: [
        {
          index: true,
          element: <PublicDashboard />
        },
        {
          path: 'projects',
          element: <Home />
        },
        {
          path: 'search',
          element: <SearchResults />
        },
        {
          path: 'dashboard',
          element: <PublicDashboard />
        },
        {
          path: 'generate',
          element: <GenerateContent />
        },
        {
          path: 'chat',
          element: <AIChat />
        },
        {
          path: 'bulk-studio',
          element: <BulkStudio />
        },
        {
          path: 'prompt-manager',
          element: <PromptManager />
        },
        {
          path: 'variable-registry',
          element: <NeuralVariableRegistry />
        },
        {
          path: 'preview',
          element: <ProjectsPreview />
        },
        {
          path: 'archived',
          element: <Archived />
        },
        {
          path: 'neural-saved',
          element: <AestheticLabContent />
        },
        {
          path: 'settings',
          element: <Settings />
        },
        {
          path: 'maintenance',
          element: <Maintenance />
        },
        {
          path: 'audit-trail',
          element: (
            <SuperAdminRoute>
              <AuditLogs />
            </SuperAdminRoute>
          )
        },
        {
          path: 'checkpoints',
          element: <AdminRoute />
        },
        {
          path: 'intents',
          element: <NeuralIntents />
        },
        {
          path: 'extensions',
          element: <Extensions />
        },
        ...registeredExtensionRouteEntries.map(({ extension, route }) => ({
          path: route.path,
          element: <ExtensionRouteElement extension={extension} route={route} />
        })),
        {
          path: 'podcast',
          element: <Podcast />
        },
        {
          path: 'project/:id',
          element: <ProjectDashboard />
        },
        {
          path: '*',
          element: <Navigate to="/" replace />
        }
      ]
    }
  ]), [installStatus]);

  if (!isBootReady || !installStatus) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-5">
          <BrandMark
            showWordmark={false}
            imageClassName="h-20 w-auto opacity-95 drop-shadow-[0_0_28px_rgba(99,102,241,0.18)]"
          />
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Preparing Installer
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
};

export default App;
