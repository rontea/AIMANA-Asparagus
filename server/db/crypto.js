
import crypto from 'crypto';

export const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
};

export const verifyPassword = (password, storedValue) => {
    if (!storedValue || !storedValue.includes(':')) return password === storedValue;
    const [salt, hash] = storedValue.split(':');
    const checkHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const checkBuffer = Buffer.from(checkHash, 'hex');
    if (hashBuffer.length !== checkBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, checkBuffer);
};
