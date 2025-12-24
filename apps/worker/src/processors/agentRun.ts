import type { Job } from "bullmq";

export async function agentRunProcessor(job: Job) {
  // Implemented in later phases; keep processor present so the worker boots cleanly.
  job.log("agentRunProcessor not yet wired");
}


