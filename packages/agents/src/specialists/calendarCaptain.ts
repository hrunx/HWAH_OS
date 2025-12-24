import { z } from "zod";
import { getOpenAI } from "../openai/client";

const OutputSchema = z.object({
  prep_pack: z.object({
    agenda: z.array(z.string()),
    outcomes: z.array(z.string()),
    risks: z.array(z.string()),
    related_tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
      }),
    ),
  }),
});

export type CalendarCaptainInput = {
  event: { title: string; startsAt: string; endsAt: string };
  relatedTasks: Array<{ id: string; title: string; status: string }>;
};

export async function calendarCaptainGeneratePrepPack(input: CalendarCaptainInput) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      prep_pack: {
        agenda: [`Review: ${input.event.title}`, "Key updates", "Decisions", "Next actions"],
        outcomes: ["Alignment", "Clear owners", "Next steps documented"],
        risks: ["Missing context", "Unclear decision owner"],
        related_tasks: input.relatedTasks,
      },
    };
  }

  const openai = getOpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const prompt = [
    "You are Calendar Captain.",
    "Return strictly valid JSON with shape:",
    JSON.stringify(
      {
        prep_pack: {
          agenda: ["..."],
          outcomes: ["..."],
          risks: ["..."],
          related_tasks: [{ id: "string", title: "string", status: "string" }],
        },
      },
      null,
      2,
    ),
    "",
    "Event:",
    JSON.stringify(input.event),
    "",
    "Related tasks:",
    JSON.stringify(input.relatedTasks),
  ].join("\n");

  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You write concise prep packs for meetings." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as any,
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  const parsed = OutputSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error("CalendarCaptain: invalid JSON output");
  }
  return parsed.data;
}


