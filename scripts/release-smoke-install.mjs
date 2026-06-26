#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT_DIR = process.cwd();
const TEMP_ROOT = path.join(ROOT_DIR, '.tmp', `release-smoke-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

const copyIntoTemp = (relativePath) => {
  const sourcePath = path.join(ROOT_DIR, relativePath);
  const targetPath = path.join(TEMP_ROOT, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
};

const importFromTemp = async (relativePath) => import(pathToFileURL(path.join(TEMP_ROOT, relativePath)).href);

try {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });

  for (const entry of ['package.json', '.env.example', 'scripts', 'server', 'extensions']) {
    copyIntoTemp(entry);
  }

  const envPath = path.join(TEMP_ROOT, '.env');
  const envExamplePath = path.join(TEMP_ROOT, '.env.example');
  const dbPath = path.join(TEMP_ROOT, 'storage', 'aimana.db');

  process.chdir(TEMP_ROOT);
  process.env.NODE_ENV = 'development';

  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  }

  const [{ initDB }, installStatusModule, installerConfigModule, bootstrapModule, summaryModule] = await Promise.all([
    importFromTemp('server/db.js'),
    importFromTemp('server/utils/installStatus.js'),
    importFromTemp('server/utils/installerConfig.js'),
    importFromTemp('server/utils/installBootstrap.js'),
    importFromTemp('server/utils/installSummary.js')
  ]);

  await initDB();
  installerConfigModule.saveInstallerRuntimeConfig({ generateAuthSecret: true });
  await bootstrapModule.saveInstallerProfile({
    instanceName: 'Smoke Test Instance',
    mode: 'local-first',
    notes: 'Automated release smoke test'
  });

  let snapshot = await installStatusModule.getInstallStatusSnapshot();
  if (snapshot.capabilities.allowAdminBootstrap) {
    await bootstrapModule.bootstrapInitialAdmin({
      name: 'Smoke Admin',
      email: 'smoke@aimana.local',
      password: 'SmokePass123!'
    });
    snapshot = await installStatusModule.getInstallStatusSnapshot();
  }

  if (!snapshot.admin.exists) {
    throw new Error('Smoke install did not produce an admin account.');
  }

  if (snapshot.state !== 'needs-config') {
    await bootstrapModule.finalizeInstaller();
    snapshot = await installStatusModule.getInstallStatusSnapshot();
  }

  const summary = await summaryModule.buildInstallSummary({ origin: 'http://127.0.0.1:3001' });

  assert.equal(fs.existsSync(envPath), true, 'installer should scaffold a .env file');
  assert.equal(fs.existsSync(dbPath), true, 'installer should create the SQLite database');
  assert.equal(snapshot.admin.exists, true, 'headless install should create the initial admin');
  assert.ok(['ready', 'degraded'].includes(snapshot.state), `unexpected install state: ${snapshot.state}`);
  assert.ok(summary.adminAccount, 'install summary should expose the admin account');
  assert.equal(summary.instanceName, 'Smoke Test Instance', 'install summary should preserve the instance name');

  process.stdout.write(`Installer smoke test passed in ${TEMP_ROOT}${os.EOL}`);
} finally {
  try {
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  } catch (error) {
    process.stderr.write(`Cleanup skipped for ${TEMP_ROOT}: ${error.message}${os.EOL}`);
  }
}
