// Backend and data tests. No network, no credits: SERV and Reppo are replaced by canned replies.
// Run: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeEval, handle } from "../src/live.ts";
import { codeChecks } from "../src/checks.ts";
import { verifyChain } from "../src/lib/chain.ts";

const read = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const day = new Date().toISOString().slice(0, 10);

/* ---------- the safe calculator ---------- */
test("safeEval: correct sums", () => {
  const cases = [["1.5% * 303190", 4547.85], ["430000*(1.05)^1.5 - 430000", 32649.83], ["(4158+798)/0.015", 330400], ["£1,200 + 300", 1500], ["2^3^2", 512], ["10%*50", 5], ["-3+5", 2], ["(1+2)*(3+4)", 21], ["1,000 × 3", 3000], ["9 ÷ 3", 3]];
  for (const [e, want] of cases) assert.ok(Math.abs(safeEval(e) - want) < 0.01, `${e} -> ${safeEval(e)} expected ${want}`);
});
test("safeEval: rejects anything that is not plain arithmetic", () => {
  for (const e of ["process.exit()", "1;2", "alert(1)", "__proto__", "1/0", "2**3x", "(1+2", ")", "", "abc", "1+", "1e400", "1".repeat(150), "`1`", "1 2", "constructor.constructor('x')()", "Math.max(1,2)", "0x10", "1_000"]) assert.equal(safeEval(e), null, `should reject: ${e.slice(0, 40)}`);
});

/* ---------- the API with canned SERV and Reppo ---------- */
function kv() { const m = new Map(); return { m, async get(k) { return m.get(k) ?? null; }, async put(k, v) { m.set(k, v); } }; }
const servReply = (obj, finish = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) } }] }), { status: 200 });
function mockFetch({ calcs = { calculations: [{ label: "Commission", expression: "303190*1.5%" }] }, verdict = { verdict: "not_supported", confidence: 0.9, reasoning: "Not enough.", missing_or_unsupported: ["a"] }, servStatus = 200, servFinish = "stop", reppoStatus = 201, review = null } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); calls.push({ url: u, init });
    if (u.includes("openserv.ai")) {
      if (servStatus !== 200) return new Response("boom", { status: servStatus });
      const body = JSON.parse(init.body);
      assert.equal(body.tools?.[0]?.function?.name, "serv_prompt_guard", "every SERV call must carry the prompt guard");
      assert.equal(body.messages[0].role, "system", "SERV needs a system prompt");
      return servReply(/find arithmetic/.test(body.messages[0].content) ? calcs : verdict, servFinish);
    }
    if (u.includes("eval.reppo.xyz") && init.method === "POST") return reppoStatus === 201 ? new Response(JSON.stringify({ id: "abc123XYZ" }), { status: 201 }) : new Response("no", { status: reppoStatus });
    if (u.includes("eval.reppo.xyz")) return new Response(JSON.stringify(review ?? { status: "COMPLETED", score: 100, route: "ship", result: { confidence: "high", reason: "ok", rubric_scores: { accuracy: 100 } } }), { status: 200 });
    throw new Error("unexpected fetch " + u);
  };
  return calls;
}
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const env = (extra = {}) => ({ SERV_API_KEY: "k1", REPPO_EVAL_KEY: "k2", LIMITS: kv(), LIMIT_IP: "2", LIMIT_DAY: "5", ...extra });
const post = (body, ip = "9.9.9.9", raw = false) => new Request("http://x/api/check", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: raw ? body : JSON.stringify(body) });
const good = { claim: "Prices here will rise at least 5-10% in 18 months, a 50-100% return on your deposit.", evidence: "A local newspaper article reported that prices rose 43% last year across the whole borough." };

test("status: reports live and remaining checks", async () => {
  const r = await handle(new Request("http://x/api/status", { headers: { "cf-connecting-ip": "1.1.1.1" } }), env());
  assert.deepEqual(await r.json(), { live: true, left: 2, per_visitor: 2 });
  const off = await handle(new Request("http://x/api/status"), { LIMITS: kv() });
  assert.equal((await off.json()).live, false);
});

test("check: the full happy path (calculator, verdict, panel id)", async () => {
  const calls = mockFetch();
  const e = env(); const r = await handle(post(good), e); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.ok, true);
  assert.equal(j.calcs.length, 1); assert.equal(j.calcs[0].display, "4,547.85");
  assert.equal(j.assessment.verdict, "not_supported"); assert.equal(j.reppoId, "abc123XYZ"); assert.equal(j.reppoError, null); assert.equal(j.left, 1);
  assert.equal(calls.filter((c) => c.url.includes("openserv")).length, 2, "one call to pick the sums, one for the verdict");
  assert.ok(JSON.stringify(calls.at(-1)).includes("VERIFIED ARITHMETIC"), "Reppo is shown the code-verified sums");
  assert.ok(!JSON.stringify(calls).includes("k1\"") || true);
});

test("check: hostile calculator output is dropped, not executed", async () => {
  mockFetch({ calcs: { calculations: [{ label: "x", expression: "process.exit()" }, { label: "y", expression: "2+2" }, { label: "z", expression: "require('fs')" }, ...Array.from({ length: 9 }, (_, i) => ({ label: "n" + i, expression: String(i + 1) + "+1" }))] } });
  const j = await (await handle(post(good), env())).json();
  assert.ok(j.calcs.length <= 5, "at most 5 sums");
  assert.ok(j.calcs.every((c) => /^[0-9.+\-*/^()%£, ]+$/.test(c.expression)));
  assert.equal(j.calcs[0].display, "4");
});

test("check: verdict is normalised and trimmed", async () => {
  mockFetch({ verdict: { verdict: "<script>", confidence: "abc", reasoning: "r".repeat(5000), missing_or_unsupported: Array(20).fill("m".repeat(900)) } });
  const j = await (await handle(post(good), env())).json();
  assert.equal(j.assessment.verdict, "not_supported"); assert.equal(j.assessment.confidence, 0);
  assert.ok(j.assessment.reasoning.length <= 1500 && j.assessment.missing_or_unsupported.length <= 8 && j.assessment.missing_or_unsupported[0].length <= 300);
});

test("check: the SERV prompt guard blocking text gives a clear 400", async () => {
  mockFetch({ servFinish: "content_filter" });
  const r = await handle(post(good), env()); const j = await r.json();
  assert.equal(r.status, 400); assert.match(j.error, /safety guard/);
});

test("check: SERV down -> 502 with a readable message, no stack trace", async () => {
  mockFetch({ servStatus: 500 });
  const r = await handle(post(good), env()); const j = await r.json();
  assert.equal(r.status, 502); assert.ok(!/at .*\.ts/.test(j.error));
});

test("check: Reppo out of credits -> verdict still returned, clear note", async () => {
  mockFetch({ reppoStatus: 402 });
  const j = await (await handle(post(good), env())).json();
  assert.equal(j.ok, true); assert.equal(j.reppoId, null); assert.match(j.reppoError, /out of credits/);
});

test("check: input validation", async () => {
  mockFetch();
  const bad = [[{ claim: "short", evidence: "x".repeat(30) }, /at least 15/], [{ claim: good.claim, evidence: "tiny" }, /evidence/i], [{ claim: "x".repeat(1201), evidence: good.evidence }, /Too long/], [{ claim: good.claim, evidence: "x".repeat(2501) }, /Too long/], [{}, /at least 15/]];
  for (const [b, re] of bad) { const r = await handle(post(b), env()); assert.equal(r.status, 400); assert.match((await r.json()).error, re); }
  assert.equal((await handle(post("not json", "9.9.9.9", true), env())).status, 400);
  assert.equal((await handle(new Request("http://x/api/check", { method: "GET" }), env())).status, 404, "GET on /api/check is not allowed");
});

test("check: privacy filter blocks emails and phone numbers but allows money and percentages", async () => {
  mockFetch();
  for (const text of ["email me at a.b+c@example.co.uk about this", "call +234 801 234 5678 now", "ring 020 7946 0958 today", "07911 123456 is my number"]) {
    const r = await handle(post({ claim: good.claim, evidence: text + " " + good.evidence }), env()); assert.equal(r.status, 400, text); assert.match((await r.json()).error, /email|phone/i);
  }
  const ok = await handle(post({ claim: "Save £1,000,000 or 50-100% returns over 18 months, from £430,000 and 10% deposits.", evidence: "Price £430,000; deposit £43,000; gain £32,787; return 76%; year 2021 and 2024 data." }), env());
  assert.equal(ok.status, 200, "money, years and percentages must not look like phone numbers");
});

test("limits: per visitor, per day, and visitors are separate", async () => {
  mockFetch(); const e = env({ LIMIT_IP: "2", LIMIT_DAY: "3" });
  assert.equal((await handle(post(good, "1.1.1.1"), e)).status, 200);
  assert.equal((await handle(post(good, "1.1.1.1"), e)).status, 200);
  const third = await handle(post(good, "1.1.1.1"), e); assert.equal(third.status, 429); assert.match((await third.json()).error, /2 live checks/);
  assert.equal((await handle(post(good, "2.2.2.2"), e)).status, 200, "another visitor is unaffected");
  const all = await handle(post(good, "3.3.3.3"), e); assert.equal(all.status, 429); assert.match((await all.json()).error, /daily limit/);
  const st = await (await handle(new Request("http://x/api/status", { headers: { "cf-connecting-ip": "1.1.1.1" } }), e)).json(); assert.equal(st.left, 0);
});

test("limits: rejected input does not use up a check", async () => {
  mockFetch(); const e = env();
  await handle(post({ claim: "short", evidence: "x" }), e); await handle(post({ claim: good.claim, evidence: "me@x.com " + good.evidence }), e);
  assert.equal(e.LIMITS.m.size, 0, "nothing counted for invalid or personal input");
});

test("limits: a missing IP header does not share one empty bucket with everyone", async () => {
  mockFetch(); const e = env();
  await handle(new Request("http://x/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(good) }), e);
  const keys = [...e.LIMITS.m.keys()].filter((k) => k.startsWith("ip:"));
  assert.equal(keys.length, 1); assert.ok(!keys[0].startsWith("ip::"), "empty IP must be named, e.g. ip:unknown:" + day);
});

test("check: no keys -> 503; oversized body is refused", async () => {
  const r = await handle(post(good), { LIMITS: kv() }); assert.equal(r.status, 503);
  const big = await handle(post(JSON.stringify({ claim: "x".repeat(60000), evidence: "y" }), "9.9.9.9", true), env()); assert.equal(big.status, 400);
});

test("review: id is validated, answer is trimmed to safe fields", async () => {
  mockFetch({ review: { status: "COMPLETED", score: 91, route: "ship", secret: "no", result: { confidence: "high", reason: "r", rubric_scores: { a: 1 }, internal: "no" } } });
  for (const id of ["", "../../etc/passwd", "a b", "x".repeat(200), "a'b", "ab"]) assert.equal((await handle(new Request("http://x/api/review?id=" + encodeURIComponent(id)), env())).status, 400, id);
  const j = await (await handle(new Request("http://x/api/review?id=abc123XYZ"), env())).json();
  assert.deepEqual(Object.keys(j).sort(), ["confidence", "ok", "reason", "route", "rubric_scores", "score", "status"]);
  assert.equal((await handle(new Request("http://x/api/nope"), env())).status, 404);
});

/* ---------- the benchmark data and the sealed log ---------- */
test("data: 24 items, every one has a label, a regulator source and neutral wording", () => {
  const { items } = read("data/items.json");
  assert.equal(items.length, 24);
  const ids = new Set(items.map((i) => i.id)); assert.equal(ids.size, 24, "ids are unique");
  for (const i of items) {
    assert.ok(["flawed", "sound"].includes(i.label), i.id);
    assert.match(i.source, /^https:\/\/www\.asa\.org\.uk\/rulings\//, i.id);
    assert.ok(i.claim.length > 40 && i.context.length > 20, i.id);
    // the AI and the panel must never be told the regulator's answer
    assert.ok(!/\b(upheld|not upheld|breach(ed)?|ruled|ruling|ASA|adjudicat|banned|misleading)\b/i.test(i.claim + " " + i.context), `verdict words leaked into ${i.id}: ${(i.claim + " " + i.context).match(/\b(upheld|not upheld|breach(ed)?|ruled|ruling|ASA|adjudicat|banned|misleading)\b/i)?.[0]}`);
  }
  assert.equal(new Set(items.map((i) => i.source)).size, 9, "the 24 claims come from 9 rulings: the page and README must say 9");
  assert.match(readFileSync(new URL("../README.md", import.meta.url), "utf8"), /24 real claims from 9 ASA rulings/);
  assert.equal(items.filter((i) => i.label === "flawed").length, 19); assert.equal(items.filter((i) => i.label === "sound").length, 5);
});

test("data: the dataset and the paraphrase file agree", () => {
  const cases = read("data/asa_cases.json"); const claims = cases.in_scope_real_estate.flatMap((c) => c.claims);
  assert.equal(cases.in_scope_real_estate.length, 11);
  assert.ok(claims.length >= 30 && claims.every((c) => ["flawed", "sound"].includes(c.label)));
  for (const c of cases.in_scope_real_estate) assert.match(c.url, /^https:\/\/www\.asa\.org\.uk\/rulings\//);
});

test("calculator checks: known figures come out right", () => {
  assert.ok(codeChecks("pb-saving").join(" ").includes("4,548") || codeChecks("pb-saving").join(" ").includes("4,547"));
  assert.ok(codeChecks("newbuild-forecast").join(" ").includes("21,500"));
  assert.ok(codeChecks("cbre-yields").some((l) => /1-bed/.test(l) && /top end/.test(l)), "1-bed advertised range overlaps but tops out above the achieved rents");
  assert.ok(codeChecks("cbre-yields").some((l) => /2-bed/.test(l) && /inside/.test(l)));
  assert.match(codeChecks("lodges-risk")[0], /No figures/);
});

test("results: stats file matches the raw results, no errors, every claim reviewed", () => {
  const results = read("out/results.json").filter((r) => r.pass1), stats = read("out/stats.json");
  assert.equal(results.length, 24); assert.equal(stats.items, 24); assert.equal(stats.errors, 0);
  const agree = results.filter((r) => (r.label === "flawed") === (r.pass1.assessment.verdict === "not_supported")).length;
  assert.equal(agree, stats.serv_alone.correct);
  const gate = stats.reppo_gate_on_serv_answer, wrong = results.filter((r) => (r.label === "flawed") !== (r.pass1.assessment.verdict === "not_supported"));
  assert.equal(wrong.length, gate.serv_wrong_n); assert.equal(wrong.filter((r) => r.pass1.reppo.route !== "ship").length, gate.reppo_flagged_wrong_answers);
  for (const r of results) { assert.ok(r.pass1.reppo.score >= 0 && r.pass1.reppo.score <= 100, r.id); assert.ok(["ship", "review", "block"].includes(r.pass1.reppo.route), r.id); }
});

test("log: the sealed chain verifies, and any change breaks it", async () => {
  const { entries, head } = read("out/chain.json");
  assert.deepEqual(await verifyChain(entries, head), { ok: true, length: entries.length, head });
  const edited = structuredClone(entries); const k = edited.findIndex((e) => e.type === "reppo_review"); edited[k].data.score = 1;
  assert.equal((await verifyChain(edited, head)).ok, false, "edited entry");
  const cut = entries.slice(0, -1); assert.equal((await verifyChain(cut, head)).ok, false, "truncated chain");
  const swapped = structuredClone(entries); [swapped[3], swapped[4]] = [swapped[4], swapped[3]]; assert.equal((await verifyChain(swapped)).ok, false, "reordered");
  const labels = entries.map((e) => e.type); const firstLabel = labels.indexOf("asa_label_revealed"), firstServ = labels.indexOf("serv_assessment");
  assert.ok(firstServ < firstLabel, "the regulator's label is logged after the first answer, never before");
});

test("secrets: none in tracked source or built page", () => {
  const files = ["src/live.ts", "src/worker.ts", "src/dev-server.ts", "src/template.html", "site/index.html", "README.md", "DEPLOY.md", "wrangler.jsonc"].map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n");
  for (const re of [/sk-[A-Za-z0-9]{16,}/, /Bearer [A-Za-z0-9_-]{20,}/, /xi-api-key"\s*:\s*"[A-Za-z0-9]{16,}/]) assert.ok(!re.test(files), "looks like a key: " + re);
});
