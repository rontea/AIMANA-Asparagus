import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dbGet, dbRun, UPLOADS_DIR } from '../db.js';
import { moveQueueCollectionItemBinariesToProjectRoot, purgeItemPhysicalFiles, purgeProjectPhysicalFiles, purgeRevisionPhysicalFiles, purgeSingleRevisionPhysicalFiles } from '../logic/itemOps.js';

const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const writeUploadFile = (relativePath, content = 'test') => {
    const fullPath = path.join(UPLOADS_DIR, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
};

test('itemOps: purgeRevisionPhysicalFiles deletes main and secondary local files', () => {
    const rootDir = `itemOps-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const mainRelative = `${rootDir}/artifact/main.png`;
    const secondaryRelative = `${rootDir}/artifact/secondary.webp`;
    const mainPath = writeUploadFile(mainRelative, 'main');
    const secondaryPath = writeUploadFile(secondaryRelative, 'secondary');

    purgeRevisionPhysicalFiles({
        fileUrl: `/storage/uploads/${mainRelative}`,
        secondaryFilesJson: JSON.stringify([
            { id: 'secondary-1', url: `/storage/uploads/${secondaryRelative}`, mimeType: 'image/webp' }
        ])
    });

    assert.equal(fs.existsSync(mainPath), false);
    assert.equal(fs.existsSync(secondaryPath), false);
    assert.equal(fs.existsSync(path.join(UPLOADS_DIR, rootDir)), false);
});

test('itemOps: purgeProjectPhysicalFiles removes standard and Neural_Reference directories', async () => {
    const projectId = makeId('project');
    const itemId = makeId('item');
    const revisionId = makeId('revision');
    const projectName = `Purge Project ${Date.now()}`;
    const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    const mainRelative = `${safeName}/main.bin`;
    const sidecarRelative = `${safeName}/sidecars/alt.bin`;

    const mainPath = writeUploadFile(mainRelative, 'main');
    const sidecarPath = writeUploadFile(sidecarRelative, 'sidecar');

    try {
        const now = Date.now();
        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 1, 'all')`,
            [projectId, projectName, now, now]
        );
        await dbRun(
            `INSERT INTO items (
                id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
            ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
            [itemId, projectId, revisionId, now, now]
        );
        await dbRun(
            `INSERT INTO revisions (
                id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                aiParameters, secondaryFilesJson, createdAt, isArchived
            ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, NULL, 'application/octet-stream', 4, 'main.bin',
                'Main', '', '', 'engine', '', '', ?, ?, 1)`,
            [
                revisionId,
                itemId,
                `/storage/uploads/${mainRelative}`,
                JSON.stringify([{ id: 'sidecar-1', url: `/storage/uploads/${sidecarRelative}`, mimeType: 'application/octet-stream' }]),
                now
            ]
        );

        await purgeProjectPhysicalFiles(projectId, projectName);

        assert.equal(fs.existsSync(mainPath), false);
        assert.equal(fs.existsSync(sidecarPath), false);
        assert.equal(fs.existsSync(path.join(UPLOADS_DIR, safeName)), false);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id = ?', [revisionId]);
        await dbRun('DELETE FROM items WHERE id = ?', [itemId]);
        await dbRun('DELETE FROM projects WHERE id = ?', [projectId]);
    }
});

test('itemOps: purgeProjectPhysicalFiles preserves files from another project sharing the same sanitized folder', async () => {
    const projectAId = makeId('project-a');
    const projectBId = makeId('project-b');
    const itemAId = makeId('item-a');
    const itemBId = makeId('item-b');
    const revisionAId = makeId('revision-a');
    const revisionBId = makeId('revision-b');
    const projectAName = 'Alpha/Bravo';
    const projectBName = 'Alpha:Bravo';
    const safeName = 'Alpha_Bravo';
    const mainARelative = `${safeName}/a.bin`;
    const mainBRelative = `${safeName}/b.bin`;

    const mainAPath = writeUploadFile(mainARelative, 'a');
    const mainBPath = writeUploadFile(mainBRelative, 'b');

    try {
        const now = Date.now();
        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 1, 'all')`,
            [projectAId, projectAName, now, now]
        );
        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 0, 'all')`,
            [projectBId, projectBName, now, now]
        );
        await dbRun(
            `INSERT INTO items (
                id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
            ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
            [itemAId, projectAId, revisionAId, now, now]
        );
        await dbRun(
            `INSERT INTO items (
                id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
            ) VALUES (?, ?, ?, 0, 0, ?, ?)`,
            [itemBId, projectBId, revisionBId, now, now]
        );
        await dbRun(
            `INSERT INTO revisions (
                id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                aiParameters, secondaryFilesJson, createdAt, isArchived
            ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, NULL, 'application/octet-stream', 1, 'a.bin',
                'A', '', '', 'engine', '', '', NULL, ?, 1)`,
            [revisionAId, itemAId, `/storage/uploads/${mainARelative}`, now]
        );
        await dbRun(
            `INSERT INTO revisions (
                id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                aiParameters, secondaryFilesJson, createdAt, isArchived
            ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, NULL, 'application/octet-stream', 1, 'b.bin',
                'B', '', '', 'engine', '', '', NULL, ?, 0)`,
            [revisionBId, itemBId, `/storage/uploads/${mainBRelative}`, now]
        );

        await purgeProjectPhysicalFiles(projectAId, projectAName);

        assert.equal(fs.existsSync(mainAPath), false);
        assert.equal(fs.existsSync(mainBPath), true);
        assert.equal(fs.existsSync(path.join(UPLOADS_DIR, safeName)), true);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id IN (?, ?)', [revisionAId, revisionBId]);
        await dbRun('DELETE FROM items WHERE id IN (?, ?)', [itemAId, itemBId]);
        await dbRun('DELETE FROM projects WHERE id IN (?, ?)', [projectAId, projectBId]);
        if (fs.existsSync(path.join(UPLOADS_DIR, safeName))) {
            fs.rmSync(path.join(UPLOADS_DIR, safeName), { recursive: true, force: true });
        }
    }
});

test('itemOps: purgeItemPhysicalFiles preserves files still referenced by another item', async () => {
    const projectId = makeId('project');
    const itemAId = makeId('item-a');
    const itemBId = makeId('item-b');
    const revisionAId = makeId('revision-a');
    const revisionBId = makeId('revision-b');
    const rootDir = `shared-item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sharedRelative = `${rootDir}/shared.png`;
    const sharedUrl = `/storage/uploads/${sharedRelative}`;
    const sharedPath = writeUploadFile(sharedRelative, 'shared');

    try {
        const now = Date.now();
        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 0, 'all')`,
            [projectId, `Shared Item ${now}`, now, now]
        );
        for (const [itemId, revisionId, title] of [
            [itemAId, revisionAId, 'A'],
            [itemBId, revisionBId, 'B']
        ]) {
            await dbRun(
                `INSERT INTO items (
                    id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
                ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
                [itemId, projectId, revisionId, now, now]
            );
            await dbRun(
                `INSERT INTO revisions (
                    id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                    thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                    aiParameters, secondaryFilesJson, createdAt, isArchived
                ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, ?, 'image/png', 6, 'shared.png',
                    ?, '', '', 'engine', '', '', NULL, ?, 1)`,
                [revisionId, itemId, sharedUrl, sharedUrl, title, now]
            );
        }

        await purgeItemPhysicalFiles(itemAId);

        assert.equal(fs.existsSync(sharedPath), true);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id IN (?, ?)', [revisionAId, revisionBId]);
        await dbRun('DELETE FROM items WHERE id IN (?, ?)', [itemAId, itemBId]);
        await dbRun('DELETE FROM projects WHERE id = ?', [projectId]);
        if (fs.existsSync(path.join(UPLOADS_DIR, rootDir))) {
            fs.rmSync(path.join(UPLOADS_DIR, rootDir), { recursive: true, force: true });
        }
    }
});

test('itemOps: purgeProjectPhysicalFiles preserves exact files still referenced by another project', async () => {
    const projectAId = makeId('project-a');
    const projectBId = makeId('project-b');
    const itemAId = makeId('item-a');
    const itemBId = makeId('item-b');
    const revisionAId = makeId('revision-a');
    const revisionBId = makeId('revision-b');
    const rootDir = `shared-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sharedRelative = `${rootDir}/shared.png`;
    const sharedUrl = `/storage/uploads/${sharedRelative}`;
    const sharedPath = writeUploadFile(sharedRelative, 'shared');

    try {
        const now = Date.now();
        for (const [projectId, projectName, itemId, revisionId] of [
            [projectAId, 'Shared Project A', itemAId, revisionAId],
            [projectBId, 'Shared Project B', itemBId, revisionBId]
        ]) {
            await dbRun(
                `INSERT INTO projects (
                    id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
                ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 0, 'all')`,
                [projectId, projectName, now, now]
            );
            await dbRun(
                `INSERT INTO items (
                    id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
                ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
                [itemId, projectId, revisionId, now, now]
            );
            await dbRun(
                `INSERT INTO revisions (
                    id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                    thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                    aiParameters, secondaryFilesJson, createdAt, isArchived
                ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, NULL, 'image/png', 6, 'shared.png',
                    ?, '', '', 'engine', '', '', NULL, ?, 1)`,
                [revisionId, itemId, sharedUrl, projectName, now]
            );
        }

        await purgeProjectPhysicalFiles(projectAId, 'Shared Project A');

        assert.equal(fs.existsSync(sharedPath), true);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id IN (?, ?)', [revisionAId, revisionBId]);
        await dbRun('DELETE FROM items WHERE id IN (?, ?)', [itemAId, itemBId]);
        await dbRun('DELETE FROM projects WHERE id IN (?, ?)', [projectAId, projectBId]);
        if (fs.existsSync(path.join(UPLOADS_DIR, rootDir))) {
            fs.rmSync(path.join(UPLOADS_DIR, rootDir), { recursive: true, force: true });
        }
    }
});

test('itemOps: purgeSingleRevisionPhysicalFiles preserves files still referenced by another revision', async () => {
    const projectId = makeId('project');
    const itemId = makeId('item');
    const revisionAId = makeId('revision-a');
    const revisionBId = makeId('revision-b');
    const rootDir = `shared-revision-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sharedRelative = `${rootDir}/shared.png`;
    const sharedUrl = `/storage/uploads/${sharedRelative}`;
    const sharedPath = writeUploadFile(sharedRelative, 'shared');

    try {
        const now = Date.now();
        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#000000', 0, ?, ?, 'test-owner', 0, 'all')`,
            [projectId, `Shared Revision ${now}`, now, now]
        );
        await dbRun(
            `INSERT INTO items (
                id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
            ) VALUES (?, ?, ?, 0, 0, ?, ?)`,
            [itemId, projectId, revisionBId, now, now]
        );
        for (const [revisionId, versionNumber] of [[revisionAId, 1], [revisionBId, 2]]) {
            await dbRun(
                `INSERT INTO revisions (
                    id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                    thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                    aiParameters, secondaryFilesJson, createdAt, isArchived
                ) VALUES (?, ?, ?, 'local', ?, NULL, NULL, NULL, NULL, 'image/png', 6, 'shared.png',
                    ?, '', '', 'engine', '', '', NULL, ?, 1)`,
                [revisionId, itemId, versionNumber, sharedUrl, `Revision ${versionNumber}`, now]
            );
        }

        await purgeSingleRevisionPhysicalFiles(revisionAId);

        assert.equal(fs.existsSync(sharedPath), true);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id IN (?, ?)', [revisionAId, revisionBId]);
        await dbRun('DELETE FROM items WHERE id = ?', [itemId]);
        await dbRun('DELETE FROM projects WHERE id = ?', [projectId]);
        if (fs.existsSync(path.join(UPLOADS_DIR, rootDir))) {
            fs.rmSync(path.join(UPLOADS_DIR, rootDir), { recursive: true, force: true });
        }
    }
});

test('itemOps: moveQueueCollectionItemBinariesToProjectRoot relocates queue preview files and metadata', async () => {
    const projectId = makeId('project');
    const collectionId = makeId('collection');
    const itemId = makeId('item');
    const revisionId = makeId('revision');
    const projectName = 'Asset Ingestion';
    const collectionName = 'Queue Prompt Collection A';
    const safeProjectName = 'Asset_Ingestion';
    const safeCollectionName = 'Queue_Prompt_Collection_A';
    const sourceRelative = `Prompt_Manager/Queue_Asset_Ingestion/${safeCollectionName}/${itemId}.jpg`;
    const sourceUrl = `/storage/uploads/${sourceRelative}`;
    const sourcePath = writeUploadFile(sourceRelative, 'queue-preview');
    const targetPath = path.join(UPLOADS_DIR, safeProjectName, `${itemId}.jpg`);

    try {
        const now = Date.now();
        const aiParameters = JSON.stringify({
            advanced_params: {
                previewImageUrl: sourceUrl,
                parentItemThumbnail: sourceUrl
            }
        });

        await dbRun(
            `INSERT INTO projects (
                id, name, description, storageType, color, isSystem, systemKey, createdAt, updatedAt, ownerId, isArchived, projectType
            ) VALUES (?, ?, '', 'Local Drive', '#0f766e', 1, 'asset-ingestion', ?, ?, 'test-owner', 0, 'all')`,
            [projectId, projectName, now, now]
        );
        await dbRun(
            `INSERT INTO project_collections (
                id, projectId, name, thumbnailItemId, isPinned, isArchived, createdAt, updatedAt
            ) VALUES (?, ?, ?, NULL, 0, 0, ?, ?)`,
            [collectionId, projectId, collectionName, now, now]
        );
        await dbRun(
            `INSERT INTO items (
                id, projectId, collectionId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
            [itemId, projectId, collectionId, revisionId, now, now]
        );
        await dbRun(
            `INSERT INTO revisions (
                id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                thumbnailLink, mimeType, size, originalFilename, title, label, prompt, engine, note,
                aiParameters, secondaryFilesJson, createdAt, isArchived
            ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, ?, 'image/jpeg', 12, 'preview.jpg',
                'Queued Prompt', '', 'Prompt', 'engine', '', ?, NULL, ?, 0)`,
            [revisionId, itemId, sourceUrl, sourceUrl, aiParameters, now]
        );

        const moved = await moveQueueCollectionItemBinariesToProjectRoot(itemId, 'test-owner');
        assert.equal(moved, true);
        assert.equal(fs.existsSync(sourcePath), false);
        assert.equal(fs.existsSync(targetPath), true);

        const row = await dbGet(
            'SELECT fileUrl, thumbnailLink, aiParameters FROM revisions WHERE id = ?',
            [revisionId]
        );
        const expectedUrl = `/storage/uploads/${safeProjectName}/${itemId}.jpg`;
        assert.equal(row.fileUrl, expectedUrl);
        assert.equal(row.thumbnailLink, expectedUrl);

        const parsedAi = JSON.parse(row.aiParameters);
        assert.equal(parsedAi.advanced_params.previewImageUrl, expectedUrl);
        assert.equal(parsedAi.advanced_params.parentItemThumbnail, expectedUrl);
    } finally {
        await dbRun('DELETE FROM revisions WHERE id = ?', [revisionId]);
        await dbRun('DELETE FROM items WHERE id = ?', [itemId]);
        await dbRun('DELETE FROM project_collections WHERE id = ?', [collectionId]);
        await dbRun('DELETE FROM projects WHERE id = ?', [projectId]);
        if (fs.existsSync(targetPath)) {
            fs.rmSync(path.join(UPLOADS_DIR, safeProjectName), { recursive: true, force: true });
        }
        if (fs.existsSync(path.join(UPLOADS_DIR, 'Prompt_Manager', 'Queue_Asset_Ingestion', safeCollectionName))) {
            fs.rmSync(path.join(UPLOADS_DIR, 'Prompt_Manager', 'Queue_Asset_Ingestion', safeCollectionName), { recursive: true, force: true });
        }
    }
});
