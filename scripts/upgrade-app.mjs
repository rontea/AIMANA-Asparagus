#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const args = new Set(process.argv.slice(2));
const skipInstall = args.has('--skip-install');
const skipBuild = args.has('--skip-build');
const dryRun = args.has('--dry-run');

const backupRoot = path.join(ROOT_DIR, 'backups', 'upgrades', timestamp);
const copyTargets = [
    '.env',
    'storage',
    'extensions/hostConfig.shared.js',
    'extensions/hostConfig.ts',
    'server/extensions/hostConfig.js',
    'package.json',
    'package-lock.json'
];

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

const ensureDir = (target) => {
    fs.mkdirSync(target, { recursive: true });
};

const copyPath = (relativePath) => {
    const source = path.join(ROOT_DIR, relativePath);
    if (!fs.existsSync(source)) {
        return { path: relativePath, copied: false, reason: 'missing' };
    }

    const destination = path.join(backupRoot, relativePath);
    ensureDir(path.dirname(destination));
    fs.cpSync(source, destination, { recursive: true, force: true });
    return { path: relativePath, copied: true };
};

const main = async () => {
    console.log(`Preparing upgrade backup in ${backupRoot}`);

    if (!dryRun) {
        ensureDir(backupRoot);
    }

    const copied = [];
    for (const target of copyTargets) {
        const source = path.join(ROOT_DIR, target);
        const result = fs.existsSync(source)
            ? (dryRun ? { path: target, copied: true } : copyPath(target))
            : { path: target, copied: false, reason: 'missing' };
        copied.push(result);
        console.log(`${result.copied ? 'Preserved' : 'Skipped'} ${target}${result.reason ? ` (${result.reason})` : ''}`);
    }

    if (!dryRun) {
        fs.writeFileSync(
            path.join(backupRoot, 'UPGRADE_MANIFEST.json'),
            JSON.stringify(
                {
                    createdAt: new Date().toISOString(),
                    backupRoot,
                    preservedPaths: copied
                },
                null,
                2
            ),
            'utf8'
        );
    }

    if (!skipInstall) {
        console.log('Updating npm dependencies...');
        runCommand(npmCommand, ['install']);
    }

    if (!skipBuild) {
        console.log('Rebuilding production bundle...');
        runCommand(npmCommand, ['run', 'build']);
    }

    console.log('Upgrade workflow complete.');
    console.log(`Backup root: ${backupRoot}`);
    console.log('Review the new build, then restart the service or run `npm start`.');
};

main().catch((error) => {
    console.error(`[upgrade:app] ${error.message}`);
    process.exit(1);
});
