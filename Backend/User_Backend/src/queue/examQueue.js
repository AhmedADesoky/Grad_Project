import { Queue } from 'bullmq';
import { getRedisConnection } from './redisConnection.js';

let _queue = null;

export function getExamQueue() {
  if (!_queue) {
    _queue = new Queue('exam-evaluation', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return _queue;
}
