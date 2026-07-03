import { badRequest, ensureWorld, ok } from "@/server/api";
import { TASK_LABELS, autonomyGrants, setAutonomyLevel } from "@/core/agent";
import { forceNotify } from "@/core/store";
import type { AgentTaskType, AutonomyLevel } from "@/core/types";

export const dynamic = "force-dynamic";

/** GET /api/agent/autonomy — the trust dial. */
export async function GET(request: Request) {
  ensureWorld(request);
  return ok({ grants: autonomyGrants() });
}

/** POST /api/agent/autonomy {taskType, level} — turn a notch. */
export async function POST(request: Request) {
  ensureWorld(request);
  let body: { taskType?: string; level?: number };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!body.taskType || !(body.taskType in TASK_LABELS)) {
    return badRequest(`taskType must be one of ${Object.keys(TASK_LABELS).join(", ")}`);
  }
  if (![1, 2, 3, 4].includes(body.level as number)) {
    return badRequest("level must be 1–4");
  }
  setAutonomyLevel(body.taskType as AgentTaskType, body.level as AutonomyLevel);
  forceNotify();
  return ok({ grants: autonomyGrants() });
}
