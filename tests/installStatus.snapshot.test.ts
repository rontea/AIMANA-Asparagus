// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type InstallScenario = {
  envFile?: { exists: boolean; readable?: boolean; writable?: boolean };
  storageDir?: { exists: boolean; readable?: boolean; writable?: boolean };
  uploadsDir?: { exists: boolean; readable?: boolean; writable?: boolean };
  dbFile?: { exists: boolean; readable?: boolean; writable?: boolean };
  distIndex?: { exists: boolean; readable?: boolean; writable?: boolean };
  production?: boolean;
  unsafeAuthSecret?: boolean;
  adminUser?: { id: string; email: string; name: string; role: string } | null;
  installRecord?: Record<string, unknown> | null;
  workspaceCounts?: {
    projects?: number;
    items?: number;
    chatItems?: number;
    chatSessions?: number;
  };
};

const originalEnv = { ...process.env };

const createPathState = (overrides?: { exists: boolean; readable?: boolean; writable?: boolean }) => ({
  exists: overrides?.exists ?? true,
  readable: overrides?.readable ?? true,
  writable: overrides?.writable ?? true
});

const loadInstallStatusModule = async (scenario: InstallScenario = {}) => {
  vi.resetModules();

  process.env = {
    ...originalEnv,
    NODE_ENV: scenario.production ? 'production' : 'development',
    API_KEY: '',
    POLLINATIONS_API_KEY: '',
    CHAT_WEB_SEARCH_PROVIDER: '',
    TAVILY_API_KEY: '',
    CHAT_WEB_SEARCH_SEARXNG_URL: '',
    ALLOW_DEMO_ADMIN_BOOTSTRAP: '',
    ALLOW_DEMO_ADMIN_LOGIN: ''
  };

  const connection = {
    ROOT_DIR: '/test-root',
    STORAGE_DIR: '/test-root/storage',
    UPLOADS_DIR: '/test-root/storage/uploads',
    DB_FILE: '/test-root/storage/aimana.db'
  };

  const pathStates = new Map<string, ReturnType<typeof createPathState>>([
    ['/test-root/.env', createPathState(scenario.envFile)],
    [connection.STORAGE_DIR, createPathState(scenario.storageDir)],
    [connection.UPLOADS_DIR, createPathState(scenario.uploadsDir)],
    [connection.DB_FILE, createPathState({ exists: false, ...scenario.dbFile })],
    ['/test-root/dist/index.html', createPathState({ exists: false, ...scenario.distIndex })]
  ]);

  const actualFs = await vi.importActual<typeof import('fs')>('fs');
  const existsSync = vi.fn((targetPath: string) => pathStates.get(targetPath)?.exists ?? false);
  const accessSync = vi.fn((targetPath: string, mode: number) => {
    const target = pathStates.get(targetPath);
    if (!target?.exists) {
      throw new Error(`ENOENT: ${targetPath}`);
    }
    if ((mode & 4) !== 0 && !target.readable) {
      throw new Error(`EACCES: ${targetPath}`);
    }
    if ((mode & 2) !== 0 && !target.writable) {
      throw new Error(`EACCES: ${targetPath}`);
    }
  });

  const dbGet = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT value FROM settings')) {
      if (!scenario.installRecord) return undefined;
      return { value: JSON.stringify(scenario.installRecord) };
    }
    if (sql.includes('FROM users')) {
      return scenario.adminUser ?? null;
    }
    if (sql.includes('FROM projects')) {
      return { count: scenario.workspaceCounts?.projects ?? 0 };
    }
    if (sql.includes('FROM items')) {
      return { count: scenario.workspaceCounts?.items ?? 0 };
    }
    if (sql.includes('FROM chat_items')) {
      return { count: scenario.workspaceCounts?.chatItems ?? 0 };
    }
    if (sql.includes('FROM chat_sessions')) {
      return { count: scenario.workspaceCounts?.chatSessions ?? 0 };
    }
    return undefined;
  });

  const dbRun = vi.fn(async () => ({}));

  vi.doMock('fs', () => ({
    ...actualFs,
    default: {
      ...actualFs,
      existsSync,
      accessSync
    },
    existsSync,
    accessSync
  }));
  vi.doMock('../server/db.js', () => ({
    dbGet,
    dbRun
  }));
  vi.doMock('../server/db/connection.js', () => connection);
  vi.doMock('../server/utils/authToken.js', () => ({
    isUnsafeAuthSecret: vi.fn(() => scenario.unsafeAuthSecret ?? false)
  }));

  const module = await import('../server/utils/installStatus.js');
  return { module, dbGet, dbRun };
};

describe('getInstallStatusSnapshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports missing .env as blocking on first boot in production', async () => {
    const { module } = await loadInstallStatusModule({
      production: true,
      envFile: { exists: false },
      distIndex: { exists: true },
      adminUser: null
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-config');
    expect(snapshot.issues.some((issue: { code: string }) => issue.code === 'env-file-missing')).toBe(true);
  });

  it('reports an unsafe AUTH_SECRET as blocking in production', async () => {
    const { module } = await loadInstallStatusModule({
      production: true,
      envFile: { exists: true },
      distIndex: { exists: true },
      unsafeAuthSecret: true,
      adminUser: null
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-config');
    expect(snapshot.issues.some((issue: { code: string }) => issue.code === 'auth-secret-unsafe')).toBe(true);
  });

  it('reports a missing frontend build as blocking in production', async () => {
    const { module } = await loadInstallStatusModule({
      production: true,
      envFile: { exists: true },
      distIndex: { exists: false },
      adminUser: null
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-config');
    expect(snapshot.issues.some((issue: { code: string }) => issue.code === 'frontend-build-missing')).toBe(true);
  });

  it('reports an unwritable database file in storage as blocking', async () => {
    const { module } = await loadInstallStatusModule({
      envFile: { exists: true },
      dbFile: { exists: true, readable: true, writable: false },
      distIndex: { exists: false },
      adminUser: null
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-config');
    expect(snapshot.issues.some((issue: { code: string }) => issue.code === 'db-file-unwritable')).toBe(true);
  });

  it('reports missing admin bootstrap when config is otherwise usable', async () => {
    const { module } = await loadInstallStatusModule({
      envFile: { exists: true },
      distIndex: { exists: false },
      adminUser: null,
      installRecord: {
        configCompletedAt: 1710000000000
      }
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-admin-setup');
    expect(snapshot.admin.exists).toBe(false);
  });

  it('keeps installer active after admin creation until finalization', async () => {
    const { module } = await loadInstallStatusModule({
      envFile: { exists: true },
      distIndex: { exists: false },
      adminUser: {
        id: 'admin-root',
        email: 'admin@example.com',
        name: 'Root Admin',
        role: 'admin'
      },
      installRecord: {
        configCompletedAt: 1710000000000,
        bootstrapCompletedAt: 1710000001000
      }
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('needs-finalize');
    expect(snapshot.admin.exists).toBe(true);
  });

  it('treats a populated legacy database with an admin as already installed', async () => {
    const { module } = await loadInstallStatusModule({
      envFile: { exists: true },
      distIndex: { exists: false },
      adminUser: {
        id: 'admin-root',
        email: 'admin@example.com',
        name: 'Root Admin',
        role: 'admin'
      },
      workspaceCounts: {
        projects: 12,
        items: 340
      }
    });

    const snapshot = await module.getInstallStatusSnapshot();

    expect(snapshot.state).toBe('degraded');
    expect(snapshot.admin.exists).toBe(true);
  });
});
