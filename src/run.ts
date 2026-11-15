// Usage: node src/run.ts [--ids a,b] [--limit N] [--no-loop] [--out out/results.json]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { loadEnv } from "./env.ts";
import { codeChecks } from "./checks.ts";
import { assess, revise, type Item, type Assessment } from "./serv.ts";
import { evaluate, reviewInput, type ReppoResult } from "./reppo.ts";

loadEnv();

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ids = flag("--ids")?.split(",");
const limit = flag("--limit") ? Number(flag("--limit")) : Infinity;
const noLoop = args.includes("--no-loop");
const outPath = flag("--out") ?? "out/results.json";

const all = (JSON.parse(readFileSync("data/items.json", "utf8")) as { items: Item[] }).items;
const items = all.filter((i) => !ids || ids.includes(i.id)).slice(0, limit);

interface Pass { assessment: Assessment; reppo: ReppoResult }
export interface Record_ {
  id: string; group: string; label: "flawed" | "sound"; claim: string; context: string; source: string;
  checks: string[]; pass1?: Pass; pass2?: Pass; error?: string;
}

mkdirSync("out", { recursive: true });
const done: Record<string, Record_> = existsSync(outPath) ? Object.fromEntries((JSON.parse(readFileSync(outPath, "utf8")) as Record_[]).map((r) => [r.id, r])) : {};
const save = () => writeFileSync(outPath, JSON.stringify(Object.values(done), null, 2));

async function one(item: Item) {
  if (done[item.id]?.pass1 && (noLoop || done[item.id]!.pass2 || done[item.id]!.pass1!.reppo.route === "ship")) return;
  const checks = codeChecks(item.id);
  const rec: Record_ = done[item.id] ?? { id: item.id, group: item.group, label: item.label, claim: item.claim, context: item.context, source: item.source, checks };
  done[item.id] = rec;
  try {
    if (!rec.pass1) {
      const { a } = await assess(item, checks);
      const reppo = await evaluate(reviewInput(item, checks, a));
      rec.pass1 = { assessment: a, reppo };
      save();
      console.log(`${item.id}: SERV=${a.verdict} | Reppo ${reppo.score} ${reppo.route} | ASA=${item.label}`);
    }
    if (!noLoop && rec.pass1.reppo.route !== "ship" && !rec.pass2) {
      const { a } = await revise(item, checks, rec.pass1.assessment, rec.pass1.reppo);
      const reppo = await evaluate(reviewInput(item, checks, a));
      rec.pass2 = { assessment: a, reppo };
      save();
      console.log(`${item.id}: REVISED SERV=${a.verdict} | Reppo ${reppo.score} ${reppo.route}`);
    }
  } catch (e) {
    rec.error = (e as Error).message;
    save();
    console.log(`${item.id}: ERROR ${rec.error}`);
  }
}

// small worker pool: Reppo allows several evaluations in flight
const queue = [...items];
const workers = Array.from({ length: 4 }, async () => { for (let it = queue.shift(); it; it = queue.shift()) await one(it); });
await Promise.all(workers);
const credits = Object.values(done).reduce((s, r) => s + (r.pass1?.reppo.creditsCharged ?? 0) + (r.pass2?.reppo.creditsCharged ?? 0), 0);
console.log(`items run: ${items.length}; Reppo credits charged so far: ${credits}`);
