import { dbRun, hashPassword, logSystemEvent } from '../db.js';
import { ensureRootSystemArchiveProject } from '../db/systemProjects.js';
import { getRequiredRuntimeConfigIssues } from './installerConfig.js';
import { getInstallStatusSnapshot, writeInstallStateRecord } from './installStatus.js';

const normalizeString = (value) => String(value || '').trim();

export const saveInstallerProfile = async ({ instanceName, mode = 'local-first', notes = '' }) => {
    const snapshot = await getInstallStatusSnapshot();
    const nextInstanceName = normalizeString(instanceName);
    const nextMode = normalizeString(mode) || 'local-first';
    const nextNotes = normalizeString(notes);

    if (!nextInstanceName) {
        throw new Error('Instance name is required.');
    }

    return writeInstallStateRecord({
        instanceName: nextInstanceName,
        mode: nextMode,
        notes: nextNotes,
        configCompletedAt: Date.now(),
        installState: snapshot.state
    });
};

export const bootstrapInitialAdmin = async ({ email, password, name = 'Root Admin' }) => {
    const snapshot = await getInstallStatusSnapshot();
    if (!snapshot.capabilities.allowAdminBootstrap) {
        throw new Error('Initial admin bootstrap is no longer available for this instance.');
    }
    if (snapshot.state === 'needs-config') {
        throw new Error('Resolve blocking install configuration issues before creating the initial admin.');
    }

    const normalizedEmail = normalizeString(email).toLowerCase();
    const normalizedPassword = String(password || '');
    const normalizedName = normalizeString(name) || 'Root Admin';

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new Error('A valid admin email is required.');
    }
    if (normalizedPassword.length < 10) {
        throw new Error('Admin password must be at least 10 characters long.');
    }

    await dbRun(
        `INSERT INTO users (id, email, password, name, role, provider, isBlocked, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['admin-root', normalizedEmail, hashPassword(normalizedPassword), normalizedName, 'admin', 'email', 0, Date.now()]
    );

    await writeInstallStateRecord({
        bootstrapCompletedAt: Date.now(),
        installedBy: 'admin-root'
    });
    await ensureRootSystemArchiveProject();
    await logSystemEvent('INFO', 'INSTALL', `Initial admin bootstrap completed for ${normalizedEmail}`, 'admin-root');

    return {
        id: 'admin-root',
        email: normalizedEmail,
        name: normalizedName,
        role: 'admin'
    };
};

export const finalizeInstaller = async () => {
    const snapshot = await getInstallStatusSnapshot();
    const requiredRuntimeIssues = getRequiredRuntimeConfigIssues();
    if (snapshot.state === 'needs-config') {
        throw new Error('Resolve blocking install configuration issues before finalizing installation.');
    }
    if (!snapshot.admin.exists) {
        throw new Error('Create the initial admin before finalizing installation.');
    }
    if (!snapshot.installer.configCompletedAt) {
        throw new Error('Save installer settings before finalizing installation.');
    }
    if (requiredRuntimeIssues.length > 0) {
        throw new Error(`Complete required runtime configuration before finalizing installation: ${requiredRuntimeIssues.map((issue) => issue.label).join(', ')}.`);
    }

    const finalizedAt = Date.now();
    const record = await writeInstallStateRecord({
        finalizedAt,
        installedAt: finalizedAt,
        installedBy: snapshot.admin.user?.id || 'admin-root'
    });
    await logSystemEvent('INFO', 'INSTALL', 'Installer finalized for this AIMANA instance.', snapshot.admin.user?.id || 'admin-root');
    return record;
};
