import { z } from "zod";
import { getOpenAI } from "../openai/client.js";

const OutputSchema = z.object({
  minutesMd: z.string(),
  decisionsJson: z.array(z.unknown()),
  actionItemsJson: z.array(z.unknown()),
  risksJson: z.array(z.unknown()),
  createTasksProposal: z.object({
    tasks: z.array(
      z.object({
        title: z.string(),
        descriptionMd: z.string().optional(),
        priority: z.string().optional(),
        dueAt: z.string().optional(),
        ownerPersonId: z.string().optional(),
      }),
    ),
  }),
});

export type MeetingBookmark = { t: number; kind: "Decision" | "Action" | "Important"; note?: string };

export type MeetingScribeInput = {
  transcriptFullText: string;
  segments: unknown[];
  bookmarks: MeetingBookmark[];
  companyContext?: { companyId: string; companyName?: string };
};

export async function meetingScribeGenerate(input: MeetingScribeInput) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      minutesMd: `# Minutes\n\n(OPENAI_API_KEY not set — stub output)\n\n## Summary\n- Meeting captured.\n`,
      decisionsJson: [],
      actionItemsJson: [],
      risksJson: [],
      createTasksProposal: { tasks: [] },
    };
  }

  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const prompt = [
    "You are Meeting Scribe.",
    "Given the transcript and bookmarks, produce meeting minutes and extract action items.",
    "Return strictly valid JSON with keys: minutesMd, decisionsJson, actionItemsJson, risksJson, createTasksProposal.",
    "",
    "Company context:",
    JSON.stringify(input.companyContext ?? {}),
    "",
    "Bookmarks:",
    JSON.stringify(input.bookmarks ?? []),
    "",
    "Transcript (full text):",
    input.transcriptFullText.slice(0, 50_000),
  ].join("\n");

  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You turn transcripts into crisp minutes and actionable tasks." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as any,
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  const parsed = OutputSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error("MeetingScribe: invalid JSON output");
  }
  return parsed.data;
}


