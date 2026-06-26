import { seedCustomEngines, seedInitialUser, seedDefaultIntents } from './seed.js';
import { ensureRootSystemArchiveProject } from './systemProjects.js';

// Modular Schema Imports
import { initAuthSchema } from './schema/auth.js';
import { initWorkspaceSchema } from './schema/workspace.js';
import { initAssetSchema } from './schema/assets.js';
import { initChatMemorySchema } from './schema/chat-memory.js';
import { initChatItemSchema } from './schema/chat-items.js';
import { initIntelligenceSchema } from './schema/intelligence.js';
import { initSystemSchema } from './schema/system.js';
import { initBulkSchema } from './schema/bulk.js';
import { initExtensionSchema } from './schema/extensions.js';
import { initRagSchema } from './schema/rag.js';
import { runInstalledExtensionMigrations } from '../extensions/migrations.js';
import { cleanupDatabaseIntegrityIssues, collectDatabaseIntegrityDiagnostics } from './maintenance.js';

export const initDB = async () => {
    try {
        console.log("[DB_BOOT] Initializing modular neural schema...");

        // 1. Core Framework (Order matters for Foreign Keys)
        await initAuthSchema();
        await initWorkspaceSchema();
        await initAssetSchema();
        await initChatMemorySchema();
        await initChatItemSchema();
        await initIntelligenceSchema();
        await initSystemSchema();
        await initBulkSchema();
        await initExtensionSchema();
        await initRagSchema();
        
        console.log("[DB_BOOT] Data structures ready.");
        const appliedExtensionMigrations = await runInstalledExtensionMigrations();
        console.log(`[DB_BOOT] Extension migrations ready (${appliedExtensionMigrations.length} applied).`);

        // 2. Core Data Provisioning
        await seedCustomEngines();
        await seedInitialUser();
        await seedDefaultIntents();
        
        // 3. System Resilience (Ensure Root Archive exists once the installer has created admin-root)
        await ensureRootSystemArchiveProject();

        const cleanupSummary = await cleanupDatabaseIntegrityIssues();
        const integrityDiagnostics = await collectDatabaseIntegrityDiagnostics();
        console.log(
            `[DB_BOOT] Integrity cleanup complete (deleted ${cleanupSummary.totalDeleted}, updated ${cleanupSummary.totalUpdated}, foreign_keys=${integrityDiagnostics.foreignKeysEnabled ? 'ON' : 'OFF'}).`
        );

        console.log("[DB_BOOT] Neural persistence layer optimized.");

    } catch (err) { 
        console.error("[DB_BOOT] Critical Infrastructure Failure:", err); 
        throw err;
    }
};
