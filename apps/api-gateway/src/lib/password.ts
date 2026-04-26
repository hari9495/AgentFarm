import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SALT_LEN = 32;

/**
 * Hash a password using scrypt (Node built-in crypto, no external dependency).
 * Returns a string in the format: scrypt:<hex-salt>:<hex-derived-key>
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_LEN).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
};

/**
 * Verify a password against a stored hash produced by hashPassword.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    if (!stored.startsWith('scrypt:')) {
        return false;
    }
    const parts = stored.split(':');
    if (parts.length !== 3) {
        return false;
    }
    const [, salt, hashHex] = parts;
    if (!salt || !hashHex) {
        return false;
    }
    try {
        const derivedKey = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
        const storedKey = Buffer.from(hashHex, 'hex');
        if (derivedKey.length !== storedKey.length) {
            return false;
        }
        return timingSafeEqual(derivedKey, storedKey);
    } catch {
        return false;
    }
};
