import { Redis } from 'ioredis';

type RedisClient = InstanceType<typeof Redis>;

let _client: RedisClient | null = null;

/**
 * Returns a shared Redis client singleton, or null when REDIS_URL is not set.
 * Falls through to null gracefully so callers can skip Redis-specific paths.
 */
export function getRedisClient(): RedisClient | null {
    if (!process.env['REDIS_URL']) return null;
    if (!_client) {
        _client = new Redis(process.env['REDIS_URL'], {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });
        _client.on('error', (err: Error) => {
            console.error('[redis-client] connection error:', err.message);
        });
    }
    return _client;
}

/**
 * Gracefully close the Redis connection and reset the singleton.
 * Call this during application shutdown.
 */
export async function closeRedisClient(): Promise<void> {
    if (_client) {
        await _client.quit();
        _client = null;
    }
}

export { Redis };
