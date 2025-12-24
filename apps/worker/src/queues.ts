export const QUEUES = {
  calendarSync: "calendarSync",
  meetingFinalize: "meetingFinalize",
  agentRun: "agentRun",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];


