// Browser tests: every button, state and screen size. The live API is always replaced by canned replies (no credits).
// Needs playwright-core and a Chromium: set CHROME_PATH (and PW_PATH if playwright-core is not installed here).
// Run: node test/e2e.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => JSON.parse(readFileSync(root + p, "utf8"));
const stats = read("out/stats.json"), chain = read("out/chain.json");
const KIT = "C:/Users/IBN/Documents/Claude/demo-video-kit/node_modules/playwright-core/index.mjs";
const { existsSync } = await import("node:fs");
const { chromium } = await import(process.env.PW_PATH || (existsSync(KIT) ? "file:///" + KIT : "playwright-core"));
const CHROME = process.env.CHROME_PATH || "C:\\Users\\IBN\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe";
const PORT = 4199, BASE = process.env.E2E_BASE || `http://127.0.0.1:${PORT}/`; // set E2E_BASE to test a deployed copy (the API is always faked)

const server = process.env.E2E_BASE ? { kill() {} } : spawn(process.execPath, ["src/dev-server.ts"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

let pass = 0, fail = 0; const failures = [];
const section = (s) => console.log("\n" + s);
async function ok(name, fn) {
  try { await fn(); pass++; console.log("  ✔ " + name); } catch (e) { fail++; failures.push(name + ": " + e.message); console.log("  ✖ " + name + "\n      " + e.message.split("\n")[0]); }
}
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const truthy = (v, m) => { if (!v) throw new Error(m || "falsy"); };

const CHECK = { ok: true, calcs: [{ label: "Commission at 1.5%", expression: "303190*1.5%", value: 4547.85, display: "4,547.85" }], assessment: { verdict: "not_supported", confidence: 0.98, reasoning: "The evidence does not support the stated saving.", missing_or_unsupported: ["No sales data", "No basis shown"] }, reppoId: "abc123XYZ", reppoError: null, left: 1 };
const REVIEW = { ok: true, status: "COMPLETED", score: 100, route: "ship", confidence: "high", reason: "Perfect consensus.", rubric_scores: { safety: 100, factual_accuracy: 100 } };

async function open({ w = 1366, h = 768, scheme = "dark", reduced = false, api = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference", locale: "en-GB" });
  const page = await ctx.newPage(); const errors = [], requests = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  let polls = 0;
  await page.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()); requests.push(u.pathname);
    if (u.pathname === "/api/status") return route.fulfill({ json: api.status ?? { live: true, left: 2, per_visitor: 2 } });
    if (u.pathname === "/api/check") { if (api.checkAbort) return route.abort(); return route.fulfill({ status: api.checkStatus ?? 200, json: api.check ?? CHECK }); }
    if (u.pathname === "/api/review") { polls++; return route.fulfill({ json: polls < (api.pollsBefore ?? 2) ? { ok: true, status: "PROCESSING", score: null, route: null } : (api.review ?? REVIEW) }); }
    return route.abort();
  });
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForSelector("#list details"); await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors, requests };
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* ================================================================ 1. loads clean */
section("1. page loads cleanly");
{
  const { ctx, page, errors } = await open();
  await ok("title, language, headline, meta tags", async () => {
    truthy((await page.title()).includes("Porkies"), "title"); eq(await page.getAttribute("html", "lang"), "en");
    eq(await page.textContent("h1"), "Can an AI spot a misleading property ad?");
    truthy(await page.getAttribute('meta[name="description"]', "content"), "meta description"); truthy(await page.getAttribute('meta[name="viewport"]', "content"), "viewport"); truthy(await page.getAttribute('link[rel="icon"]', "href"), "favicon");
  });
  await ok("no console errors or page errors", async () => eq(errors.length, 0, errors.join(" | ")));
  await ok("exactly one h1 and a sensible heading order", async () => { eq(await page.locator("h1").count(), 1); eq(await page.locator("h2").count(), 6, "h2 count (try, results, how, claims, verify, limits)"); });
  await ok("hero photo is served and applied", async () => { const r = await page.request.get(BASE + "img/london-sunset.jpg"); eq(r.status(), 200); truthy(/london-sunset/.test(await page.evaluate(() => getComputedStyle(document.querySelector(".photo")).backgroundImage)), "photo background"); });
  await ok("browser-safety headers are sent with the page and the API", async () => {
    for (const path of ["", "api/status"]) { const h = (await page.request.get(BASE + path)).headers(); eq(h["x-content-type-options"], "nosniff", path); eq(h["x-frame-options"], "DENY", path); truthy(h["referrer-policy"], "referrer-policy " + path); truthy(/camera=\(\)/.test(h["permissions-policy"] || ""), "permissions-policy " + path); }
  });
  await ok("the demo video link works and is a real MP4", async () => {
    const href = await page.getAttribute("a.cta2", "href"); eq(await page.getAttribute("a.cta2", "target"), "_blank"); truthy(/noopener/.test(await page.getAttribute("a.cta2", "rel")), "noopener");
    const r = await page.request.get(new URL(href, BASE).href, { headers: { range: "bytes=0-1023" }, timeout: 180000 }); truthy([200, 206].includes(r.status()), "video status " + r.status());
    truthy(/video\/mp4/.test(r.headers()["content-type"] || ""), "content type " + r.headers()["content-type"]);
    const total = Number((r.headers()["content-range"] || "").split("/")[1] || r.headers()["content-length"] || 0); truthy(total > 1e6, "video size " + total);
    const head = (await r.body()).subarray(4, 8).toString("latin1"); eq(head, "ftyp", "not an MP4 container");
  });
  await ok("template and unknown routes are not public", async () => { eq((await page.request.get(BASE + "template.html")).status(), 404); eq((await page.request.get(BASE + "_headers")).status(), 404); eq((await page.request.get(BASE + "src/live.ts")).status(), 404); eq((await page.request.get(BASE + "../.env")).status(), 404); eq((await page.request.get(BASE + "%2e%2e/.env")).status(), 404); });
  await ctx.close();
}

/* ================================================================ 2. layout */
section("2. layout at four screen sizes");
for (const [w, h] of [[375, 812], [768, 1024], [1366, 768], [1920, 1080]]) {
  const { ctx, page } = await open({ w, h });
  await ok(`${w}x${h}: no sideways scrolling`, async () => { const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); truthy(sw <= cw, `scrollWidth ${sw} > ${cw}`); });
  if (w >= 1024) await ok(`${w}x${h}: the whole first screen (menu, headline, text, button, badge) fits without scrolling`, async () => {
    const b = await page.evaluate(() => ["nav", ".hero h1", ".lede", ".cta", "#badge"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; }));
    for (const [s, top, bottom, left, right] of b) truthy(top >= -2 && bottom <= h + 2 && left >= -2 && right <= w + 2, `${s} is outside the first screen: top ${top} bottom ${bottom} of ${h}`);
  });
  await ok(`${w}x${h}: every button and link is at least 40px tall`, async () => {
    const small = await page.evaluate(() => [...document.querySelectorAll("button, a.pill, a.cta, .ex, summary")].filter((e) => e.offsetHeight > 0 && e.offsetHeight < 40).map((e) => (e.textContent.trim().slice(0, 20) || e.className) + ":" + e.offsetHeight));
    eq(small.length, 0, small.join(", "));
  });
  await ok(`${w}x${h}: text inputs are 16px or larger (no iOS zoom)`, async () => eq(await page.evaluate(() => Math.min(...[...document.querySelectorAll("textarea")].map((t) => parseFloat(getComputedStyle(t).fontSize)))) >= 16, true));
  await ctx.close();
}

/* ================================================================ 3. navigation */
section("3. navigation");
{
  const { ctx, page } = await open();
  for (const [label, id] of [["Try it", "try"], ["Results", "results"], ["Claims", "claims"], ["Verify", "verify"], ["Limits", "limits"]]) {
    await ok(`menu button "${label}" scrolls to its section and highlights`, async () => {
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
      await page.click(`a.pill:has-text("${label}")`); await page.waitForTimeout(1500);
      const top = await page.evaluate((i) => Math.round(document.getElementById(i).getBoundingClientRect().top), id);
      truthy(top > -60 && top < 260, `section top at ${top}`);
      eq(await page.getAttribute(`a.pill[href="#${id}"]`, "aria-current"), "true", "highlight");
    });
  }
  await ok('the main button "Try it yourself" goes to the Try it section', async () => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300); await page.click("a.cta"); await page.waitForTimeout(1500); truthy((await page.evaluate(() => document.getElementById("try").getBoundingClientRect().top)) < 260, "did not reach #try"); });
  await ctx.close();
  const fresh = await open();
  await ok("keyboard: on a fresh page Tab reaches the menu buttons first, in order, with a visible focus ring", async () => {
    await fresh.page.keyboard.press("Tab");
    const seen = []; for (let i = 0; i < 6; i++) { seen.push(await fresh.page.evaluate(() => document.activeElement?.textContent.trim().slice(0, 14))); if (i === 0) truthy((await fresh.page.evaluate(() => getComputedStyle(document.activeElement).boxShadow)) !== "none", "no focus ring"); await fresh.page.keyboard.press("Tab"); }
    eq(seen.slice(0, 5).join("|"), "Try it|Results|Claims|Verify|Limits");
  });
  await ok("keyboard: an example button and the check button work with Enter and Space", async () => {
    await fresh.page.focus("#t-examples .ex"); await fresh.page.keyboard.press("Enter"); truthy((await fresh.page.inputValue("#t-claim")).length > 40, "Enter on example");
    await fresh.page.focus("#t-examples .ex:nth-child(3)"); await fresh.page.keyboard.press("Space"); truthy((await fresh.page.inputValue("#t-claim")).includes("energy"), "Space on example");
    await fresh.page.focus("#reveal"); await fresh.page.keyboard.press("Space"); eq(await fresh.page.locator(".band .lab-hide:visible").count(), 24, "toggle by keyboard");
  });
  await fresh.ctx.close();
}

/* ================================================================ 4. results and claims */
section("4. results and claim cards");
{
  const { ctx, page } = await open();
  await ok("the four result cards show the real numbers from the run", async () => {
    const t = await page.textContent("#cards"); eq(await page.locator("#cards .card").count(), 4);
    truthy(t.includes(`${stats.serv_alone.correct} of ${stats.items}`), "AI agreement"); truthy(t.includes(`${stats.reppo_gate_on_serv_answer.reppo_false_flags} of ${stats.reppo_gate_on_serv_answer.serv_right_n}`), "false flags"); truthy(t.includes(`${stats.reppo_gate_on_serv_answer.reppo_flagged_wrong_answers} of ${stats.reppo_gate_on_serv_answer.serv_wrong_n}`), "caught mistakes");
  });
  await ok("the headline numbers say 24 claims, matching the data", async () => { truthy((await page.textContent(".lede")).includes(`${stats.items} of those claims`), "lede"); truthy((await page.textContent("#bBig")).includes(`${stats.items} ads checked`), "badge"); eq(await page.locator("#list details").count(), stats.items); });
  await ok("every claim card has a band, a plain title (not an internal id), three pipeline steps and a source link", async () => {
    const info = await page.evaluate(() => [...document.querySelectorAll("#list details")].map((d) => ({ title: d.querySelector("h3").textContent, band: !!d.querySelector(".band"), nodes: d.querySelectorAll(".pipe .node").length, link: d.querySelector(".body a")?.href, target: d.querySelector(".body a")?.target, rel: d.querySelector(".body a")?.rel })));
    eq(new Set(info.map((i) => i.title)).size, stats.items, "unique titles");
    for (const i of info) { truthy(i.band && i.nodes === 3, i.title); truthy(!/^[a-z]+-[a-z0-9-]+$/.test(i.title), "raw id as title: " + i.title); truthy(/^https:\/\/www\.asa\.org\.uk\/rulings\//.test(i.link), "ASA link " + i.link); eq(i.target, "_blank"); truthy(/noopener/.test(i.rel), "noopener"); }
  });
  await ok("agree and disagree strips match the stats exactly", async () => { eq(await page.locator(".agree.yes").count(), stats.serv_alone.correct); eq(await page.locator(".agree.no").count(), stats.items - stats.serv_alone.correct); });
  await ok('"Show what the watchdog decided" hides and restores the verdicts', async () => {
    eq(await page.locator(".band .lab-show:visible").count(), 24);
    await page.uncheck("#reveal"); eq(await page.locator(".band .lab-show:visible").count(), 0, "labels hidden"); eq(await page.locator(".band .lab-hide:visible").count(), 24, "hidden-state labels"); eq(await page.locator(".agree:visible").count(), 0, "agree strips hidden");
    await page.check("#reveal"); eq(await page.locator(".band .lab-show:visible").count(), 24, "restored"); eq(await page.locator(".agree:visible").count(), 24);
  });
  await ok("opening a card shows evidence, sums, the AI's verdict and the panel's review; closing works", async () => {
    const d = page.locator("#list details").first(); await d.locator("summary").click(); truthy(await d.evaluate((e) => e.open), "open");
    const t = await d.textContent(); for (const s of ["The evidence we gave the AI", "Checked by a calculator", "The AI’s verdict", "The second-opinion panel"]) truthy(t.includes(s), "missing section: " + s);
    await d.locator("summary").click(); await page.waitForTimeout(450); truthy(!(await d.evaluate((e) => e.open)), "close");
  });
  await ok("all 24 cards open without errors and no field shows 'undefined' or 'null'", async () => {
    await page.evaluate(() => document.querySelectorAll("#list details").forEach((d) => (d.open = true)));
    // the structured fields (titles, bands, pipeline, scores), not the AI's free prose, which may legitimately contain the word "undefined"
    const fields = await page.evaluate(() => [...document.querySelectorAll("#list .band, #list .cbody h3, #list .kind, #list .pipe, #list .agree, #list .body h3, #list .body p.num")].map((e) => e.textContent).join(" | "));
    truthy(!/\bundefined\b|\bnull\b|\bNaN\b|\[object/.test(fields), "bad field text: " + (fields.match(/.{20}(undefined|null|NaN|\[object).{20}/) || [""])[0]);
  });
  await ctx.close();
}

/* ================================================================ 4b. glance tiles and filters */
section("4b. the 24 at a glance, and the filters");
{
  const { ctx, page } = await open();
  const visibleCards = () => page.locator("#list details:visible").count();
  const fv = (label) => page.locator("#fv button", { hasText: label }).first();
  const fk = (label) => page.locator("#fk button", { hasText: label }).first();
  const reset = async () => { await fv(/^All/).click(); await fk(/^All/).click(); };
  await ok("24 tiles, coloured by whether the AI agreed, each with a clear label", async () => {
    eq(await page.locator("button.tile").count(), stats.items); eq(await page.locator("button.tile.t-ok").count(), stats.serv_alone.correct); eq(await page.locator("button.tile.t-bad").count(), stats.items - stats.serv_alone.correct);
    const labels = await page.$$eval("button.tile", (b) => b.map((x) => x.getAttribute("aria-label"))); truthy(labels.every((l) => /Open this claim/.test(l) && /watchdog (misleading|fair)/.test(l)), "tile labels"); eq(new Set(labels).size, stats.items, "unique labels");
  });
  await ok("filter chips show the real counts and filter the cards", async () => {
    const want = { Misleading: stats.asa_flawed, Fair: stats.asa_sound, "AI disagreed": stats.items - stats.serv_alone.correct };
    for (const [label, n] of Object.entries(want)) { const chip = fv(label); truthy((await chip.textContent()).includes(String(n)), `${label} chip count`); await chip.click(); eq(await visibleCards(), n, label); eq(await page.locator("button.tile.dim").count(), stats.items - n, label + " dimmed tiles"); truthy((await page.textContent("#count")).includes(`Showing ${n} of ${stats.items}`), "count text"); await reset(); }
    for (const [label, n] of Object.entries({ Numbers: 9, Comparisons: 10, Omissions: 5 })) { const chip = fk(label); truthy((await chip.textContent()).includes(String(n)), `${label} chip count`); await chip.click(); eq(await visibleCards(), n, label); await reset(); }
    eq(await visibleCards(), stats.items); truthy((await page.textContent("#count")).includes("Showing all 24"));
  });
  await ok("filters combine, and an impossible combination shows a friendly empty message", async () => {
    await fv("Fair").click(); await fk("Omissions").click(); eq(await visibleCards(), 1, "fair + omissions"); await reset();
    await fv("Misleading").click(); await fk("Omissions").click(); eq(await visibleCards(), 4, "misleading + omissions"); await reset();
    await fv("Fair").click(); await fk("Numbers").click(); eq(await visibleCards(), 1, "fair + numbers"); await reset();
    await fv("AI disagreed").click(); await fk("Comparisons").click(); eq(await visibleCards(), 2, "AI disagreed + comparisons"); await reset();
    await fv("AI disagreed").click(); await fk("Omissions").click(); eq(await visibleCards(), 1, "AI disagreed + omissions"); await reset();
    await fv("AI disagreed").click(); await fk("Numbers").click();
    eq(await visibleCards(), 0, "the AI never got a numbers claim wrong, so this combination is empty"); eq(await page.locator("#empty").isVisible(), true, "empty message"); truthy(/No claims match/.test(await page.textContent("#empty")));
    await reset(); eq(await page.locator("#empty").isVisible(), false); eq(await visibleCards(), 24);
  });
  await ok("chips report their state to screen readers (aria-pressed)", async () => {
    eq(await page.locator("#fv button[aria-pressed=true]").count(), 1); eq(await page.locator("#fk button[aria-pressed=true]").count(), 1);
    await fv("Fair").click(); eq(await fv("Fair").getAttribute("aria-pressed"), "true"); eq(await fv(/^All/).getAttribute("aria-pressed"), "false"); await reset();
  });
  await ok("hiding the watchdog's verdict hides it on the tiles too, and picking a verdict filter reveals it again", async () => {
    await page.uncheck("#reveal");
    truthy(await page.$$eval("button.tile", (b) => b.every((x) => !/watchdog (misleading|fair)/.test(x.getAttribute("aria-label") + x.title))), "labels must not leak the verdict"); eq(await page.locator("button.tile svg:visible").count(), 0, "glyphs hidden");
    await fv("Misleading").click(); eq(await page.isChecked("#reveal"), true, "revealed again"); eq(await page.evaluate(() => document.body.classList.contains("veiled")), false); await reset();
  });
  await ok("pressing a tile scrolls to its card, opens it and highlights it", async () => {
    const tile = page.locator("button.tile").nth(7); const id = await tile.getAttribute("data-id"); await tile.click(); await page.waitForTimeout(1300);
    const info = await page.evaluate((i) => { const d = document.getElementById("c-" + i); const r = d.getBoundingClientRect(); return { open: d.open, top: r.top, bottom: r.bottom, vh: innerHeight, ping: d.classList.contains("ping") }; }, id);
    truthy(info.open, "card should be open"); truthy(info.ping, "card should be highlighted"); truthy(info.top < info.vh && info.bottom > 0, `card should be on screen ${JSON.stringify(info)}`);
  });
  await ok("a tile for a filtered-out card clears the filters first", async () => {
    await fv("Fair").click(); const dimmed = page.locator("button.tile.dim").first(); const id = await dimmed.getAttribute("data-id"); await dimmed.click(); await page.waitForTimeout(1300);
    eq(await page.evaluate((i) => !document.getElementById("c-" + i).hidden, id), true, "card visible"); eq(await visibleCards(), 24, "filters cleared");
  });
  await ok("hovering a card lights up its tile", async () => {
    const card = page.locator("#list details").nth(2); await card.scrollIntoViewIfNeeded(); await card.hover(); const id = await card.getAttribute("data-id");
    truthy(await page.evaluate((i) => document.querySelector(`button.tile[data-id="${i}"]`).classList.contains("hot"), id), "tile should be hot");
  });
  await ok("keyboard: a tile opens its card with Enter", async () => {
    await page.focus("button.tile >> nth=2"); await page.keyboard.press("Enter"); await page.waitForTimeout(1200);
    const id = await page.getAttribute("button.tile >> nth=2", "data-id"); truthy(await page.evaluate((i) => document.getElementById("c-" + i).open, id), "opened by keyboard");
  });
  await ok("every case file shows the log entry it was sealed in, and it matches the real chain", async () => {
    await page.evaluate(() => document.querySelectorAll("#list details").forEach((d) => (d.open = true)));
    const seals = await page.$$eval(".seal span", (s) => s.map((x) => x.textContent)); eq(seals.length, 24); truthy(seals.every((s) => /^Sealed in log entry \d+ · [0-9a-f]{10}…[0-9a-f]{6}$/.test(s)), seals[0]);
    const n = Number(seals[0].match(/entry (\d+)/)[1]); truthy(chain.entries.some((e) => e.n === n && e.type === "item" && seals[0].includes(e.hash.slice(0, 10))), "seal line matches the real chain");
  });
  await ctx.close();
}

/* ================================================================ 4c. motion */
section("4c. animation (and its off switch)");
{
  const m = await open({ h: 700 });
  await ok("with motion on: cards below the fold start hidden and fade in as they scroll into view", async () => {
    eq(await m.page.evaluate(() => document.documentElement.classList.contains("js-anim")), true);
    const lastOpacity = () => m.page.evaluate(() => getComputedStyle([...document.querySelectorAll("#list details")].at(-1)).opacity);
    eq(Number(await lastOpacity()), 0, "last card before scrolling");
    await m.page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; [...document.querySelectorAll("#list details")].at(-1).scrollIntoView({ block: "center" }); }); await m.page.waitForTimeout(1800);
    eq(Number(await lastOpacity()), 1, "last card after scrolling");
  });
  await ok("the pipeline line and dots animate in with the card", async () => {
    const d = m.page.locator("#list details").last(); const w = await d.evaluate((e) => getComputedStyle(e.querySelector(".pipe"), "::after").transform); truthy(w === "matrix(1, 0, 0, 1, 0, 0)" || w === "none", "line drawn: " + w);
    eq(await d.evaluate((e) => getComputedStyle(e.querySelector(".dot")).opacity), "1");
  });
  await ok("a case file opens and closes with a short slide and ends in the right state", async () => {
    const d = m.page.locator("#list details").nth(5); await d.scrollIntoViewIfNeeded(); await d.locator("summary").click(); truthy(await d.evaluate((e) => e.open), "open at once"); await m.page.waitForTimeout(400);
    truthy((await d.locator(".body").boundingBox()).height > 100, "body has height"); await d.locator("summary").click(); await m.page.waitForTimeout(40); truthy(await d.evaluate((e) => e.open), "still open while sliding shut"); await m.page.waitForTimeout(450); truthy(!(await d.evaluate((e) => e.open)), "closed at the end");
    await d.locator("summary").dblclick(); await m.page.waitForTimeout(700); eq(typeof (await d.evaluate((e) => e.open)), "boolean", "a double-click never leaves it half-open"); eq(await d.evaluate((e) => e.dataset.busy), undefined, "not stuck busy");
  });
  await ok("limit numbers count up to exactly the right value, and screen readers get the final number", async () => {
    await m.page.evaluate(async () => { document.documentElement.style.scrollBehavior = "auto"; for (const c of document.querySelectorAll(".limit")) { c.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 450)); } }); await m.page.waitForTimeout(1800);
    const vals = await m.page.$$eval(".limit .stat .cnt", (n) => n.map((x) => [x.textContent, x.dataset.to, x.previousElementSibling.textContent])); truthy(vals.length >= 5, "count-up numbers"); for (const [shown, to, sr] of vals) { eq(shown, to, "count-up end value"); eq(sr, to, "screen reader value"); }
  });
  await ok("the impact meters fill", async () => { const widths = await m.page.$$eval(".limit .meter i.on", (i) => i.map((x) => getComputedStyle(x, "::after").transform)); truthy(widths.length >= 10 && widths.every((w) => w === "matrix(1, 0, 0, 1, 0, 0)" || w === "none"), "filled meters: " + widths.slice(0, 3)); });
  await m.ctx.close();
  const r = await open({ reduced: true, h: 700 });
  await ok("reduced motion: no entrance animation, everything visible straight away, numbers final", async () => {
    eq(await r.page.evaluate(() => document.documentElement.classList.contains("js-anim")), false);
    eq(Number(await r.page.evaluate(() => getComputedStyle([...document.querySelectorAll("#list details")].at(-1)).opacity)), 1, "card opacity"); eq(Number(await r.page.evaluate(() => getComputedStyle(document.querySelector(".limit")).opacity)), 1);
    const vals = await r.page.$$eval(".limit .stat .cnt", (n) => n.map((x) => [x.textContent, x.dataset.to])); for (const [a, b] of vals) eq(a, b, "final number straight away");
    const d = r.page.locator("#list details").first(); await d.locator("summary").click(); truthy(await d.evaluate((e) => e.open), "opens at once"); await d.locator("summary").click(); truthy(!(await d.evaluate((e) => e.open)), "closes at once");
  });
  await r.ctx.close();
}

/* ================================================================ 4d. what this does not prove */
section("4d. what this does not prove");
{
  const { ctx, page } = await open();
  await ok("seven limit cards, each says what we did about it, and the section says the ratings are our judgement", async () => {
    eq(await page.locator(".limit").count(), 7); eq(await page.locator(".limit .did").count(), 7); truthy(/our own judgement/.test(await page.textContent("#limits .sec-lede")), "judgement note");
    const t = await page.textContent("#limitsGrid"); for (const s of ["Small test", "The panel did not help here", "Our wording", "A possible head start", "Knowing the rules", "One regulator, one country", "Reused code"]) truthy(t.includes(s), "missing: " + s);
  });
  await ok("the numbers on the cards are the real ones (9 rulings, 23 of 24 approved, 0 of 3 caught)", async () => {
    const t = await page.textContent("#limitsGrid"); truthy(t.includes("Only 24 claims from 9 rulings"), "9 rulings"); truthy(t.includes("approved 23 of 24"), "23 of 24"); truthy(t.includes(`${stats.reppo_gate_on_serv_answer.reppo_flagged_wrong_answers} of ${stats.reppo_gate_on_serv_answer.serv_wrong_n}`), "caught"); truthy(!/\b11 rulings\b/.test(await page.textContent("body")), "the old 11 rulings must be gone");
  });
  await ok("impact chips filter the cards (all 7, high 2, medium 4, low 1) and report their state", async () => {
    for (const [l, n] of [["High", 2], ["Medium", 4], ["Low", 1]]) { await page.locator("#fi button", { hasText: l }).click(); eq(await page.locator(".limit:visible").count(), n, l); eq(await page.locator("#fi button", { hasText: l }).getAttribute("aria-pressed"), "true"); truthy((await page.textContent("#icount")).includes(`${n} of 7`), "count text"); }
    await page.locator("#fi button", { hasText: /^All/ }).click(); eq(await page.locator(".limit:visible").count(), 7);
  });
  await ok("each card has an accessible impact rating", async () => { const labels = await page.$$eval(".limit .meter", (m) => m.map((x) => x.getAttribute("aria-label"))); eq(labels.length, 7); truthy(labels.every((l) => /^Could change the result: (High|Medium|Low)$/.test(l)), labels.join("|")); });
  await ctx.close();
  const ph = await open({ w: 375, h: 812 });
  await ok("375px: both sections fit without sideways scrolling and the tiles stay inside the screen", async () => { const [sw, cw] = await ph.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); truthy(sw <= cw, `${sw} > ${cw}`); truthy(await ph.page.evaluate(() => [...document.querySelectorAll("button.tile")].every((b) => b.getBoundingClientRect().right <= innerWidth + 1)), "tiles inside the screen"); });
  await ph.ctx.close();
}

/* ================================================================ 5. the log */
section("5. tamper-evident log");
{
  const { ctx, page } = await open();
  await ok("the fingerprint on the page is the real head of the sealed chain", async () => eq((await page.textContent("#head")).trim(), chain.head));
  await ok('"Check the log" confirms every entry', async () => { await page.click("#verify-btn"); await page.waitForFunction(() => /intact/.test(document.querySelector("#vout").textContent)); truthy((await page.textContent("#vout")).includes(`${chain.entries.length} entries`)); });
  await ok('"Tamper with one entry" makes the check fail, and the real chain stays valid afterwards', async () => {
    await page.click("#tamper"); await page.waitForFunction(() => /fails/.test(document.querySelector("#vout").textContent)); truthy(/changed/.test(await page.textContent("#vout")));
    await page.click("#verify-btn"); await page.waitForFunction(() => /intact/.test(document.querySelector("#vout").textContent));
  });
  await ctx.close();
}

/* ================================================================ 6. Try it */
section("6. Try it (live checker, with canned API replies)");
{
  const { ctx, page, requests } = await open();
  await ok("four examples; each fills both boxes and the counters", async () => {
    eq(await page.locator("#t-examples .ex").count(), 4);
    for (let i = 0; i < 4; i++) { await page.locator("#t-examples .ex").nth(i).click(); truthy((await page.inputValue("#t-claim")).length > 40 && (await page.inputValue("#t-ev")).length > 20, "example " + i); truthy(/^\d+\/1200$/.test(await page.textContent("#t-c1")) && !(await page.textContent("#t-c1")).startsWith("0/"), "counter"); }
  });
  await ok("an empty form cannot be submitted and makes no request", async () => { await page.fill("#t-claim", ""); await page.fill("#t-ev", ""); await page.click("#t-go"); eq(requests.filter((r) => r === "/api/check").length, 0); truthy(!(await page.evaluate(() => document.querySelector("#tryform").checkValidity())), "form should be invalid"); });
  await ok("shows how many checks are left", async () => truthy(/2 live checks left today/.test(await page.textContent("#t-left")), await page.textContent("#t-left")));
  await ok("full run: calculator, AI verdict, waiting spinner, panel review, final sentence, button resets", async () => {
    await page.locator("#t-examples .ex").nth(1).click(); await page.click("#t-go");
    await page.waitForFunction(() => document.querySelector("#t-go").disabled && document.querySelector("#t-go").textContent === "Checking…");
    await page.waitForSelector("#t-out .step:nth-child(3) .spin", { timeout: 15000 });
    truthy((await page.textContent("#t-out")).includes("303190*1.5% = 4,547.85"), "sum shown"); truthy((await page.textContent("#t-out")).includes("Not backed up"), "verdict shown");
    await page.waitForFunction(() => /Result:/.test(document.querySelector("#t-out").innerText), null, { timeout: 30000 });
    const t = await page.innerText("#t-out"); truthy(/panel approved that answer/.test(t), t.slice(-200)); eq(await page.locator("#t-out .step").count(), 3);
    eq(await page.textContent("#t-go"), "Check this claim"); eq(await page.locator("#t-go").isDisabled(), false);
  });
  await ok("a second click while running sends only one request", async () => {
    const before = requests.filter((r) => r === "/api/check").length; await page.click("#t-go"); await page.click("#t-go", { force: true }).catch(() => {});
    await page.waitForFunction(() => /Result:/.test(document.querySelector("#t-out").innerText), null, { timeout: 30000 });
    eq(requests.filter((r) => r === "/api/check").length - before, 1, "requests sent");
  });
  await ctx.close();
}
for (const [name, api, expected] of [
  ["a refused claim (400) shows the reason and re-enables the button", { check: { ok: false, error: "That looks like it contains an email address or phone number." }, checkStatus: 400 }, /email address or phone/],
  ["the daily limit (429) is explained", { check: { ok: false, error: "You have used your 2 live checks for today." }, checkStatus: 429 }, /used your 2 live checks/],
  ["a server failure (502) is shown plainly", { check: { ok: false, error: "The AI is not answering right now (HTTP 500)" }, checkStatus: 502 }, /not answering/],
  ["no network: a friendly message, not a frozen page", { checkAbort: true }, /Could not reach the checker/],
  ["the panel being unavailable still shows the AI's verdict", { check: { ...CHECK, reppoId: null, reppoError: "The second-opinion service is out of credits right now." } }, /second opinion was not available/],
  ["the panel failing a review is reported", { review: { ok: true, status: "FAILED" }, pollsBefore: 1 }, /could not review this one/],
]) {
  const { ctx, page } = await open({ api });
  await ok(name, async () => {
    await page.locator("#t-examples .ex").nth(0).click(); await page.click("#t-go");
    await page.waitForFunction(() => !document.querySelector("#t-go").disabled, null, { timeout: 30000 });
    truthy(expected.test(await page.innerText("#t-out")), "got: " + (await page.innerText("#t-out")).slice(0, 160));
  });
  await ctx.close();
}
{
  const { ctx, page } = await open({ api: { status: { live: false, left: 0 } } });
  await ok("live checking switched off: the form is hidden and the page says so", async () => { await page.waitForTimeout(500); eq(await page.locator("#tryform").isVisible(), false); eq(await page.locator("#t-off").isVisible(), true); });
  await ctx.close();
}
{
  const evil = { ...CHECK, assessment: { ...CHECK.assessment, reasoning: '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>', missing_or_unsupported: ['<b onmouseover="window.__xss=3">x</b>'] }, calcs: [{ label: '<i onclick="window.__xss=4">l</i>', expression: "1+1", value: 2, display: "2" }] };
  const { ctx, page } = await open({ api: { check: evil, review: { ...REVIEW, reason: "<img src=x onerror=window.__xss=5>" } } });
  await ok("hostile text from the API is shown as text and never runs (XSS)", async () => {
    await page.locator("#t-examples .ex").nth(0).click(); await page.click("#t-go"); await page.waitForFunction(() => /Result:/.test(document.querySelector("#t-out").innerText), null, { timeout: 30000 });
    eq(await page.evaluate(() => window.__xss), undefined, "script ran"); truthy((await page.innerText("#t-out")).includes("<img src=x"), "should be visible as plain text"); eq(await page.locator("#t-out img, #t-out script, #t-out [onerror], #t-out [onclick], #t-out [onmouseover]").count(), 0, "injected elements or handlers");
  });
  await ctx.close();
}

/* ================================================================ 7. the swinging badge */
section("7. the hanging badge");
const angle = (page) => page.evaluate(() => { const m = getComputedStyle(document.getElementById("swing")).transform; if (m === "none") return 0; const v = m.match(/matrix\(([^)]+)\)/)[1].split(",").map(Number); return (Math.atan2(v[1], v[0]) * 180) / Math.PI; });
{
  const { ctx, page } = await open();
  await page.waitForTimeout(9000);
  await ok("the opening swing settles by itself", async () => truthy(Math.abs(await angle(page)) < 1.5, "angle " + (await angle(page))));
  await ok("hover sway: a normal sweep gives a gentle swing (2 to 20 degrees) that settles within 6 seconds", async () => {
    const b = await page.locator("#badge").boundingBox(); const y = b.y + b.height / 2;
    await page.mouse.move(b.x + 10, y); let max = 0; const t0 = Date.now();
    for (let i = 0; i < 12; i++) { await page.mouse.move(b.x + 10 + i * 18, y); await page.waitForTimeout(36); max = Math.max(max, Math.abs(await angle(page))); }
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(50); max = Math.max(max, Math.abs(await angle(page))); }
    truthy(max >= 2 && max <= 20, `peak ${max.toFixed(1)} degrees`);
    await page.mouse.move(5, 5); await page.waitForTimeout(6000); truthy(Math.abs(await angle(page)) < 1.5, "did not settle: " + (await angle(page)).toFixed(2));
  });
  await ok("a very fast flick is still capped (no violent swing)", async () => {
    const b = await page.locator("#badge").boundingBox(); const y = b.y + b.height / 2; await page.mouse.move(b.x + b.width - 5, y); let max = 0;
    for (let i = 0; i < 10; i++) { await page.mouse.move(b.x + b.width - 5 - i * 22, y); await page.waitForTimeout(30); max = Math.max(max, Math.abs(await angle(page))); }
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(40); max = Math.max(max, Math.abs(await angle(page))); }
    truthy(max <= 22, `peak ${max.toFixed(1)} degrees`); await page.mouse.move(5, 5); await page.waitForTimeout(6000);
  });
  await ok("dragging follows the cursor: drag right, the badge swings right (negative CSS rotation)", async () => {
    const b = await page.locator("#badge").boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 110, cy, { steps: 12 }); await page.waitForTimeout(150);
    const held = await angle(page); await page.mouse.up(); truthy(held < -3, `angle while dragged right: ${held.toFixed(1)}`);
    await page.waitForTimeout(6500); const b2 = await page.locator("#badge").boundingBox(); const lx = b2.x + b2.width / 2, ly = b2.y + b2.height / 2;
    await page.mouse.move(lx, ly); await page.mouse.down(); await page.mouse.move(lx - 110, ly, { steps: 12 }); await page.waitForTimeout(150); const left = await angle(page); await page.mouse.up(); truthy(left > 3, `angle dragged left: ${left.toFixed(1)}`);
  });
  await ctx.close();
  const r = await open({ reduced: true });
  await ok("reduced motion: the badge stays still", async () => {
    const b = await r.page.locator("#badge").boundingBox(); await r.page.mouse.move(b.x + 10, b.y + 100); for (let i = 0; i < 10; i++) { await r.page.mouse.move(b.x + 10 + i * 20, b.y + 100); await r.page.waitForTimeout(30); }
    await r.page.waitForTimeout(300); eq(Math.abs(await angle(r.page)) < 0.2, true, "angle " + (await angle(r.page)));
  });
  await r.ctx.close();
}

/* ================================================================ 8. colours and contrast */
section("8. text contrast (light and dark)");
for (const scheme of ["light", "dark"]) {
  const { ctx, page, errors } = await open({ scheme });
  await page.evaluate(() => document.querySelectorAll("#list details").forEach((d) => (d.open = true)));
  await ok(`${scheme}: body text, card text, bands and result numbers are readable (4.5:1 or better)`, async () => {
    const pairs = await page.evaluate(() => {
      const parse = (c) => c.match(/[\d.]+/g).slice(0, 4).map(Number); const solid = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor, p = parse(c); if (p.length < 4 || p[3] > 0.95) return p.slice(0, 3); el = el.parentElement; } return [255, 255, 255]; };
      const sel = [[".panel h2", "section heading"], ["#cards .card .k", "card label"], ["#cards .card .s", "card detail"], [".steps li span", "step text"], ["details.claim .cbody p", "claim text"], ["details.claim .cbody h3", "claim title"], ["details.claim .band.bad", "misleading band"], ["details.claim .band.ok", "fair band"], ["details.claim .agree.yes", "agree strip"], ["details.claim .agree.no", "disagree strip"], ["details.claim .node b", "pipeline label"], ["details.claim .body p", "opened text"], [".tryform label", "form label"], [".limit p", "limit text"], [".limit h3", "limit title"], [".limit .did", "what we did"], [".limit .stat", "limit number"], [".limit .meter", "limit meter label"], [".fchip", "filter chip"], [".glance .gk", "tile row label"], [".legend span", "legend"], [".sec-lede", "section intro"], [".seal", "log seal line"], ["#vout", "log result"], [".try .privacy", "privacy note"], ["#try .examples .ex", "example button"]];
      return sel.map(([s, n]) => { const e = document.querySelector(s); if (!e) return [n, null]; return [n, parse(getComputedStyle(e).color).slice(0, 3), solid(e), getComputedStyle(e).fontSize]; });
    });
    const bad = []; for (const [n, fg, bg] of pairs) { if (!fg) { bad.push(n + ": not found"); continue; } const r = ratio(fg, bg); if (r < 4.5) bad.push(`${n} ${r.toFixed(2)}`); }
    eq(bad.length, 0, bad.join("; "));
  });
  await ok(`${scheme}: no console errors`, async () => eq(errors.length, 0, errors.join("|")));
  await ctx.close();
}

await browser.close(); server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
