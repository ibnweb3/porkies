import { need } from "./env.ts";
import type { Assessment, Item } from "./serv.ts";
import { taskText } from "./serv.ts";

export interface ReppoResult {
  id: string;
  status: string;
  score: number | null;
  route: "ship" | "review" | "block" | null;
  decision: string | null;
  confidence: string | null;
  reason: string | null;
  rubric_scores: unknown;
  creditsCharged: number;
}

const BASE = "https://eval.reppo.xyz/api/v1/agents/evals";
const headers = () => ({ Authorization: `Bearer ${need("REPPO_EVAL_KEY")}`, "Content-Type": "application/json" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch that survives network drops (flaky connection): retries with a growing wait. */
async function net(url: string, init?: RequestInit): Promise<Response> {
  let err: unknown;
  for (let i = 0; i < 6; i++) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(60000) }); } catch (e) { err = e; await sleep(4000 * (i + 1)); }
  }
  throw err;
}

/** What the panel is shown: the task and evidence, then the analyst's answer. The ASA's ruling is never included. */
export function reviewInput(item: Item, checks: string[], a: Assessment): string {
  return `User prompt: ${taskText(item, checks)}\n\nAI response: ${JSON.stringify({ verdict: a.verdict, reasoning: a.reasoning, missing_or_unsupported: a.missing_or_unsupported })}`;
}

export async function evaluate(input: string): Promise<ReppoResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await net(BASE, { method: "POST", headers: headers(), body: JSON.stringify({ taskType: "response", input }) });
    const text = await res.text();
    if (res.status === 402) throw new Error("Reppo: insufficient credits (402)");
    if (!res.ok) throw new Error(`Reppo submit HTTP ${res.status}: ${text.slice(0, 200)}`);
    const { id } = JSON.parse(text) as { id: string };
    for (let i = 0; i < 120; i++) {
      await sleep(i < 4 ? 4000 : 6000);
      const r = await net(`${BASE}/${id}`, { headers: headers() });
      if (!r.ok) throw new Error(`Reppo read HTTP ${r.status}`);
      const j = (await r.json()) as {
        status: string; score: number | null; route: ReppoResult["route"]; creditsCharged: number;
        result: { decision: string; confidence: string; reason: string; rubric_scores: unknown } | null;
      };
      if (j.status === "COMPLETED") {
        return { id, status: j.status, score: j.score, route: j.route, decision: j.result?.decision ?? null, confidence: j.result?.confidence ?? null, reason: j.result?.reason ?? null, rubric_scores: j.result?.rubric_scores ?? null, creditsCharged: j.creditsCharged };
      }
      if (j.status === "FAILED") break; // not charged; resubmit once
    }
  }
  throw new Error("Reppo evaluation failed twice");
}
