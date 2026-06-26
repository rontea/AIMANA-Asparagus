import dotenv from 'dotenv';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

const backendPort = Number.parseInt(process.env.PORT || process.env.BACKEND_PORT || '3001', 10);
const healthUrl = `http://127.0.0.1:${backendPort}/api/app/install-status`;
const startupTimeoutMs = Number.parseInt(process.env.DEV_BACKEND_READY_TIMEOUT_MS || '60000', 10);
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const childEnv = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key, value]) => key && !key.includes('=') && value !== undefined)
    .map(([key, value]) => [key, String(value)])
);

let shuttingDown = false;

const startChild = (command, args) => spawn(command, args, {
  cwd: rootDir,
  env: childEnv,
  stdio: 'inherit'
});

const stopChild = (child) => {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill(process.platform === 'win32' ? 'SIGTERM' : 'SIGTERM');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForBackend = async (backend) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < startupTimeoutMs) {
    if (backend.exitCode !== null) {
      throw new Error(`Backend exited before it became ready with code ${backend.exitCode}.`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {
      // Backend is still starting. Keep polling until the timeout expires.
    }

    await sleep(250);
  }

  throw new Error(`Backend did not become ready at ${healthUrl} within ${startupTimeoutMs}ms.`);
};

console.log(`[dev] Starting backend on port ${backendPort}...`);
const backend = startChild('node', ['index.js']);

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChild(frontend);
  stopChild(backend);
  process.exitCode = code;
};

let frontend = null;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

backend.once('exit', (code) => {
  if (shuttingDown) return;
  if (!frontend) {
    console.error(`[dev] Backend stopped before Vite started. Exit code: ${code ?? 'unknown'}`);
    shutdown(code || 1);
    return;
  }
  console.error(`[dev] Backend stopped. Exit code: ${code ?? 'unknown'}`);
  shutdown(code || 1);
});

try {
  await waitForBackend(backend);
  if (process.env.DEV_PROBE_ONLY === 'true') {
    console.log('[dev] Probe complete.');
    shuttingDown = true;
    stopChild(backend);
    await new Promise((resolve) => backend.once('exit', resolve));
    process.exitCode = 0;
  } else {
    console.log('[dev] Backend is ready. Starting Vite...');
    frontend = startChild(process.execPath, [viteBin]);
    frontend.once('exit', (code) => shutdown(code || 0));
  }
} catch (error) {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
}
