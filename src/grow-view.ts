// The "watch the treat grow" section as strings: written into the HTML at build time (so it reads
// with JS off) and reused by the browser to redraw when a control moves. No company, ticker or
// real price appears here; the rate is always the visitor's example.
import { GROW_DEFAULT, GROW_LIMITS, grow, niceMax, type GrowInput, type GrowResult } from "./engine/grow";
import { money } from "./render";

export const GROW_DISCLAIMER =
  "Illustration only. Example rate, not a prediction or a return for any company shown. Investing can lose money. Not investment advice.";

const pct = (bp: number): string => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`;
const yrs = (n: number): string => `${n} ${n === 1 ? "year" : "years"}`;
const treat = (c: number): string => money(c).replace(/\.00$/, "");

/** Axis money, short: $0, $500, $5k, $2.5k, $1.5M. */
export function axisMoney(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${+(d / 1_000_000).toFixed(1)}M`;
  if (d >= 1_000) return `$${+(d / 1_000).toFixed(1)}k`;
  return `$${Math.round(d)}`;
}

/** The gen z line under the chart. Lower case on purpose (research/landing-genz/final.md). */
export function growLine(i: GrowInput, r: GrowResult): string {
  const dep = treat(i.depositCents);
  const span = yrs(i.years);
  const rate = pct(i.rateBp);
  if (i.rateBp === 0) {
    return `at 0% nothing grows, so ${money(r.putInCents)} stays ${money(r.valueCents)}. slide the rate up and watch the gap open.`;
  }
  if (i.mode === "once") {
    return `${dep} once, left alone for ${span}, became ${money(r.valueCents)} at your example ${rate}. no extra deposits. just time.`;
  }
  return `${dep} a month for ${span} is ${money(r.putInCents)} from you. at your example ${rate} it became ${money(r.valueCents)}. the extra ${money(r.addedCents)} is just time.`;
}

export function growSummary(i: GrowInput, r: GrowResult): string {
  const what = i.mode === "once" ? `${treat(i.depositCents)} once` : `${treat(i.depositCents)} a month`;
  return `${what}, ${yrs(i.years)}, example rate ${pct(i.rateBp)}: ${money(r.putInCents)} put in, ${money(r.valueCents)} total value.`;
}

const W = 640, H = 300, L = 72, R = 14, T = 14, B = 34;

export function growChart(i: GrowInput, r: GrowResult): string {
  const top = niceMax(r.valueCents);
  const months = r.points.length - 1;
  const x = (m: number): number => L + ((W - L - R) * m) / months;
  const y = (c: number): number => T + (H - T - B) * (1 - c / top);
  const line = (pick: (p: GrowResult["points"][number]) => number): string =>
    r.points.map((p, k) => `${k ? "L" : "M"}${x(p.month).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join("");
  const val = line((p) => p.valueCents);
  const put = line((p) => p.putInCents);
  const base = y(0).toFixed(1);
  const area = `${val}L${x(months).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z`;
  const grid = [0, 1, 2, 3, 4].map((k) => {
    const c = (top * k) / 4;
    return `<line class="g-grid" x1="${L}" x2="${W - R}" y1="${y(c).toFixed(1)}" y2="${y(c).toFixed(1)}"/>` +
      `<text class="g-tick" x="${L - 8}" y="${(y(c) + 4).toFixed(1)}" text-anchor="end">${axisMoney(c)}</text>`;
  }).join("");
  const step = i.years <= 5 ? 1 : i.years <= 12 ? 2 : i.years <= 20 ? 5 : 10;
  let xt = "";
  for (let yr = 0; yr <= i.years; yr += step) {
    if (yr && i.years % step && i.years - yr < step * 0.75) continue;
    const a = yr === 0 ? "start" : yr === i.years ? "end" : "middle";
    xt += `<text class="g-tick" x="${x(yr * 12).toFixed(1)}" y="${H - 8}" text-anchor="${a}">${yr === i.years ? `${yr} yrs` : yr}</text>`;
  }
  if (i.years % step) {
    xt += `<text class="g-tick" x="${x(months).toFixed(1)}" y="${H - 8}" text-anchor="end">${i.years} yrs</text>`;
  }
  const ex = x(months).toFixed(1);
  return `<svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${growSummary(i, r)}" preserveAspectRatio="xMidYMid meet">` +
    `${grid}${xt}` +
    `<path class="g-area" d="${area}"/>` +
    `<path class="g-put" pathLength="1" d="${put}"/>` +
    `<path class="g-val" pathLength="1" d="${val}"/>` +
    `<circle class="g-dot g-dot-put" cx="${ex}" cy="${y(r.putInCents).toFixed(1)}" r="4.5"/>` +
    `<circle class="g-dot g-dot-val" cx="${ex}" cy="${y(r.valueCents).toFixed(1)}" r="5.5"/>` +
    `</svg>`;
}

/** Everything that changes when a control moves. */
export function growOutput(i: GrowInput): string {
  const r = grow(i);
  return `<div class="g-nums">` +
    `<p class="g-n g-n-in"><span class="g-k">You put in</span><b>${money(r.putInCents)}</b></p>` +
    `<p class="g-n g-n-val"><span class="g-k">Total value</span><b>${money(r.valueCents)}</b></p>` +
    `<p class="g-n g-n-add"><span class="g-k">Added by the example rate</span><b>${money(r.addedCents)}</b></p>` +
    `</div>` +
    `<div class="g-chart">${growChart(i, r)}</div>` +
    `<p class="g-line" id="g-line">${growLine(i, r)}</p>`;
}

const pctFill = (v: number, min: number, max: number): string => `${(((v - min) / (max - min)) * 100).toFixed(1)}%`;

export function growSection(i: GrowInput = GROW_DEFAULT): string {
  const { minYears, maxYears, minRateBp, maxRateBp, stepRateBp } = GROW_LIMITS;
  const monthly = i.mode === "monthly";
  return `<section class="grow" id="grow" aria-labelledby="grow-h">
    <div class="how-head">
      <h2 id="grow-h" class="h2">Now watch the treat grow.</h2>
      <p class="lede">the treat is that a little, often, adds up. pick ${treat(i.depositCents)} once or every month, pick a rate, and see what compounding does. it is arithmetic on a rate you choose, not a forecast.</p>
    </div>
    <div class="grow-card">
      <div class="grow-ctl">
        <fieldset class="g-mode" data-grow-mode>
          <legend>The treat</legend>
          <label class="g-opt"><input type="radio" name="g-mode" value="monthly"${monthly ? " checked" : ""} disabled /><span>${treat(i.depositCents)} every month</span></label>
          <label class="g-opt"><input type="radio" name="g-mode" value="once"${monthly ? "" : " checked"} disabled /><span>${treat(i.depositCents)} once</span></label>
        </fieldset>
        <div class="g-field">
          <label for="g-years">Years <output for="g-years" id="g-years-o">${i.years}</output></label>
          <input id="g-years" type="range" min="${minYears}" max="${maxYears}" step="1" value="${i.years}" style="--p:${pctFill(i.years, minYears, maxYears)}" aria-valuetext="${yrs(i.years)}" disabled />
          <span class="g-ends" aria-hidden="true"><span>${minYears}</span><span>${maxYears}</span></span>
        </div>
        <div class="g-field">
          <label for="g-rate">Yearly rate <output for="g-rate" id="g-rate-o">${pct(i.rateBp)}</output></label>
          <input id="g-rate" type="range" min="${minRateBp}" max="${maxRateBp}" step="${stepRateBp}" value="${i.rateBp}" style="--p:${pctFill(i.rateBp, minRateBp, maxRateBp)}" aria-valuetext="${pct(i.rateBp)} a year" disabled />
          <span class="g-ends" aria-hidden="true"><span>0%</span><span>12%</span></span>
          <p class="g-hint">example rate, you pick it</p>
        </div>
        <p class="g-how">Compounded monthly, interest added to the cent. Deposits go in at the start of each month. Fees, taxes and inflation are left out.</p>
      </div>
      <div class="grow-out" id="grow-out">${growOutput(i)}</div>
    </div>
    <p class="sr" id="g-live" role="status"></p>
    <noscript><p class="nojs">JavaScript is off, so the controls sit still. The example above is ${growSummary(i, grow(i))}</p></noscript>
    <p class="grow-dis">${GROW_DISCLAIMER} The investing half is not built yet.</p>
  </section>`;
}
