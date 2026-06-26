import { dbRun } from '../connection.js';

export const initIntelligenceSchema = async () => {
    // Neural Engine Checkpoints (The Registry)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS custom_engines (
            id TEXT PRIMARY KEY, 
            label TEXT, 
            description TEXT, 
            provider TEXT, 
            category TEXT, 
            upstreamId TEXT, 
            systemInstruction TEXT, 
            isDefault INTEGER DEFAULT 0,
            iconName TEXT,
            efficiencyTier TEXT,
            configJson TEXT,
            uiConfigJson TEXT,
            featuresJson TEXT,
            isProgrammable INTEGER DEFAULT 0,
            requestMethod TEXT DEFAULT 'POST',
            requestUrl TEXT,
            requestHeaders TEXT,
            requestBodyTemplate TEXT,
            responsePath TEXT,
            capabilities TEXT DEFAULT '',
            isSystem INTEGER DEFAULT 0,
            apiKey TEXT,
            limits TEXT,
            isTested INTEGER DEFAULT 0,
            defaultNegativePrompt TEXT,
            verifiedPrompt TEXT,
            verificationNotes TEXT,
            verifiedResult TEXT,
            verifiedMimeType TEXT,
            verifiedParams TEXT,
            isPaid INTEGER DEFAULT 0
        )
    `);

    // Hub-Specific Migrations
    const cols = [
        "capabilities TEXT DEFAULT ''",
        "isSystem INTEGER DEFAULT 0",
        "featuresJson TEXT",
        "apiKey TEXT",
        "limits TEXT",
        "isTested INTEGER DEFAULT 0",
        "defaultNegativePrompt TEXT",
        "verifiedPrompt TEXT",
        "verificationNotes TEXT",
        "verifiedResult TEXT",
        "verifiedMimeType TEXT",
        "verifiedParams TEXT",
        "isPaid INTEGER DEFAULT 0"
    ];

    for (const col of cols) {
        try { await dbRun(`ALTER TABLE custom_engines ADD COLUMN ${col}`); } catch(e) {}
    }
};
