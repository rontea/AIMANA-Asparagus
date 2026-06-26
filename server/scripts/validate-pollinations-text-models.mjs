import 'dotenv/config';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');
const DB_FILE = path.join(ROOT_DIR, 'storage', 'aimana.db');
const OUT_FILE = path.join(ROOT_DIR, 'docs', 'pollinations-text-validation-2026-03-04.json');

const API_KEY = process.env.POLLINATIONS_API_KEY || '';
if (!API_KEY) {
    console.error('POLLINATIONS_API_KEY is missing.');
    process.exit(1);
}

const db = new sqlite3.Database(DB_FILE);
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const sampleImageUrl = 'https://dummyimage.com/128x128/111827/34d399.png&text=A';
const buildSilentWavBase64 = (durationSeconds = 0.2, sampleRate = 16000) => {
    const channelCount = 1;
    const bytesPerSample = 2;
    const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
    const dataSize = sampleCount * channelCount * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channelCount, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
    buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    return buffer.toString('base64');
};
const tinyWavBase64 = buildSilentWavBase64(0.2, 16000);

const sampleVideoUrl = 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4';

const normalizeModalities = (configJson) => {
    try {
        const parsed = configJson ? JSON.parse(configJson) : {};
        if (Array.isArray(parsed.textInputModalities) && parsed.textInputModalities.length > 0) {
            return parsed.textInputModalities.map((m) => String(m || '').toLowerCase()).filter(Boolean);
        }
    } catch (_e) {}
    return ['text'];
};

const runCompletion = async (model, messages) => {
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            max_tokens: 64,
            stream: false
        })
    });
    const bodyText = await res.text();
    let bodyJson = null;
    try { bodyJson = JSON.parse(bodyText); } catch (_e) {}
    return {
        ok: res.ok,
        status: res.status,
        requestId: res.headers.get('x-request-id') || res.headers.get('request-id') || '',
        bodyText,
        bodyJson
    };
};

const makeTextMessages = (label) => ([
    { role: 'system', content: 'You are a concise assistant for sandbox validation.' },
    { role: 'user', content: `Reply with: OK ${label}` }
]);

const makeImageMessages = () => ([
    { role: 'user', content: [
        { type: 'text', text: 'What is in this image? Answer in one short line.' },
        { type: 'image_url', image_url: { url: sampleImageUrl } }
    ] }
]);

const makeAudioMessages = () => ([
    { role: 'user', content: [
        { type: 'text', text: 'Confirm you received an audio input. One short line only.' },
        { type: 'input_audio', input_audio: { data: tinyWavBase64, format: 'wav' } }
    ] }
]);

const makeVideoMessages = () => ([
    { role: 'user', content: [
        { type: 'text', text: 'Confirm you received a video input. One short line only.' },
        { type: 'video_url', video_url: { url: sampleVideoUrl } }
    ] }
]);

const toOutcome = (result) => {
    if (result.ok) return { status: 'pass', detail: 'ok' };
    if (result.status === 402 || result.status === 403) {
        return { status: 'blocked', detail: `infra-${result.status}` };
    }
    const message =
        result.bodyJson?.error?.message ||
        result.bodyJson?.message ||
        result.bodyText?.slice(0, 200) ||
        `status-${result.status}`;
    return { status: 'fail', detail: message };
};

const main = async () => {
    const rows = await dbAll(
        `SELECT id, label, upstreamId, configJson FROM custom_engines
         WHERE provider='pollinations' AND category='Language' AND id LIKE 'pollinations-%'
         ORDER BY id ASC`
    );

    const models = rows.map((row) => ({
        id: row.id,
        label: row.label,
        upstreamId: row.upstreamId,
        inputModalities: normalizeModalities(row.configJson)
    }));

    const validations = [];

    for (const model of models) {
        const entry = {
            id: model.id,
            upstreamId: model.upstreamId,
            inputModalities: model.inputModalities,
            textOnly: { status: 'pending', detail: '' },
            image: null,
            audio: null,
            video: null
        };

        try {
            const textRes = await runCompletion(model.upstreamId, makeTextMessages(model.upstreamId));
            entry.textOnly = toOutcome(textRes);
        } catch (e) {
            entry.textOnly = { status: 'fail', detail: e?.message || 'request-exception' };
        }

        if (model.inputModalities.includes('image')) {
            try {
                const imageRes = await runCompletion(model.upstreamId, makeImageMessages());
                entry.image = toOutcome(imageRes);
            } catch (e) {
                entry.image = { status: 'fail', detail: e?.message || 'request-exception' };
            }
        }

        if (model.inputModalities.includes('audio')) {
            try {
                const audioRes = await runCompletion(model.upstreamId, makeAudioMessages());
                entry.audio = toOutcome(audioRes);
            } catch (e) {
                entry.audio = { status: 'fail', detail: e?.message || 'request-exception' };
            }
        }

        if (model.inputModalities.includes('video')) {
            try {
                const videoRes = await runCompletion(model.upstreamId, makeVideoMessages());
                entry.video = toOutcome(videoRes);
            } catch (e) {
                entry.video = { status: 'fail', detail: e?.message || 'request-exception' };
            }
        }

        validations.push(entry);
        console.log(`[validate] ${model.id} text=${entry.textOnly.status}`);
    }

    const summary = {
        totalModels: validations.length,
        textPass: validations.filter((v) => v.textOnly.status === 'pass').length,
        textFail: validations.filter((v) => v.textOnly.status === 'fail').length,
        textBlocked: validations.filter((v) => v.textOnly.status === 'blocked').length,
        modalityChecks: {
            image: validations.filter((v) => v.image).length,
            audio: validations.filter((v) => v.audio).length,
            video: validations.filter((v) => v.video).length
        },
        modalityPass: {
            image: validations.filter((v) => v.image?.status === 'pass').length,
            audio: validations.filter((v) => v.audio?.status === 'pass').length,
            video: validations.filter((v) => v.video?.status === 'pass').length
        },
        modalityFail: {
            image: validations.filter((v) => v.image?.status === 'fail').length,
            audio: validations.filter((v) => v.audio?.status === 'fail').length,
            video: validations.filter((v) => v.video?.status === 'fail').length
        },
        modalityBlocked: {
            image: validations.filter((v) => v.image?.status === 'blocked').length,
            audio: validations.filter((v) => v.audio?.status === 'blocked').length,
            video: validations.filter((v) => v.video?.status === 'blocked').length
        }
    };

    const report = {
        generatedAt: new Date().toISOString(),
        source: 'live pollinations /v1/chat/completions checks',
        summary,
        validations
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report written: ${OUT_FILE}`);
    db.close();
};

main().catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
});
