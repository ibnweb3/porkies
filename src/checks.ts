// Deterministic checks. Plain arithmetic on figures that appear in an item's claim/context.
// These never use an AI. They return plain-English facts that are handed to SERV as "verified arithmetic".

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const pct = (n: number, d = 1) => n.toFixed(d) + "%";

function cbre(): string[] {
  const types: Array<[string, [number, number], [number, number]]> = [
    ["1-bed", [745, 925], [700, 750]],
    ["2-bed", [1115, 1335], [1100, 2150]],
    ["3-bed", [1750, 2500], [2095, 2308]],
  ];
  return types.map(([n, ad, ach]) => {
    const rel =
      ad[0] > ach[1] ? `the whole advertised range sits ABOVE the achieved range (advertised low ${gbp(ad[0])} is ${gbp(ad[0] - ach[1])} over the achieved high ${gbp(ach[1])})`
      : ad[1] < ach[0] ? "the whole advertised range sits below the achieved range"
      : ad[0] >= ach[0] && ad[1] <= ach[1] ? "the advertised range lies inside the achieved range"
      : ad[1] > ach[1] ? `the advertised range overlaps the achieved range but its top end is ${gbp(ad[1] - ach[1])} above the achieved high`
      : "the advertised range overlaps the achieved range";
    return `${n}: advertised ${gbp(ad[0])}-${gbp(ad[1])}/week vs achieved ${gbp(ach[0])}-${gbp(ach[1])}/week: ${rel}.`;
  });
}

function newbuild(): string[] {
  const price = 430000, dep = price * 0.1;
  const out: string[] = [];
  for (const rise of [0.05, 0.1]) {
    const gain = price * rise;
    out.push(`A ${pct(rise * 100, 0)} TOTAL rise on ${gbp(price)} is ${gbp(gain)}, which is ${pct((gain / dep) * 100, 0)} of the ${gbp(dep)} deposit. So '5-10% rise equals a 50-100% return on the deposit' is arithmetically consistent.`);
  }
  for (const rate of [0.05, 0.1]) {
    const v = price * Math.pow(1 + rate, 1.5);
    out.push(`If instead the rise is ${pct(rate * 100, 0)} per YEAR for 18 months (compounded), the value is about ${gbp(v)}, a gain of ${gbp(v - price)}, ${pct(((v - price) / dep) * 100)} of the deposit (the advertiser's own reply quotes 462,787 / 76% / 155%, close but not identical).`);
  }
  out.push("The sums do not test whether the price rise will happen; they only show what the percentages imply.");
  return out;
}

function connectRoi(): string[] {
  const c1a = 48500 / 25000 - 1, c1b = 138500 / 48500 - 1, c1c = 138500 / 25000 - 1, c2 = 1242000 / 950000 - 1;
  return [
    `Case 1: valued 25,000 -> sold 48,500 is +${pct(c1a * 100, 0)}; sold 48,500 -> lots totalling 138,500 is +${pct(c1b * 100, 1)}; valued 25,000 -> lots is +${pct(c1c * 100, 0)}.`,
    `Case 2: 950,000 -> lots totalling 1,242,000 is +${pct(c2 * 100, 1)}.`,
    `Neither case sits inside the stated 10-30% range: case 1 is far above it and case 2 (+${pct(c2 * 100, 1)}) is just above it. The sample is 2 cases, one from 2021.`,
  ];
}

function pbSaving(): string[] {
  const price = 303190, comm = price * 0.015;
  return [
    `1.5% of ${gbp(price)} is ${gbp(comm)}.`,
    `Minus the outside-London fixed fee (£798): ${gbp(comm - 798)}. Minus the London fixed fee (£1,158): ${gbp(comm - 1158)}.`,
    `Neither equals the advertised £4,158. The disclosed inputs would need an average sale price of about ${gbp((4158 + 798) / 0.015)} (with the £798 fee) or ${gbp((4158 + 1158) / 0.015)} (with £1,158) to give £4,158. That average sale price is not shown.`,
  ];
}

function pbThousands(): string[] {
  const p = 300000;
  return [0.0075, 0.01, 0.018].map((r) => `At ${pct(r * 100, 2)} commission on ${gbp(p)} the commission is ${gbp(p * r)}; saving versus the fixed fees is ${gbp(p * r - 798)} (outside London) or ${gbp(p * r - 1158)} (London).`);
}

function churchill(): string[] {
  const ratios = [
    ["24,255 kWh vs Ofgem medium 14,200", 24255 / 14200],
    ["24,255 kWh vs Ofgem high 21,100", 24255 / 21100],
    ["27,560 kWh vs Ofgem medium 14,200", 27560 / 14200],
    ["27,560 kWh vs Ofgem high 21,100", 27560 / 21100],
  ] as const;
  return ratios.map(([n, r]) => `${n}: the assumed comparison home uses ${pct((r - 1) * 100, 0)} more energy than Ofgem's typical figure.`);
}

function hkl(): string[] {
  return [
    `Two of 13 completed sales (${pct((2 / 13) * 100)}) were more than 10% above another agent's initial valuation; the three examples given were 10.8%, 10.6% and 5.9%, so 2 of 3 examples reach 10%.`,
    "The comparison is final sale price against another agent's initial valuation, not against that agent's own sale price; 13 sales is a small sample.",
  ];
}

const table: Record<string, () => string[]> = {
  "cbre-yields": cbre,
  "newbuild-forecast": newbuild,
  "connectuk-roi": connectRoi,
  "pb-saving": pbSaving,
  "pb-thousands": pbThousands,
  "churchill-energy": churchill,
  "churchill-total": churchill,
  "hkl-higher": hkl,
};

export function codeChecks(id: string): string[] {
  const f = table[id];
  return f ? f() : ["No figures in this item can be recomputed; the item is judged on the evidence given."];
}
