// Wires the "watch the treat grow" controls. Draws with the same functions the build used for the
// static example. Nothing here fetches, stores or sends anything.
import { GROW_DEFAULT, GROW_LIMITS, clampGrow, grow, type GrowInput } from "./engine/grow";
import { growOutput, growSummary } from "./grow-view";

const sec = document.querySelector<HTMLElement>("#grow");
const out = document.querySelector<HTMLElement>("#grow-out");
const years = document.querySelector<HTMLInputElement>("#g-years");
const rate = document.querySelector<HTMLInputElement>("#g-rate");
const live = document.querySelector<HTMLElement>("#g-live");
const modes = [...document.querySelectorAll<HTMLInputElement>('input[name="g-mode"]')];

if (sec && out && years && rate && modes.length) {
  const state = (): GrowInput => clampGrow({
    ...GROW_DEFAULT,
    mode: modes.find((m) => m.checked)?.value === "once" ? "once" : "monthly",
    years: Number(years.value),
    rateBp: Number(rate.value),
  });
  const fill = (el: HTMLInputElement, lo: number, hi: number): void => {
    el.style.setProperty("--p", `${((Number(el.value) - lo) / (hi - lo)) * 100}%`);
  };
  let timer = 0;
  const draw = (): void => {
    const i = state();
    out.innerHTML = growOutput(i);
    fill(years, GROW_LIMITS.minYears, GROW_LIMITS.maxYears);
    fill(rate, GROW_LIMITS.minRateBp, GROW_LIMITS.maxRateBp);
    const yo = document.querySelector("#g-years-o");
    const ro = document.querySelector("#g-rate-o");
    if (yo) yo.textContent = String(i.years);
    if (ro) ro.textContent = `${(i.rateBp / 100).toFixed(i.rateBp % 100 ? 1 : 0)}%`;
    years.setAttribute("aria-valuetext", `${i.years} ${i.years === 1 ? "year" : "years"}`);
    rate.setAttribute("aria-valuetext", `${ro?.textContent ?? ""} a year`);
    // a screen reader hears the result once the slider has settled, not on every step
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (live) live.textContent = growSummary(i, grow(i)); }, 400);
  };
  for (const el of [years, rate, ...modes]) {
    el.disabled = false;
    el.addEventListener("input", () => { sec.classList.remove("g-first"); draw(); });
  }
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      sec.classList.add("g-first");
      window.setTimeout(() => sec.classList.remove("g-first"), 1800);
    }, { threshold: 0.35 });
    io.observe(out);
  }
}
