import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

let cachedMtimeMs = -1;
let cachedValues = {};

const readEnvFile = () => {
    try {
        const stat = fs.statSync(ENV_PATH);
        if (stat.mtimeMs === cachedMtimeMs) return cachedValues;
        const raw = fs.readFileSync(ENV_PATH, 'utf8');
        cachedValues = dotenv.parse(raw);
        cachedMtimeMs = stat.mtimeMs;
        return cachedValues;
    } catch {
        cachedMtimeMs = -1;
        cachedValues = {};
        return cachedValues;
    }
};

export const getRuntimeEnvValue = (key, fallback = '') => {
    const fromFile = readEnvFile();
    if (Object.prototype.hasOwnProperty.call(fromFile, key)) {
        return String(fromFile[key] ?? '').trim();
    }
    const fromProcess = process.env[key];
    if (typeof fromProcess === 'string') return fromProcess.trim();
    return fallback;
};

export const getRuntimePollinationsApiKey = () => getRuntimeEnvValue('POLLINATIONS_API_KEY', '');
export const getRuntimeAirforceApiKey = () => getRuntimeEnvValue('AIRFORCE_API_KEY', '');
export const getRuntimeNvidiaApiKey = () => getRuntimeEnvValue('NVIDIA_API_KEY', '');
