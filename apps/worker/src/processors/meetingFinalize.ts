import type { Job } from "bullmq";

export async function meetingFinalizeProcessor(job: Job) {
  // Implemented in later phases; keep processor present so the worker boots cleanly.
  job.log("meetingFinalizeProcessor not yet wired");
}


