import { dbAll, dbGet, dbRun } from '../db/connection.js';

const parseSecondaryRefs = (secondaryFilesJson) => {
    if (!secondaryFilesJson) return [];
    try {
        const files = JSON.parse(secondaryFilesJson);
        if (!Array.isArray(files)) return [];
        return files
            .map((f) => (f && typeof f.id === 'string' ? f.id : ''))
            .filter(Boolean);
    } catch {
        return [];
    }
};

const parseNeuralRefs = (aiParameters) => {
    if (!aiParameters) return [];
    try {
        const parsed = JSON.parse(aiParameters);
        const adv = parsed?.advanced_params || parsed || {};
        const list = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds : [];
        return list.filter(Boolean);
    } catch {
        return [];
    }
};

const parseReferenceImageRefs = (aiParameters) => {
    if (!aiParameters) return [];
    try {
        const parsed = JSON.parse(aiParameters);
        const adv = parsed?.advanced_params || parsed || {};
        const single = typeof adv.referenceItemId === 'string' ? [adv.referenceItemId] : [];
        const audioSingle = typeof adv.referenceAudioItemId === 'string' ? [adv.referenceAudioItemId] : [];
        const many = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds : [];
        const audioMany = Array.isArray(adv.referenceAudioItemIds) ? adv.referenceAudioItemIds : [];
        return Array.from(new Set([...single, ...audioSingle, ...many, ...audioMany].filter(Boolean)));
    } catch {
        return [];
    }
};

const collectReferenceRows = ({ sourceItemId, sourceProjectId, updatedAt, aiParameters, secondaryFilesJson }) => {
    const map = new Map();

    parseSecondaryRefs(secondaryFilesJson).forEach((targetItemId) => {
        if (targetItemId === sourceItemId) return;
        if (!map.has(targetItemId)) map.set(targetItemId, new Set());
        map.get(targetItemId).add('linked');
    });

    parseNeuralRefs(aiParameters).forEach((targetItemId) => {
        if (targetItemId === sourceItemId) return;
        if (!map.has(targetItemId)) map.set(targetItemId, new Set());
        map.get(targetItemId).add('neural');
    });

    parseReferenceImageRefs(aiParameters).forEach((targetItemId) => {
        if (targetItemId === sourceItemId) return;
        if (!map.has(targetItemId)) map.set(targetItemId, new Set());
        map.get(targetItemId).add('reference_image');
    });

    const rows = [];
    map.forEach((kinds, targetItemId) => {
        kinds.forEach((relationKind) => {
            rows.push({
                sourceItemId,
                targetItemId,
                relationKind,
                sourceProjectId: sourceProjectId || null,
                updatedAt: updatedAt || Date.now()
            });
        });
    });
    return rows;
};

export const refreshItemReferenceIndex = async (itemId) => {
    if (!itemId) return;
    await dbRun('DELETE FROM item_references WHERE sourceItemId = ?', [itemId]);

    const row = await dbGet(
        `
        SELECT i.id as sourceItemId, i.projectId as sourceProjectId, i.updatedAt as updatedAt,
               r.aiParameters as aiParameters, r.secondaryFilesJson as secondaryFilesJson
        FROM items i
        LEFT JOIN revisions r ON i.currentRevisionId = r.id
        WHERE i.id = ?
        `,
        [itemId]
    );

    if (!row) return;
    const refs = collectReferenceRows(row);
    for (const ref of refs) {
        await dbRun(
            `INSERT OR IGNORE INTO item_references
             (sourceItemId, targetItemId, relationKind, sourceProjectId, updatedAt)
             VALUES (?, ?, ?, ?, ?)`,
            [ref.sourceItemId, ref.targetItemId, ref.relationKind, ref.sourceProjectId, ref.updatedAt]
        );
    }
};

export const rebuildItemReferenceIndex = async () => {
    const rows = await dbAll(
        `
        SELECT i.id as sourceItemId, i.projectId as sourceProjectId, i.updatedAt as updatedAt,
               r.aiParameters as aiParameters, r.secondaryFilesJson as secondaryFilesJson
        FROM items i
        LEFT JOIN revisions r ON i.currentRevisionId = r.id
        `
    );

    await dbRun('BEGIN TRANSACTION');
    try {
        await dbRun('DELETE FROM item_references');
        for (const row of rows) {
            const refs = collectReferenceRows(row);
            for (const ref of refs) {
                await dbRun(
                    `INSERT OR IGNORE INTO item_references
                     (sourceItemId, targetItemId, relationKind, sourceProjectId, updatedAt)
                     VALUES (?, ?, ?, ?, ?)`,
                    [ref.sourceItemId, ref.targetItemId, ref.relationKind, ref.sourceProjectId, ref.updatedAt]
                );
            }
        }
        await dbRun('COMMIT');
    } catch (e) {
        await dbRun('ROLLBACK');
        throw e;
    }
};
