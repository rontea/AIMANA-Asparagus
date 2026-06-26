import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun, UPLOADS_DIR } from '../db.js';
import { normalizeWebSlashes, sanitizeDirName } from '../utils/paths.js';

const router = express.Router();

const parseDataUri = (dataUri = '') => {
    const matches = String(dataUri).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
    if (!matches) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (!buffer.length) return null;
    return { mimeType, buffer };
};

const extFromMime = (mimeType = '', format = '') => {
    const normalizedMime = String(mimeType || '').toLowerCase();
    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedMime === 'image/png') return '.png';
    if (normalizedMime === 'image/jpeg') return '.jpg';
    if (normalizedMime === 'image/webp') return '.webp';
    if (normalizedMime === 'image/gif') return '.gif';
    if (normalizedMime === 'image/svg+xml') return '.svg';
    if (normalizedMime === 'audio/mpeg' || normalizedFormat === 'mp3') return '.mp3';
    if (normalizedMime === 'audio/mp4' || normalizedFormat === 'm4a') return '.m4a';
    if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/x-wav' || normalizedFormat === 'wav') return '.wav';
    if (normalizedMime === 'audio/webm' || normalizedFormat === 'webm') return '.webm';
    if (normalizedMime === 'audio/flac' || normalizedFormat === 'flac') return '.flac';
    if (normalizedMime === 'audio/ogg' || normalizedFormat === 'ogg') return '.ogg';
    if (normalizedMime === 'audio/ogg; codecs=opus' || normalizedFormat === 'opus') return '.opus';
    if (normalizedMime === 'audio/aac' || normalizedFormat === 'aac') return '.aac';
    return '.bin';
};

const normalizeAudioFormat = (mimeType = '', format = '') => {
    const explicit = String(format || '').trim().toLowerCase();
    if (explicit) return explicit;
    const subtype = String(mimeType || '').split('/')[1] || '';
    const normalizedSubtype = subtype.toLowerCase();
    const formatMap = {
        mpeg: 'mp3',
        mp3: 'mp3',
        wav: 'wav',
        'x-wav': 'wav',
        webm: 'webm',
        flac: 'flac',
        ogg: 'ogg',
        opus: 'opus',
        aac: 'aac',
        mp4: 'm4a',
        m4a: 'm4a'
    };
    return formatMap[normalizedSubtype] || 'mp3';
};

const storeAttachmentFile = ({
    userId,
    attachmentId,
    kind,
    mimeType,
    format,
    buffer
}) => {
    const safeUser = sanitizeDirName(userId || 'user');
    const ext = extFromMime(mimeType, format);
    const relativeParts = ['chat_media', safeUser, kind];
    const physicalDir = path.join(UPLOADS_DIR, ...relativeParts);
    fs.mkdirSync(physicalDir, { recursive: true });
    const fileName = `${attachmentId}${ext}`;
    const physicalPath = path.join(physicalDir, fileName);
    fs.writeFileSync(physicalPath, buffer);
    return normalizeWebSlashes(`/storage/uploads/${relativeParts.join('/')}/${fileName}`);
};

const upsertChatAttachment = async ({
    userId,
    id,
    kind,
    name,
    mimeType,
    size,
    format,
    fileUrl
}) => {
    const existing = await dbGet(
        `SELECT createdAt FROM chat_session_attachments WHERE id = ? AND userId = ?`,
        [id, userId]
    );
    const now = Date.now();
    await dbRun(
        `INSERT INTO chat_session_attachments (
            id, userId, kind, name, mimeType, size, format, fileUrl, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            userId = excluded.userId,
            kind = excluded.kind,
            name = excluded.name,
            mimeType = excluded.mimeType,
            size = excluded.size,
            format = excluded.format,
            fileUrl = excluded.fileUrl,
            updatedAt = excluded.updatedAt`,
        [id, userId, kind, name, mimeType, size, format, fileUrl, existing?.createdAt || now, now]
    );
};

router.get('/chat-sessions', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        if (!userId) return res.status(400).json({ error: 'Authentication required' });

        const row = await dbGet(`SELECT sessionsJson, updatedAt FROM chat_sessions WHERE userId = ?`, [userId]);
        let sessions = [];
        if (row?.sessionsJson) {
            try {
                const parsed = JSON.parse(row.sessionsJson);
                sessions = Array.isArray(parsed) ? parsed : [];
            } catch {
                sessions = [];
            }
        }
        return res.json({
            sessions,
            updatedAt: Number.isFinite(row?.updatedAt) ? Number(row.updatedAt) : 0
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.put('/chat-sessions', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        if (!userId) return res.status(400).json({ error: 'Authentication required' });

        const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
        const updatedAt = Date.now();
        await dbRun(
            `INSERT INTO chat_sessions (userId, sessionsJson, updatedAt)
             VALUES (?, ?, ?)
             ON CONFLICT(userId) DO UPDATE SET
                sessionsJson = excluded.sessionsJson,
                updatedAt = excluded.updatedAt`,
            [userId, JSON.stringify(sessions), updatedAt]
        );
        return res.json({ success: true, updatedAt });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.post('/chat-sessions/attachments/image', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        if (!userId) return res.status(400).json({ error: 'Authentication required' });

        const dataUri = String(req.body?.dataUrl || '').trim();
        const parsed = parseDataUri(dataUri);
        if (!parsed || !String(parsed.mimeType || '').toLowerCase().startsWith('image/')) {
            return res.status(400).json({ error: 'Valid image dataUrl is required' });
        }

        const attachmentId = String(req.body?.id || '').trim() || uuidv4();
        const name = String(req.body?.name || 'image').trim() || 'image';
        const mimeType = parsed.mimeType;
        const size = Number.isFinite(req.body?.size) ? Number(req.body.size) : parsed.buffer.length;
        const fileUrl = storeAttachmentFile({
            userId,
            attachmentId,
            kind: 'image',
            mimeType,
            format: '',
            buffer: parsed.buffer
        });

        await upsertChatAttachment({
            userId,
            id: attachmentId,
            kind: 'image',
            name,
            mimeType,
            size,
            format: '',
            fileUrl
        });

        return res.status(201).json({
            id: attachmentId,
            name,
            url: fileUrl,
            mimeType,
            size
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.post('/chat-sessions/attachments/audio', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        if (!userId) return res.status(400).json({ error: 'Authentication required' });

        const attachmentId = String(req.body?.id || '').trim() || uuidv4();
        const name = String(req.body?.name || 'audio').trim() || 'audio';
        const format = normalizeAudioFormat(req.body?.mimeType, req.body?.format);
        const mimeType = String(req.body?.mimeType || '').trim() || `audio/${format}`;
        const rawData = String(req.body?.data || '').trim();
        if (!rawData) return res.status(400).json({ error: 'Audio base64 data is required' });

        const buffer = Buffer.from(rawData, 'base64');
        if (!buffer.length || !String(mimeType).toLowerCase().startsWith('audio/')) {
            return res.status(400).json({ error: 'Valid audio payload is required' });
        }

        const size = Number.isFinite(req.body?.size) ? Number(req.body.size) : buffer.length;
        const fileUrl = storeAttachmentFile({
            userId,
            attachmentId,
            kind: 'audio',
            mimeType,
            format,
            buffer
        });

        await upsertChatAttachment({
            userId,
            id: attachmentId,
            kind: 'audio',
            name,
            mimeType,
            size,
            format,
            fileUrl
        });

        return res.status(201).json({
            id: attachmentId,
            name,
            url: fileUrl,
            format,
            mimeType,
            size
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

export default router;
