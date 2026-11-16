// Runs the 24 benchmark items through the LIVE path (the model proposes its own sums), SERV only.
// A dummy Reppo key is used on purpose, so no Reppo credits are spent. Usage: node test/livepath.ts
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv, need } from "../src/env.ts";
import { handle } from "../src/live.ts";
loadEnv();
const items = (JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8")) as { items: Array<{ id: string; label: string; claim: string; context: string }> }).items;
const prev = JSON.parse(readFileSync(new URL("../out/results.json", import.meta.url), "utf8")) as Array<{ id: string; pass1?: { assessment?: { verdict: string } } }>;
const prevV = new Map(prev.map((r) => [r.id, r.pass1?.assessment?.verdict]));
const env = { SERV_API_KEY: need("SERV_API_KEY"), REPPO_EVAL_KEY: "dummy-no-spend", LIMIT_IP: "9999", LIMIT_DAY: "9999" };
const rows: Array<Record<string, unknown>> = [];
for (const it of items) {
  const res = await handle(new Request("http://x/api/check", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "livepath-test" }, body: JSON.stringify({ claim: it.claim, evidence: it.context }) }), env as never);
  const j = (await res.json()) as { ok: boolean; error?: string; calcs?: Array<{ expression: string; display: string }>; assessment?: { verdict: string } };
  const v = j.assessment?.verdict, want = it.label === "flawed" ? "not_supported" : "supported";
  rows.push({ id: it.id, label: it.label, live: v ?? null, benchmark: prevV.get(it.id) ?? null, correct: v === want, n_calcs: j.calcs?.length ?? 0, calcs: (j.calcs ?? []).map((c) => `${c.expression} = ${c.display}`), error: j.error ?? null });
  console.log(it.id.padEnd(18), it.label.padEnd(7), String(v).padEnd(14), "calcs:", j.calcs?.length ?? 0, j.error ?? "");
}
const ok = rows.filter((r) => !r.error), flawed = ok.filter((r) => r.label === "flawed"), sound = ok.filter((r) => r.label === "sound");
const s = { items: rows.length, errors: rows.length - ok.length, correct: ok.filter((r) => r.correct).length, flawed_caught: flawed.filter((r) => r.correct).length, flawed_n: flawed.length, sound_wrongly_flagged: sound.filter((r) => !r.correct).length, sound_n: sound.length, no_calcs: ok.filter((r) => r.n_calcs === 0).length, differs_from_benchmark: ok.filter((r) => r.live !== r.benchmark).length };
console.log(JSON.stringify(s, null, 1));
writeFileSync(new URL("../out/livepath.json", import.meta.url), JSON.stringify({ about: "24 benchmark items through the live path (model-proposed sums), SERV only, Reppo not called.", summary: s, rows }, null, 1));
