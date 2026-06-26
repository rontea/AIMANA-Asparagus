import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { dbAll, dbGet, dbRun, withTransaction } from '../db.js';
import { canAccessProject } from '../utils/access.js';
import { createPollinationsEmbeddings } from './pollinationsTextService.js';

const INDEX_VERSION = 'rag-v1';
const DEFAULT_CHUNK_MAX_CHARS = 3200;
const DEFAULT_BATCH_SIZE = 16;
const DEFAULT_TOP_K = 8;
const QUERY_EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_EMBEDDING_CACHE_MAX = 100;
const PARSED_EMBEDDING_CACHE_MAX = 5000;
const LOCAL_EMBEDDING_MODEL = 'aimana-local-hash-v1';
const LOCAL_EMBEDDING_DIMENSIONS = 384;

const SOURCE_TYPES = new Set(['project-items', 'projects', 'prompts', 'manifests']);

let embeddingsClient = createPollinationsEmbeddings;
const embeddingsClientContext = new AsyncLocalStorage();
const queryEmbeddingCache = new Map();
const parsedEmbeddingCache = new Map();
let localEmbeddingFallbackUntil = 0;

const getEmbeddingsClient = () => embeddingsClientContext.getStore() || embeddingsClient;

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const allowLocalEmbeddingFallback = () => {
    const raw = String(process.env.RAG_LOCAL_EMBEDDING_FALLBACK || 'true').trim().toLowerCase();
    return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
};

const shouldUseLocalEmbeddingFallback = (error) => {
    if (!allowLocalEmbeddingFallback()) return false;
    const message = String(error?.message || '').toLowerCase();
    return (
        message.includes('insufficient balance') ||
        message.includes('available balance') ||
        message.includes('pollinations_key') ||
        message.includes('pollinations_api_key')
    );
};

const hashToken = (value = '') => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const tokenizeForLocalEmbedding = (value = '') => {
    const text = normalizeWhitespace(value).toLowerCase();
    const words = text.match(/[a-z0-9_'-]{2,}/g) || [];
    const shingles = [];
    for (let index = 0; index < words.length - 1; index += 1) {
        shingles.push(`${words[index]} ${words[index + 1]}`);
    }
    return [...words, ...shingles];
};

const createLocalEmbedding = (value = '') => {
    const vector = new Array(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
    const tokens = tokenizeForLocalEmbedding(value);
    if (tokens.length === 0) return vector;

    for (const token of tokens) {
        const hash = hashToken(token);
        const index = hash % LOCAL_EMBEDDING_DIMENSIONS;
        const sign = (hash & 1) === 0 ? 1 : -1;
        vector[index] += sign;
    }

    const norm = Math.sqrt(vector.reduce((sum, valueAtIndex) => sum + (valueAtIndex * valueAtIndex), 0));
    if (!norm) return vector;
    return vector.map((valueAtIndex) => Number((valueAtIndex / norm).toFixed(8)));
};

const createLocalEmbeddings = (input = []) => {
    const values = Array.isArray(input) ? input : [input];
    return values.map((value) => ({
        embedding: createLocalEmbedding(value),
        model: LOCAL_EMBEDDING_MODEL
    }));
};

const createEmbeddingsWithFallback = async (request) => {
    if (allowLocalEmbeddingFallback() && Date.now() < localEmbeddingFallbackUntil) {
        return createLocalEmbeddings(request?.input || []);
    }
    try {
        return await getEmbeddingsClient()(request);
    } catch (error) {
        if (!shouldUseLocalEmbeddingFallback(error)) throw error;
        localEmbeddingFallbackUntil = Date.now() + (5 * 60 * 1000);
        console.warn(`[RAG_INDEX] Falling back to local embeddings: ${error.message}`);
        return createLocalEmbeddings(request?.input || []);
    }
};

const isAdminUser = (user) => user?.role === 'admin' || user?.id === 'admin-root';

const sha256 = (value = '') => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const safeJsonParse = (value, fallback = {}) => {
    if (!value || typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
};

const stringifyMetadata = (metadata = {}) => JSON.stringify(metadata);

const hasMeaningfulText = (value) => normalizeWhitespace(value).length > 0;

const parseProjectMembers = (value = '') => String(value || '')
    .split(/[|,]/)
    .map((entry) => {
        const [userId, role] = entry.split(':');
        return {
            userId: normalizeWhitespace(userId),
            role: normalizeWhitespace(role || 'member')
        };
    })
    .filter((entry) => entry.userId);

const buildAccessPolicy = (row, visibility = 'project') => {
    const members = parseProjectMembers(row.memberAccess);
    const ownerId = normalizeWhitespace(row.ownerId);
    const projectId = normalizeWhitespace(row.projectId || row.id);
    const projectSystemKey = normalizeWhitespace(row.projectSystemKey || row.systemKey);
    const isSystem = Number(row.isSystem || row.projectIsSystem || 0) === 1;
    const memberIds = members.map((member) => member.userId);
    const roles = Array.from(new Set([
        ownerId ? 'owner' : '',
        ...members.map((member) => member.role || 'member'),
        'admin'
    ].filter(Boolean)));

    return {
        visibility,
        ownerId,
        projectId,
        isSystem,
        systemKey: projectSystemKey,
        allowedUserIds: Array.from(new Set([ownerId, ...memberIds].filter(Boolean))),
        memberRoles: members,
        allowedRoles: roles,
        public: false
    };
};

const buildRoute = ({ projectId, itemId, sourceType, collectionId }) => {
    if (sourceType === 'prompts') {
        if (collectionId) return `/prompt-manager?tab=ready&collectionId=${encodeURIComponent(collectionId)}`;
        return '/prompt-manager';
    }
    if (projectId && itemId) return `/project/${projectId}?itemId=${encodeURIComponent(itemId)}`;
    if (projectId) return `/project/${projectId}`;
    return '';
};

const pickRevisionMetadata = (row) => {
    const parsed = safeJsonParse(row.aiParameters, {});
    const advanced = parsed.advanced_params && typeof parsed.advanced_params === 'object'
        ? parsed.advanced_params
        : {};
    return {
        engine: row.engine || '',
        tags: row.tags || '',
        label: row.label || '',
        mimeType: row.mimeType || '',
        variables: advanced.variables || parsed.variables || null,
        intent: advanced.intent || parsed.intent || row.projectType || '',
        negativePrompt: advanced.negative_prompt || advanced.negativePrompt || parsed.negative_prompt || ''
    };
};

const classifyItemSourceType = (row) => {
    const projectType = String(row.projectType || '').toLowerCase();
    if (projectType === 'prompt' || row.projectSystemKey === 'asset-ingestion') return 'prompts';
    if (row.projectSystemKey === 'neural-saved') return 'manifests';
    return 'project-items';
};

const buildItemDocument = (row) => {
    const sourceType = classifyItemSourceType(row);
    const revisionMeta = pickRevisionMetadata(row);
    const title = normalizeWhitespace(row.revisionTitle || row.originalFilename || row.itemId || 'Untitled item');
    const collectionName = normalizeWhitespace(row.collectionName);
    const projectName = normalizeWhitespace(row.projectName);
    const parts = [
        `Source type: ${sourceType}`,
        `Title: ${title}`,
        projectName ? `Project: ${projectName}` : '',
        collectionName ? `Collection: ${collectionName}` : '',
        row.projectDescription ? `Project description: ${normalizeWhitespace(row.projectDescription)}` : '',
        row.label ? `Label: ${normalizeWhitespace(row.label)}` : '',
        row.tags ? `Tags: ${normalizeWhitespace(row.tags)}` : '',
        row.prompt ? `Prompt: ${normalizeWhitespace(row.prompt)}` : '',
        row.note ? `Notes: ${normalizeWhitespace(row.note)}` : '',
        revisionMeta.negativePrompt ? `Negative prompt/constraints: ${normalizeWhitespace(revisionMeta.negativePrompt)}` : '',
        row.engine ? `Engine: ${normalizeWhitespace(row.engine)}` : '',
        row.aiParameters ? `Generation metadata: ${normalizeWhitespace(row.aiParameters).slice(0, 1200)}` : ''
    ].filter(Boolean);

    const chunkText = parts.join('\n');
    if (!hasMeaningfulText(chunkText)) return null;

    return {
        sourceType,
        sourceId: row.itemId,
        sourceRoute: buildRoute({
            sourceType,
            projectId: row.projectId,
            itemId: row.itemId,
            collectionId: row.collectionId
        }),
        title,
        chunkText,
        visibility: 'project',
        ownerId: row.ownerId || '',
        projectId: row.projectId || '',
        itemId: row.itemId || '',
        collectionId: row.collectionId || '',
        revisionId: row.revisionId || '',
        accessPolicy: buildAccessPolicy(row, 'project'),
        sourceUpdatedAt: Number(row.itemUpdatedAt || row.revisionCreatedAt || 0),
        metadata: {
            projectName,
            projectType: row.projectType || '',
            projectSystemKey: row.projectSystemKey || '',
            collectionName,
            ...revisionMeta
        }
    };
};

const buildProjectDocument = (row) => {
    const title = normalizeWhitespace(row.name || 'Untitled project');
    const parts = [
        'Source type: project',
        `Project: ${title}`,
        row.description ? `Description: ${normalizeWhitespace(row.description)}` : '',
        row.projectType ? `Project type: ${normalizeWhitespace(row.projectType)}` : '',
        row.defaultEngine ? `Default engine: ${normalizeWhitespace(row.defaultEngine)}` : ''
    ].filter(Boolean);
    const chunkText = parts.join('\n');
    if (!hasMeaningfulText(chunkText)) return null;

    return {
        sourceType: 'projects',
        sourceId: row.id,
        sourceRoute: buildRoute({ projectId: row.id }),
        title,
        chunkText,
        visibility: 'project',
        ownerId: row.ownerId || '',
        projectId: row.id || '',
        itemId: '',
        collectionId: '',
        revisionId: '',
        accessPolicy: buildAccessPolicy(row, 'project'),
        sourceUpdatedAt: Number(row.updatedAt || row.createdAt || 0),
        metadata: {
            projectType: row.projectType || '',
            systemKey: row.systemKey || '',
            itemCount: Number(row.itemCount || 0),
            collectionCount: Number(row.collectionCount || 0)
        }
    };
};

const chunkDocument = (doc, maxChars = DEFAULT_CHUNK_MAX_CHARS) => {
    const text = String(doc.chunkText || '').trim();
    if (text.length <= maxChars) return [{ ...doc, chunkText: text }];

    const chunks = [];
    const paragraphs = text.split(/\n{2,}|\n(?=[A-Z][A-Za-z ]+:)/g).map((part) => part.trim()).filter(Boolean);
    let current = '';
    for (const paragraph of paragraphs) {
        const next = current ? `${current}\n${paragraph}` : paragraph;
        if (next.length <= maxChars) {
            current = next;
            continue;
        }
        if (current) chunks.push({ ...doc, chunkText: current });
        if (paragraph.length <= maxChars) {
            current = paragraph;
        } else {
            for (let start = 0; start < paragraph.length; start += maxChars) {
                chunks.push({ ...doc, chunkText: paragraph.slice(start, start + maxChars) });
            }
            current = '';
        }
    }
    if (current) chunks.push({ ...doc, chunkText: current });
    return chunks;
};

export const collectRagSourceDocuments = async ({ sources = ['project-items', 'projects', 'prompts', 'manifests'] } = {}) => {
    const sourceSet = new Set((Array.isArray(sources) ? sources : [sources]).filter((source) => SOURCE_TYPES.has(source)));
    const docs = [];

    if (sourceSet.has('projects')) {
        const rows = await dbAll(`
            SELECT
                p.*,
                COUNT(DISTINCT i.id) AS itemCount,
                COUNT(DISTINCT c.id) AS collectionCount,
                GROUP_CONCAT(DISTINCT pm.userId || ':' || COALESCE(pm.role, 'member')) AS memberAccess
            FROM projects p
            LEFT JOIN items i ON i.projectId = p.id AND i.isArchived = 0
            LEFT JOIN project_collections c ON c.projectId = p.id AND COALESCE(c.isArchived, 0) = 0
            LEFT JOIN project_members pm ON pm.projectId = p.id
            WHERE COALESCE(p.isArchived, 0) = 0
            GROUP BY p.id
        `);
        rows.map(buildProjectDocument).filter(Boolean).forEach((doc) => docs.push(doc));
    }

    if (sourceSet.has('project-items') || sourceSet.has('prompts') || sourceSet.has('manifests')) {
        const rows = await dbAll(`
            SELECT
                i.id AS itemId,
                i.projectId,
                i.collectionId,
                i.updatedAt AS itemUpdatedAt,
                p.name AS projectName,
                p.description AS projectDescription,
                p.projectType,
                p.systemKey AS projectSystemKey,
                p.isSystem AS projectIsSystem,
                p.ownerId,
                GROUP_CONCAT(DISTINCT pm.userId || ':' || COALESCE(pm.role, 'member')) AS memberAccess,
                c.name AS collectionName,
                r.id AS revisionId,
                r.title AS revisionTitle,
                r.label,
                r.tags,
                r.prompt,
                r.engine,
                r.note,
                r.aiParameters,
                r.mimeType,
                r.originalFilename,
                r.createdAt AS revisionCreatedAt
            FROM items i
            JOIN projects p ON p.id = i.projectId
            LEFT JOIN project_members pm ON pm.projectId = p.id
            LEFT JOIN project_collections c ON c.id = i.collectionId
            LEFT JOIN revisions r ON r.id = i.currentRevisionId
            WHERE COALESCE(i.isArchived, 0) = 0
              AND COALESCE(p.isArchived, 0) = 0
              AND r.id IS NOT NULL
            GROUP BY i.id
        `);
        rows
            .map(buildItemDocument)
            .filter(Boolean)
            .filter((doc) => sourceSet.has(doc.sourceType))
            .forEach((doc) => docs.push(doc));
    }

    return docs;
};

const upsertChunk = async (chunk, embeddingResult) => {
    const now = Date.now();
    const embedding = Array.isArray(embeddingResult?.embedding) ? embeddingResult.embedding : [];
    if (embedding.length === 0) throw new Error(`Embedding failed for ${chunk.sourceType}:${chunk.sourceId}`);
    const contentHash = sha256([
        chunk.sourceType,
        chunk.sourceId,
        chunk.title,
        chunk.chunkText,
        JSON.stringify(chunk.metadata || {})
    ].join('\n'));
    const id = `${chunk.sourceType}:${chunk.sourceId}:${contentHash.slice(0, 16)}`;

    await dbRun(`
        INSERT INTO rag_chunks (
            id, sourceType, sourceId, sourceRoute, title, chunkText, contentHash, metadataJson,
            visibility, ownerId, projectId, itemId, collectionId, revisionId,
            accessPolicyJson, allowedRolesJson,
            embeddingModel, embeddingDimensions, embeddingJson, indexVersion, indexedAt,
            sourceUpdatedAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            sourceRoute = excluded.sourceRoute,
            title = excluded.title,
            chunkText = excluded.chunkText,
            metadataJson = excluded.metadataJson,
            visibility = excluded.visibility,
            ownerId = excluded.ownerId,
            projectId = excluded.projectId,
            itemId = excluded.itemId,
            collectionId = excluded.collectionId,
            revisionId = excluded.revisionId,
            accessPolicyJson = excluded.accessPolicyJson,
            allowedRolesJson = excluded.allowedRolesJson,
            embeddingModel = excluded.embeddingModel,
            embeddingDimensions = excluded.embeddingDimensions,
            embeddingJson = excluded.embeddingJson,
            indexVersion = excluded.indexVersion,
            indexedAt = excluded.indexedAt,
            sourceUpdatedAt = excluded.sourceUpdatedAt,
            updatedAt = excluded.updatedAt
    `, [
        id,
        chunk.sourceType,
        chunk.sourceId,
        chunk.sourceRoute || '',
        chunk.title || '',
        chunk.chunkText,
        contentHash,
        stringifyMetadata(chunk.metadata || {}),
        chunk.visibility || 'project',
        chunk.ownerId || '',
        chunk.projectId || '',
        chunk.itemId || '',
        chunk.collectionId || '',
        chunk.revisionId || '',
        JSON.stringify(chunk.accessPolicy || buildAccessPolicy(chunk, chunk.visibility || 'project')),
        JSON.stringify(chunk.accessPolicy?.allowedRoles || ['admin']),
        embeddingResult?.model || process.env.RAG_EMBEDDING_MODEL || 'openai-3-small',
        embedding.length,
        JSON.stringify(embedding),
        INDEX_VERSION,
        now,
        Number(chunk.sourceUpdatedAt || 0),
        now
    ]);
    return id;
};

export const indexRagSources = async ({ sources, batchSize = DEFAULT_BATCH_SIZE, useLocalEmbeddings = false } = {}) => {
    const selectedSources = new Set((Array.isArray(sources) ? sources : (sources ? [sources] : ['project-items', 'projects', 'prompts', 'manifests']))
        .filter((source) => SOURCE_TYPES.has(source)));
    const docs = await collectRagSourceDocuments({ sources });
    const chunks = docs.flatMap((doc) => chunkDocument(doc));
    const seenSourceKeys = new Set(chunks.map((chunk) => `${chunk.sourceType}:${chunk.sourceId}`));
    const counts = {
        recordsScanned: docs.length,
        chunksCreated: chunks.length,
        chunksUpdated: 0,
        chunksDeleted: 0,
        failures: 0
    };

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        try {
            const input = batch.map((chunk) => chunk.chunkText);
            const embeddings = useLocalEmbeddings
                ? createLocalEmbeddings(input)
                : await createEmbeddingsWithFallback({ input });
            await withTransaction(async () => {
                for (let j = 0; j < batch.length; j += 1) {
                    await upsertChunk(batch[j], embeddings[j]);
                    counts.chunksUpdated += 1;
                }
            });
        } catch (error) {
            counts.failures += batch.length;
            throw error;
        }
    }

    for (const sourceKey of seenSourceKeys) {
        const [sourceType, ...idParts] = sourceKey.split(':');
        const sourceId = idParts.join(':');
        const activeHashes = chunks
            .filter((chunk) => chunk.sourceType === sourceType && chunk.sourceId === sourceId)
            .map((chunk) => sha256([
                chunk.sourceType,
                chunk.sourceId,
                chunk.title,
                chunk.chunkText,
                JSON.stringify(chunk.metadata || {})
            ].join('\n')));
        if (activeHashes.length === 0) continue;
        const placeholders = activeHashes.map(() => '?').join(',');
        const result = await dbRun(
            `DELETE FROM rag_chunks WHERE sourceType = ? AND sourceId = ? AND contentHash NOT IN (${placeholders})`,
            [sourceType, sourceId, ...activeHashes]
        );
        counts.chunksDeleted += Number(result?.changes || 0);
    }

    for (const sourceType of selectedSources) {
        const activeIds = Array.from(new Set(docs
            .filter((doc) => doc.sourceType === sourceType)
            .map((doc) => doc.sourceId)
            .filter(Boolean)));
        if (activeIds.length === 0) {
            const result = await dbRun('DELETE FROM rag_chunks WHERE sourceType = ?', [sourceType]);
            counts.chunksDeleted += Number(result?.changes || 0);
            continue;
        }
        const placeholders = activeIds.map(() => '?').join(',');
        const result = await dbRun(
            `DELETE FROM rag_chunks WHERE sourceType = ? AND sourceId NOT IN (${placeholders})`,
            [sourceType, ...activeIds]
        );
        counts.chunksDeleted += Number(result?.changes || 0);
    }

    return counts;
};

const parseEmbedding = (value) => {
    if (typeof value === 'string') {
        const cached = parsedEmbeddingCache.get(value);
        if (cached) return cached;
    }
    const parsed = safeJsonParse(value, null);
    const vector = Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
    if (typeof value === 'string' && vector.length > 0) {
        parsedEmbeddingCache.set(value, vector);
        if (parsedEmbeddingCache.size > PARSED_EMBEDDING_CACHE_MAX) {
            parsedEmbeddingCache.delete(parsedEmbeddingCache.keys().next().value);
        }
    }
    return vector;
};

const getCachedQueryEmbedding = async (cleanQuery) => {
    const client = getEmbeddingsClient();
    const now = Date.now();
    const cacheKey = [
        String(process.env.RAG_EMBEDDING_MODEL || 'openai-3-small'),
        cleanQuery
    ].join(':');
    const cached = queryEmbeddingCache.get(cacheKey);
    if (cached && now - cached.createdAt < QUERY_EMBEDDING_CACHE_TTL_MS) {
        queryEmbeddingCache.delete(cacheKey);
        queryEmbeddingCache.set(cacheKey, cached);
        return cached.embedding;
    }

    let queryEmbedding;
    try {
        if (allowLocalEmbeddingFallback() && Date.now() < localEmbeddingFallbackUntil) {
            [queryEmbedding] = createLocalEmbeddings([cleanQuery]);
        } else {
            [queryEmbedding] = await client({ input: [cleanQuery] });
        }
    } catch (error) {
        if (!shouldUseLocalEmbeddingFallback(error)) throw error;
        localEmbeddingFallbackUntil = Date.now() + (5 * 60 * 1000);
        console.warn(`[RAG_QUERY] Falling back to local embeddings: ${error.message}`);
        [queryEmbedding] = createLocalEmbeddings([cleanQuery]);
    }
    const embedding = queryEmbedding?.embedding || [];
    if (embedding.length > 0) {
        queryEmbeddingCache.set(cacheKey, { embedding, createdAt: now });
        if (queryEmbeddingCache.size > QUERY_EMBEDDING_CACHE_MAX) {
            queryEmbeddingCache.delete(queryEmbeddingCache.keys().next().value);
        }
    }
    return embedding;
};

const getQueryVectorsForRows = async (cleanQuery, rows = []) => {
    const vectors = [];
    const primaryEmbedding = await getCachedQueryEmbedding(cleanQuery);
    if (primaryEmbedding.length > 0) {
        vectors.push({
            model: String(process.env.RAG_EMBEDDING_MODEL || 'openai-3-small'),
            dimensions: primaryEmbedding.length,
            embedding: primaryEmbedding
        });
    }

    const hasLocalRows = rows.some((row) => (
        row.embeddingModel === LOCAL_EMBEDDING_MODEL
        || Number(row.embeddingDimensions || 0) === LOCAL_EMBEDDING_DIMENSIONS
    ));
    const alreadyHasLocalVector = vectors.some((vector) => vector.dimensions === LOCAL_EMBEDDING_DIMENSIONS);
    if (hasLocalRows && !alreadyHasLocalVector) {
        const [localEmbedding] = createLocalEmbeddings([cleanQuery]);
        if (localEmbedding?.embedding?.length > 0) {
            vectors.push({
                model: LOCAL_EMBEDDING_MODEL,
                dimensions: localEmbedding.embedding.length,
                embedding: localEmbedding.embedding
            });
        }
    }

    return vectors;
};

const canAccessRagRow = async (row, user) => {
    if (!user) return false;
    if (isAdminUser(user)) return true;

    const policy = safeJsonParse(row.accessPolicyJson, {});
    if (policy.public === true || row.visibility === 'public') return false;
    if (row.visibility === 'admin') return false;

    const allowedUserIds = Array.isArray(policy.allowedUserIds) ? policy.allowedUserIds.map(String) : [];
    if (allowedUserIds.includes(String(user.id))) return true;
    if (row.ownerId && String(row.ownerId) === String(user.id)) return true;
    if (row.projectId) return canAccessProject(row.projectId, user);
    return false;
};

export const cosineSimilarity = (a = [], b = []) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        const av = Number(a[i]) || 0;
        const bv = Number(b[i]) || 0;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const rowToSource = (row, score) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceRoute: row.sourceRoute || '',
    title: row.title || '',
    snippet: normalizeWhitespace(row.chunkText).slice(0, 360),
    score,
    metadata: safeJsonParse(row.metadataJson, {})
});

export const retrieveRagContext = async ({
    query,
    user,
    topK = Number(process.env.RAG_TOP_K || DEFAULT_TOP_K),
    filters = {}
} = {}) => {
    const cleanQuery = normalizeWhitespace(query);
    if (!cleanQuery) return { matches: [], sources: [] };

    const clauses = ['embeddingJson IS NOT NULL', "TRIM(embeddingJson) <> ''"];
    const params = [];
    if (filters.projectId) {
        clauses.push('projectId = ?');
        params.push(filters.projectId);
    }
    if (filters.sourceType && SOURCE_TYPES.has(filters.sourceType)) {
        clauses.push('sourceType = ?');
        params.push(filters.sourceType);
    }

    const rows = await dbAll(`
        SELECT *
        FROM rag_chunks
        WHERE ${clauses.join(' AND ')}
        ORDER BY indexedAt DESC
        LIMIT 1000
    `, params);

    if (rows.length === 0) return { matches: [], sources: [] };

    const queryVectors = await getQueryVectorsForRows(cleanQuery, rows);
    if (queryVectors.length === 0) return { matches: [], sources: [] };

    const scored = [];
    for (const row of rows) {
        const allowed = await canAccessRagRow(row, user);
        if (!allowed) continue;
        const embedding = parseEmbedding(row.embeddingJson);
        const matchingQueryVectors = queryVectors.filter((queryVector) => queryVector.dimensions === embedding.length);
        if (matchingQueryVectors.length === 0) continue;
        const vectorScore = Math.max(...matchingQueryVectors.map((queryVector) => cosineSimilarity(queryVector.embedding, embedding)));
        const text = `${row.title || ''} ${row.chunkText || ''}`.toLowerCase();
        const keywordBoost = cleanQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length > 2 && text.includes(word))
            .length * 0.015;
        const score = vectorScore + keywordBoost;
        scored.push({ row, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const resolvedTopK = Math.min(20, Math.max(1, Number(topK) || DEFAULT_TOP_K));
    const matches = scored.slice(0, resolvedTopK);
    return {
        matches: matches.map(({ row, score }) => ({
            chunk: row,
            score
        })),
        sources: matches.map(({ row, score }) => rowToSource(row, score))
    };
};

export const getRagIndexStatus = async () => {
    const summary = await dbGet(`
        SELECT
            COUNT(*) AS totalChunks,
            COUNT(DISTINCT sourceType || ':' || sourceId) AS totalSources,
            MAX(indexedAt) AS lastIndexedAt
        FROM rag_chunks
    `);
    const byType = await dbAll(`
        SELECT sourceType, COUNT(*) AS chunks, COUNT(DISTINCT sourceId) AS sources
        FROM rag_chunks
        GROUP BY sourceType
        ORDER BY sourceType ASC
    `);
    return {
        totalChunks: Number(summary?.totalChunks || 0),
        totalSources: Number(summary?.totalSources || 0),
        lastIndexedAt: Number(summary?.lastIndexedAt || 0),
        byType: byType.map((row) => ({
            sourceType: row.sourceType,
            chunks: Number(row.chunks || 0),
            sources: Number(row.sources || 0)
        }))
    };
};

export const __ragIndexTestUtils = {
    buildAccessPolicy,
    buildItemDocument,
    buildProjectDocument,
    canAccessRagRow,
    chunkDocument,
    createLocalEmbedding,
    createLocalEmbeddings,
    parseProjectMembers,
    rowToSource,
    safeJsonParse,
    resetEmbeddingsClient: () => {
        embeddingsClient = createPollinationsEmbeddings;
        queryEmbeddingCache.clear();
        localEmbeddingFallbackUntil = 0;
    },
    runWithEmbeddingsClient: (client, callback) => (
        embeddingsClientContext.run(
            typeof client === 'function' ? client : createPollinationsEmbeddings,
            callback
        )
    ),
    setEmbeddingsClient: (client) => {
        embeddingsClient = typeof client === 'function' ? client : createPollinationsEmbeddings;
        queryEmbeddingCache.clear();
        localEmbeddingFallbackUntil = 0;
    }
};
