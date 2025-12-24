import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";

import { QUEUES } from "./queues";
import { calendarSyncProcessor } from "./processors/calendarSync";
import { meetingFinalizeProcessor } from "./processors/meetingFinalize";
import { agentRunProcessor } from "./processors/agentRun";

const logger = pino({ name: "pa-os-worker" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

logger.info({ redisUrl }, "worker starting");

new Worker(QUEUES.calendarSync, calendarSyncProcessor, { connection });
new Worker(QUEUES.meetingFinalize, meetingFinalizeProcessor, { connection });
new Worker(QUEUES.agentRun, agentRunProcessor, { connection });

process.on("SIGINT", async () => {
  logger.info("SIGINT received; shutting down");
  await connection.quit();
  process.exit(0);
});


