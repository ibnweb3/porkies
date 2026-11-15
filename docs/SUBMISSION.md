# Submission drafts (SERV Hackathon, Edition 02, Reppo track)

Deadline: 15 November 2026, 23:59 UTC (00:59 WAT on the 16th). Form: https://openserv.typeform.com/submissions02

## Links

- Live demo (no sign-up): https://claim-audit.ibnweb3lab.workers.dev
- Demo video (2 minutes, also in the repo): https://claim-audit.ibnweb3lab.workers.dev/demo.mp4
- Code (public repo): https://github.com/ibnweb3/claim-audit
- X post: <paste the link to the post here after you publish it>

## Track

Reppo Partner Track.

## Project name

Claim Audit

## One-line description

Can an AI spot a misleading UK property ad? We test SERV Reasoning against real regulator rulings, add a Reppo panel as an independent second opinion, and let anyone try it live.

## Short write-up (what it does, how it uses SERV Reasoning, which track)

Claim Audit tests whether an AI can judge UK property-advertising claims the way the advertising regulator (the ASA) does. We took 24 real claims the ASA had already ruled on (19 misleading, 5 fair). For each one, a calculator checks the sums (the AI only proposes which sums to run; plain code does them), SERV Reasoning gives a verdict on whether the claim is backed up by the evidence, and an independent Reppo panel reviews the AI's answer. Every step is saved in a tamper-evident log that the page re-verifies in your browser.

How it uses SERV Reasoning: chat completions with `gpt-5.4-mini` for the verdicts and for choosing the sums, and the built-in `serv_prompt_guard` on every call in the live "Try it" box, because the text there comes from strangers.

Result: the AI agreed with the regulator on 21 of 24 and caught all 19 misleading claims, but it was too cautious on 3 of the 5 fair ones. The Reppo panel approved 23 of 24 answers, including all 3 wrong ones, so in this test it did not catch the AI's mistakes. We report that plainly. Small test, one regulator, one country.

Track: Reppo. The panel's route and score drive the feedback loop and are shown next to every claim.

## Existing code

The hash-chain code in `src/lib/` is reused from the author's earlier project, Backstop (MIT). Everything else was built during the hackathon.

## X post (draft; the link counts as 23 characters)

Can an AI spot a misleading property ad?

We gave 24 real UK ad claims, ruled on by the ASA, to @openservai SERV Reasoning and had a @reppo panel check it.

The AI agreed with the regulator on 21 of 24. Honest results, try it live:
https://claim-audit.ibnweb3lab.workers.dev

#SERVHackathon

(Attach `docs/demo/claim-audit-demo.mp4`. The form needs the link to this post.)
