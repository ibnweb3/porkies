// Usage: node src/stats.ts   -> prints and writes out/stats.json
import { readFileSync, writeFileSync } from "node:fs";
import type { Record_ } from "./run.ts";

const recs = (JSON.parse(readFileSync("out/results.json", "utf8")) as Record_[]).filter((r) => r.pass1);
const truthVerdict = (r: Record_) => (r.label === "flawed" ? "not_supported" : "supported");
const flag = (route: string | null) => route !== "ship"; // review or block = the panel does not wave it through
const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

// 1. SERV alone vs the regulator
let tp = 0, fp = 0, fn = 0, tn = 0;
for (const r of recs) {
  const pred = r.pass1!.assessment.verdict === "not_supported";
  const real = r.label === "flawed";
  if (pred && real) tp++; else if (pred && !real) fp++; else if (!pred && real) fn++; else tn++;
}
const servAcc = rate(tp + tn, recs.length);

// 2. Reppo as a gate on SERV's answer
const servWrong = recs.filter((r) => r.pass1!.assessment.verdict !== truthVerdict(r));
const servRight = recs.filter((r) => r.pass1!.assessment.verdict === truthVerdict(r));
const caught = servWrong.filter((r) => flag(r.pass1!.reppo.route));
const falseFlags = servRight.filter((r) => flag(r.pass1!.reppo.route));
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// 3. After the feedback loop (revised answers replace first answers where a revision exists)
const finalVerdict = (r: Record_) => (r.pass2 ?? r.pass1!).assessment.verdict;
const finalCorrect = recs.filter((r) => finalVerdict(r) === truthVerdict(r)).length;
const revised = recs.filter((r) => r.pass2);
const changed = revised.filter((r) => r.pass2!.assessment.verdict !== r.pass1!.assessment.verdict);
const improved = changed.filter((r) => r.pass2!.assessment.verdict === truthVerdict(r));
const worsened = changed.filter((r) => r.pass2!.assessment.verdict !== truthVerdict(r));
const scoreUp = revised.filter((r) => (r.pass2!.reppo.score ?? 0) > (r.pass1!.reppo.score ?? 0));

const byGroup: Record<string, { n: number; servCorrect: number; reppoFlagged: number }> = {};
for (const r of recs) {
  const g = (byGroup[r.group] ??= { n: 0, servCorrect: 0, reppoFlagged: 0 });
  g.n++;
  if (r.pass1!.assessment.verdict === truthVerdict(r)) g.servCorrect++;
  if (flag(r.pass1!.reppo.route)) g.reppoFlagged++;
}

const credits = recs.reduce((s, r) => s + (r.pass1?.reppo.creditsCharged ?? 0) + (r.pass2?.reppo.creditsCharged ?? 0), 0);

const stats = {
  items: recs.length,
  asa_flawed: recs.filter((r) => r.label === "flawed").length,
  asa_sound: recs.filter((r) => r.label === "sound").length,
  errors: Object.values(recs).filter((r) => r.error).length,
  serv_alone: { correct: tp + tn, accuracy_pct: servAcc, flawed_caught: tp, flawed_missed: fn, sound_wrongly_flagged: fp, sound_passed: tn,
    flawed_recall_pct: rate(tp, tp + fn), flawed_precision_pct: rate(tp, tp + fp) },
  reppo_gate_on_serv_answer: {
    serv_wrong_n: servWrong.length, reppo_flagged_wrong_answers: caught.length, catch_rate_pct: rate(caught.length, servWrong.length),
    serv_right_n: servRight.length, reppo_false_flags: falseFlags.length, false_flag_rate_pct: rate(falseFlags.length, servRight.length),
    mean_score_when_serv_right: mean(servRight.map((r) => r.pass1!.reppo.score ?? 0)),
    mean_score_when_serv_wrong: mean(servWrong.map((r) => r.pass1!.reppo.score ?? 0)),
  },
  feedback_loop: { revised_n: revised.length, verdict_changed: changed.length, changed_to_correct: improved.length, changed_to_wrong: worsened.length,
    reppo_score_rose: scoreUp.length, final_correct: finalCorrect, final_accuracy_pct: rate(finalCorrect, recs.length) },
  by_group: byGroup,
  reppo_credits_charged: credits,
  wrong_items: servWrong.map((r) => ({ id: r.id, asa: r.label, serv: r.pass1!.assessment.verdict, reppo_route: r.pass1!.reppo.route, reppo_score: r.pass1!.reppo.score })),
};
writeFileSync("out/stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
