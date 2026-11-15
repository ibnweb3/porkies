import { need } from "./env.ts";

export interface Assessment {
  verdict: "supported" | "not_supported";
  confidence: number;
  reasoning: string;
  missing_or_unsupported: string[];
}

export interface Item {
  id: string;
  group: string;
  label: "flawed" | "sound";
  source: string;
  claim: string;
  context: string;
}

const MODEL = "gpt-5.4-mini";
const BASE = "https://inference-api.openserv.ai/v1/chat/completions";

const SYSTEM =
  "You are a careful analyst of UK advertising claims in the property sector. For each claim you judge whether it is adequately supported by the evidence provided, and whether it is misleading by omission or exaggeration, using ONLY the information given. " +
  "'supported' means a reasonable consumer would not be misled given the evidence. 'not_supported' means the evidence given does not support the claim as worded, or important qualifications are missing. " +
  "Be specific about what in the evidence does or does not support the claim. Answer with one JSON object and nothing else.";

const FORMAT =
  'Return JSON: {"verdict":"supported"|"not_supported","confidence":<0 to 1>,"reasoning":"<at most 120 words, citing the evidence>","missing_or_unsupported":["<short point>", ...]}';

export function taskText(item: Item, checks: string[]): string {
  return [
    "TASK: Decide whether the advertising claim below is adequately supported by the evidence given.",
    `CLAIM: ${item.claim}`,
    `EVIDENCE AND CONTEXT: ${item.context}`,
    `VERIFIED ARITHMETIC (computed by code, not by you; treat as correct):\n- ${checks.join("\n- ")}`,
  ].join("\n\n");
}

async function call(messages: Array<{ role: string; content: string }>): Promise<{ text: string; usage: unknown }> {
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response, body: string;
    try {
      res = await fetch(BASE, {
        method: "POST",
        headers: { Authorization: `Bearer ${need("SERV_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, max_completion_tokens: 900 }),
        signal: AbortSignal.timeout(90000), // a dead connection must not hang the run
      });
      body = await res.text();
    } catch (e) {
      // network drop (flaky connection): wait and try again
      lastErr = "network: " + (e as Error).message;
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    if (res.ok) {
      const j = JSON.parse(body) as { choices: Array<{ message: { content: string } }>; usage: unknown };
      return { text: j.choices[0]!.message.content, usage: j.usage };
    }
    lastErr = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    if (res.status === 429 || res.status >= 500) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    else break;
  }
  throw new Error("SERV call failed: " + lastErr);
}

function parse(text: string): Assessment {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("SERV returned no JSON: " + text.slice(0, 120));
  const j = JSON.parse(m[0]) as Assessment;
  if (j.verdict !== "supported" && j.verdict !== "not_supported") throw new Error("bad verdict: " + String(j.verdict));
  return { verdict: j.verdict, confidence: Number(j.confidence), reasoning: String(j.reasoning), missing_or_unsupported: (j.missing_or_unsupported ?? []).map(String) };
}

export async function assess(item: Item, checks: string[]): Promise<{ a: Assessment; usage: unknown }> {
  const { text, usage } = await call([
    { role: "system", content: SYSTEM },
    { role: "user", content: taskText(item, checks) + "\n\n" + FORMAT },
  ]);
  return { a: parse(text), usage };
}

/** Second pass: the analyst sees Reppo's independent critique of its first answer and may revise. */
export async function revise(item: Item, checks: string[], prior: Assessment, reppo: { score: number | null; route: string | null; reason: string | null; rubric_scores: unknown }): Promise<{ a: Assessment; usage: unknown }> {
  const critique =
    `An independent panel reviewed your earlier answer. Score ${reppo.score}/100, route '${reppo.route}'. Panel reason: ${reppo.reason}. Rubric scores: ${JSON.stringify(reppo.rubric_scores)}.`;
  const { text, usage } = await call([
    { role: "system", content: SYSTEM },
    { role: "user", content: taskText(item, checks) + "\n\n" + FORMAT },
    { role: "assistant", content: JSON.stringify(prior) },
    { role: "user", content: critique + "\n\nReconsider the claim and the evidence in light of this critique. If the critique is right, change your answer; if you still think you were right, keep it and explain why. " + FORMAT },
  ]);
  return { a: parse(text), usage };
}
