import { Redis } from 'ioredis';

function createConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set in environment variables');
  return new Redis(url, {
    maxRetriesPerRequest: null,   // required by BullMQ — do NOT change
    enableReadyCheck: false,      // required by BullMQ
    // commandTimeout must NOT be set for BullMQ connections — it causes
    // "Command timed out" floods when the worker is idle waiting for jobs.
    tls: { rejectUnauthorized: false },
    retryStrategy: (times) => Math.min(times * 500, 10000),
    reconnectOnError: () => true,
    keepAlive: 30000,
    connectTimeout: 20000,
  });
}

// BullMQ requires a separate connection per Queue/Worker — never share one instance.
export function getRedisConnection() {
  return createConnection();
}
