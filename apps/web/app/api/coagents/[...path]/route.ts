import { createCopilotEndpoint, CopilotRuntime, InMemoryAgentRunner } from "@copilotkitnext/runtime";

import { getSessionFromRequest } from "@/lib/auth/get-session-from-request";
import { LocalPostMeetingAgent } from "@/lib/coagents/post-meeting-agent";

export const runtime = "nodejs";

const coagentRuntime = new CopilotRuntime({
  agents: {
    postMeeting: new LocalPostMeetingAgent({
      agentId: "postMeeting",
      description: "Runs the post-meeting LangGraph workflow locally and streams progress + interrupts.",
    }),
  },
  runner: new InMemoryAgentRunner(),
  beforeRequestMiddleware: async ({ request, path }) => {
    // Require local auth for all coagent endpoints.
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // For agent runs, inject session info into forwardedProps (server-trusted).
    if (path.includes("/agent/") && request.headers.get("content-type")?.includes("application/json")) {
      const body = (await request.clone().json().catch(() => null)) as any;
      if (body && typeof body === "object") {
        body.forwardedProps = {
          ...(body.forwardedProps ?? {}),
          companyId: session.companyId,
          personId: session.personId,
        };
        return new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(body),
          signal: request.signal,
        });
      }
    }
  },
});

const app = createCopilotEndpoint({
  runtime: coagentRuntime as any,
  basePath: "/api/coagents",
});

export async function GET(req: Request) {
  return app.fetch(req);
}

export async function POST(req: Request) {
  return app.fetch(req);
}


