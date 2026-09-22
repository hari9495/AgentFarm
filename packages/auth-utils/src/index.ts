import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SALT_LEN = 32;

/**
 * Canonical role case is lowercase ('member' | 'admin' | 'owner' | 'superadmin').
 * Every gate compares lowercase, but legacy/seed data can carry other cases
 * (e.g. 'ADMIN'), which silently fails access checks. Normalize at every read
 * boundary so bad-case data can never break a gate.
 */
export const normalizeRole = (role?: string | null): string =>
    (role ?? 'member').trim().toLowerCase();

export const hashPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_LEN).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    if (!stored.startsWith('scrypt:')) { return false; }
    const parts = stored.split(':');
    if (parts.length !== 3) { return false; }
    const [, salt, hashHex] = parts;
    if (!salt || !hashHex) { return false; }
    try {
        const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
        const storedKey = Buffer.from(hashHex, 'hex');
        if (derivedKey.length !== storedKey.length) { return false; }
        return timingSafeEqual(derivedKey, storedKey);
    } catch { return false; }
};
