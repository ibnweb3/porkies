// Usage: node src/seal.ts  -> builds out/chain.json (a hash chain over every step of the run) and verifies it.
// The chain code in src/lib is reused from the author's earlier Backstop project (MIT).
import { readFileSync, writeFileSync } from "node:fs";
import { entryHash, verifyChain, GENESIS, type Entry } from "./lib/chain.ts";
import { sha256Hex } from "./lib/crypto.ts";
import type { Record_ } from "./run.ts";

const recs = (JSON.parse(readFileSync("out/results.json", "utf8")) as Record_[]).filter((r) => r.pass1).sort((a, b) => a.id.localeCompare(b.id));
const items = readFileSync("data/items.json", "utf8");
const stream = "asa-run";
const entries: Entry[] = [];
let prev = GENESIS;
const t0 = Date.now();

async function add(type: string, actor: string, data: unknown) {
  const body = { stream, n: entries.length + 1, ts: t0 + entries.length, type, actor, data, prev };
  const e: Entry = { ...body, hash: await entryHash(body) };
  entries.push(e);
  prev = e.hash;
}

await add("run_started", "code", { items_file_sha256: await sha256Hex(items), item_count: recs.length, note: "ASA labels are never shown to SERV or Reppo" });
for (const r of recs) {
  await add("item", "code", { id: r.id, claim_sha256: await sha256Hex(r.claim), context_sha256: await sha256Hex(r.context), code_checks: r.checks });
  await add("serv_assessment", "serv", { id: r.id, ...r.pass1!.assessment });
  const p = r.pass1!.reppo;
  await add("reppo_review", "reppo", { id: r.id, eval_id: p.id, score: p.score, route: p.route, decision: p.decision, confidence: p.confidence, reason: p.reason, rubric_scores: p.rubric_scores });
  if (r.pass2) {
    await add("serv_revision", "serv", { id: r.id, ...r.pass2.assessment });
    const q = r.pass2.reppo;
    await add("reppo_review", "reppo", { id: r.id, eval_id: q.id, score: q.score, route: q.route, decision: q.decision, confidence: q.confidence, reason: q.reason, rubric_scores: q.rubric_scores });
  }
  // the regulator's label is added last, as a separate step, so the log shows it came after the answers
  await add("asa_label_revealed", "asa", { id: r.id, label: r.label, source: r.source });
}
const check = await verifyChain(entries);
writeFileSync("out/chain.json", JSON.stringify({ stream, head: prev, entries }, null, 1));
console.log(JSON.stringify(check));
