// Usage: node src/build-site.ts  -> writes site/index.html with results, stats and chain embedded.
import { readFileSync, writeFileSync } from "node:fs";

const results = (JSON.parse(readFileSync("out/results.json", "utf8")) as Array<{ id: string; pass1?: unknown }>).filter((r) => r.pass1).sort((a, b) => a.id.localeCompare(b.id));
const stats = JSON.parse(readFileSync("out/stats.json", "utf8"));
const chain = JSON.parse(readFileSync("out/chain.json", "utf8"));
const livepath = (JSON.parse(readFileSync("out/livepath.json", "utf8")) as { summary: unknown }).summary;
const items = (JSON.parse(readFileSync("data/items.json", "utf8")) as { items: Array<{ id: string; claim: string; context: string }> }).items;
const exampleTitles: Record<string, string> = {
  "newbuild-forecast": "“50–100% return” on new flats",
  "pb-saving": "“£4,158 average saving”",
  "churchill-energy": "Save £1,000+ on energy bills",
  "pb-thousands": "“You could save thousands”",
};
const examples = Object.keys(exampleTitles).map((id) => { const it = items.find((i) => i.id === id)!; return { title: exampleTitles[id], claim: it.claim, evidence: it.context }; });
const data = JSON.stringify({ results, stats, chain, examples, livepath }).replace(/</g, "\\u003c");
const html = readFileSync("src/template.html", "utf8").replace("__DATA__", () => data);
writeFileSync("site/index.html", html);
console.log(`site/index.html written: ${(html.length / 1024).toFixed(0)} KB, ${results.length} claims, chain head ${chain.head.slice(0, 12)}...`);
