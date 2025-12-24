import IORedis from "ioredis";
import { Queue } from "bullmq";

export const QUEUES = {
  calendarSync: "calendarSync",
  meetingFinalize: "meetingFinalize",
  agentRun: "agentRun",
} as const;

declare global {
  // eslint-disable-next-line no-var
  var __paosRedis: IORedis | undefined;
  // eslint-disable-next-line no-var
  var __paosQueues:
    | {
        calendarSync: Queue;
        meetingFinalize: Queue;
        agentRun: Queue;
      }
    | undefined;
}

function getRedis() {
  if (globalThis.__paosRedis) return globalThis.__paosRedis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required");

  const conn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  globalThis.__paosRedis = conn;
  return conn;
}

export function getQueues() {
  if (globalThis.__paosQueues) return globalThis.__paosQueues;

  const connection = getRedis();
  globalThis.__paosQueues = {
    calendarSync: new Queue(QUEUES.calendarSync, { connection }),
    meetingFinalize: new Queue(QUEUES.meetingFinalize, { connection }),
    agentRun: new Queue(QUEUES.agentRun, { connection }),
  };
  return globalThis.__paosQueues;
}


