import type { Job } from "bullmq";

export async function calendarSyncProcessor(job: Job) {
  // Implemented in later phases; keep processor present so the worker boots cleanly.
  job.log("calendarSyncProcessor not yet wired");
}


