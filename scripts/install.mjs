#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const ENV_PATH = path.join(ROOT_DIR, '.env');

const parseArgs = (argv) => {
    const parsed = {
        _: [],
        flags: new Set(),
        values: new Map()
    };

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            parsed._.push(token);
            continue;
        }

        const raw = token.slice(2);
        if (raw.includes('=')) {
            const [key, ...rest] = raw.split('=');
            parsed.values.set(key, rest.join('='));
            continue;
        }

        const next = argv[index + 1];
        if (next && !next.startsWith('--')) {
            parsed.values.set(raw, next);
            index += 1;
            continue;
        }

        parsed.flags.add(raw);
    }

    return parsed;
};

const args = parseArgs(process.argv.slice(2));
const isWindows = process.platform === 'win32';

const hasFlag = (name) => args.flags.has(name);
const getValue = (name, fallback = '') => {
    if (args.values.has(name)) return String(args.values.get(name) || '');
    return fallback;
};

const runCommand = (command, commandArgs) => {
    const result = spawnSync(command, commandArgs, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: false,
        env: process.env
    });
    if (result.status !== 0) {
        throw new Error(`Command failed: ${command} ${commandArgs.join(' ')}`);
    }
};

const log = (message) => {
    process.stdout.write(`${message}\n`);
};

const ensureEnvFile = () => {
    if (fs.existsSync(ENV_PATH)) return false;
    if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
        throw new Error('Missing .env.example; cannot scaffold .env.');
    }
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    return true;
};

const loadModule = async (relativePath) => import(pathToFileURL(path.join(ROOT_DIR, relativePath)).href);

const summarizeIssues = (issues) => {
    const blocking = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warn');
    return { blocking, warnings };
};

const printSummary = (summary, snapshot) => {
    const { blocking, warnings } = summarizeIssues(snapshot.issues || []);
    log('');
    log(`AIMANA ${summary.version} install summary`);
    log(`State: ${summary.state}`);
    log(`Instance: ${summary.instanceName}`);
    log(`App URL: ${summary.appUrl}`);
    log(`Login URL: ${summary.loginUrl}`);
    log(`Storage: ${summary.storage.root}`);
    log(`Uploads: ${summary.storage.uploads}`);
    log(`Database: ${summary.storage.database}`);
    log(`Env file: ${summary.storage.envFile}`);
    log(`Admin: ${summary.adminAccount ? `${summary.adminAccount.name} <${summary.adminAccount.email}>` : 'not created yet'}`);
    log(`Integrations: ${summary.enabledIntegrations.filter((entry) => entry.enabled).map((entry) => entry.label).join(', ') || 'core install only'}`);
    if (blocking.length > 0) {
        log(`Blocking issues: ${blocking.map((issue) => issue.message).join(' | ')}`);
    }
    if (warnings.length > 0) {
        log(`Warnings: ${warnings.map((issue) => issue.message).join(' | ')}`);
    }
    log('Next hardening steps:');
    for (const step of summary.recommendedHardeningSteps) {
        log(`- ${step}`);
    }
    log('');
};

const main = async () => {
    const headless = hasFlag('headless');
    const skipInstall = hasFlag('skip-install');
    const skipBuild = hasFlag('skip-build');
    const skipFinalize = hasFlag('skip-finalize');
    const npmCommand = isWindows ? 'npm.cmd' : 'npm';

    log('Preparing AIMANA source deployment...');

    const envCreated = ensureEnvFile();
    if (envCreated) {
        log('Created .env from .env.example.');
    }

    if (!skipInstall) {
        log('Installing npm dependencies...');
        runCommand(npmCommand, ['install']);
    }

    const [{ initDB }, installStatusModule, installerConfigModule, bootstrapModule, summaryModule] = await Promise.all([
        loadModule('server/db.js'),
        loadModule('server/utils/installStatus.js'),
        loadModule('server/utils/installerConfig.js'),
        loadModule('server/utils/installBootstrap.js'),
        loadModule('server/utils/installSummary.js')
    ]);

    await initDB();
    const initialSnapshot = await installStatusModule.getInstallStatusSnapshot();

    const runtimeUpdates = {};
    const passthroughFlags = [
        'auth-secret',
        'api-key',
        'pollinations-api-key',
        'airforce-api-key',
        'google-client-id',
        'google-api-key',
        'chat-web-search-provider',
        'tavily-api-key',
        'chat-web-search-searxng-url'
    ];
    const keyMap = {
        'auth-secret': 'AUTH_SECRET',
        'api-key': 'API_KEY',
        'pollinations-api-key': 'POLLINATIONS_API_KEY',
        'airforce-api-key': 'AIRFORCE_API_KEY',
        'google-client-id': 'GOOGLE_CLIENT_ID',
        'google-api-key': 'GOOGLE_API_KEY',
        'chat-web-search-provider': 'CHAT_WEB_SEARCH_PROVIDER',
        'tavily-api-key': 'TAVILY_API_KEY',
        'chat-web-search-searxng-url': 'CHAT_WEB_SEARCH_SEARXNG_URL'
    };

    for (const flagName of passthroughFlags) {
        const value = getValue(flagName);
        if (!value) continue;
        runtimeUpdates[keyMap[flagName]] = value;
    }

    const shouldGenerateSecret = hasFlag('generate-auth-secret')
        || (!runtimeUpdates.AUTH_SECRET && initialSnapshot.issues.some((issue) => issue.code === 'auth-secret-unsafe'));

    if (Object.keys(runtimeUpdates).length > 0 || shouldGenerateSecret) {
        installerConfigModule.saveInstallerRuntimeConfig({
            ...runtimeUpdates,
            generateAuthSecret: shouldGenerateSecret
        });
        log(shouldGenerateSecret ? 'Runtime config saved and AUTH_SECRET generated.' : 'Runtime config saved.');
    }

    const instanceName = getValue('instance-name');
    const mode = getValue('mode', 'local-first');
    const notes = getValue('notes');
    if (instanceName || headless) {
        await bootstrapModule.saveInstallerProfile({
            instanceName: instanceName || 'AIMANA',
            mode,
            notes
        });
        log('Installer profile saved.');
    }

    if (headless) {
        const adminEmail = getValue('admin-email');
        const adminPassword = getValue('admin-password');
        const adminName = getValue('admin-name', 'Root Admin');

        if (!adminEmail || !adminPassword) {
            throw new Error('Headless install requires --admin-email and --admin-password.');
        }

        await bootstrapModule.bootstrapInitialAdmin({
            email: adminEmail,
            password: adminPassword,
            name: adminName
        });
        log('Initial admin created.');
    }

    if (!skipBuild) {
        log('Building production bundle...');
        runCommand(npmCommand, ['run', 'build']);
    }

    if (headless && !skipFinalize) {
        await bootstrapModule.finalizeInstaller();
        log('Installer finalized.');
    }

    const snapshot = await installStatusModule.getInstallStatusSnapshot();
    const summary = await summaryModule.buildInstallSummary();
    printSummary(summary, snapshot);

    if (headless) {
        log('Headless installation complete.');
        return;
    }

    log('Source deployment install command complete.');
    log('Run `npm start` to launch the production server, then finish any remaining setup in `#/install` if the state is not yet ready.');
};

main().catch((error) => {
    console.error(`[install:app] ${error.message}`);
    process.exit(1);
});
