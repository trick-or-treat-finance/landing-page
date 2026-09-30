// Takes over the finished HTML: the Trick/Treat flip, the sandbox, the slip, the ghost.
// Nothing here fetches, stores or sends anything.
import { typeAudio } from "./typeaudio";
import { typewriter } from "./typewriter";
import { FLIP, SAMPLE_MONTH, planFlip, treatBasket } from "./engine";
import {
  SANDBOX, TREAT_BUDGET, defaultSandbox, money, sandboxTally, sandboxTotal, stayTreat, type SandboxState,
} from "./render";

const root = document.documentElement;
root.classList.add("js");
const BASE = import.meta.env.BASE_URL;
const $ = <T extends Element>(sel: string, from: ParentNode = document): T | null => from.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string, from: ParentNode = document): T[] => [...from.querySelectorAll<T>(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Trick / Treat ---------- */
const stage = $<HTMLElement>(".stage");
const sw = $<HTMLButtonElement>("#sw");
const live = $<HTMLElement>("#live");
const totalEl = $<HTMLElement>("#total");
const basket = treatBasket(SAMPLE_MONTH, TREAT_BUDGET);
const TREAT_CENTS = TREAT_BUDGET * 100;
const TRICK_CENTS = SAMPLE_MONTH.reduce((s, l) => s + l.amountCents, 0);
let treat = false;
let running: Animation[] = [];
let raf = 0;

function count(from: number, to: number, ms: number, delay: number): void {
  cancelAnimationFrame(raf);
  if (!totalEl) return;
  if (ms === 0) { totalEl.textContent = money(to); return; }
  const t0 = performance.now() + delay;
  const step = (now: number): void => {
    const p = Math.min(1, Math.max(0, (now - t0) / ms));
    const eased = 1 - Math.pow(1 - p, 3);
    totalEl.textContent = money(Math.round(from + (to - from) * eased));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function setStayText(on: boolean): void {
  for (const li of $$<HTMLElement>(".slot.stay", stage ?? document)) {
    const nm = $<HTMLElement>(".nm", li);
    const id = li.dataset.id ?? "";
    if (!nm) continue;
    if (on) { nm.dataset.was = nm.textContent ?? ""; nm.textContent = stayTreat(id) ?? nm.textContent; }
    else if (nm.dataset.was) nm.textContent = nm.dataset.was;
  }
}

function labels(): void {
  sw?.setAttribute("aria-checked", String(treat));
  $(".lab-trick")?.classList.toggle("on", !treat);
  $(".lab-treat")?.classList.toggle("on", treat);
  if (live) live.textContent = treat
    ? "Treat view. The ownable lines moved into company tiles."
    : "Trick view. The sample month as a receipt.";
}

function settle(): void {
  for (const a of running) a.cancel();
  running = [];
  const slots = $$<HTMLElement>(".slot[data-ticker]", stage ?? document);
  for (const li of slots) { li.classList.toggle("gone", treat); li.classList.remove("flying"); }
  for (const t of $$<HTMLElement>(".tile", stage ?? document)) t.classList.toggle("landed", treat);
  stage?.classList.remove("armed");
  setStayText(treat);
}

function setView(next: boolean): void {
  if (!stage || next === treat) return;
  treat = next;
  const still = reduced.matches;
  for (const a of running) a.cancel();
  running = [];
  const plan = planFlip(SAMPLE_MONTH, basket, TREAT_CENTS, still);
  labels();
  stage.dataset.view = treat ? "treat" : "trick";

  if (still) {
    stage.classList.remove("xfade");
    void stage.offsetWidth;
    stage.classList.add("xfade");
    settle();
    count(0, treat ? TREAT_CENTS : TRICK_CENTS, 0, 0);
    return;
  }

  count(treat ? TRICK_CENTS : TREAT_CENTS, treat ? TREAT_CENTS : TRICK_CENTS, plan.count.durationMs, plan.count.startMs);
  stage.classList.add("armed");
  const tiles = $$<HTMLElement>(".tile", stage);
  const opts = (delay: number, dur: number): KeyframeAnimationOptions => ({ delay, duration: dur, easing: "ease-in-out", fill: "both" });
  let landedBy = 0;

  plan.lines.forEach((lf, i) => {
    if (lf.target === "stays") return;
    const li = $<HTMLElement>(`.slot[data-id="${lf.lineId}"]`, stage);
    const ln = li && $<HTMLElement>(".ln", li);
    const tile = tiles[lf.target as number];
    if (!li || !ln || !tile) return;
    li.classList.remove("gone");
    li.classList.add("flying");
    const a = ln.getBoundingClientRect();
    const b = tile.getBoundingClientRect();
    const dx = b.left - a.left + 6;
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const tilt = ((i % 5) - 2) * 1.6;
    const lift = -18 - (i % 3) * 6;
    const t = (x: number, y: number, r = 0, s = 1): string => `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
    const frames = treat
      ? [
          { transform: t(0, 0), opacity: 1, offset: 0 },
          { transform: t(dx * 0.45, dy * 0.45 + lift, tilt), opacity: 1, offset: 0.5 },
          { transform: t(dx, dy + 4, tilt / 2, 0.9), opacity: 1, offset: 0.88 },
          { transform: t(dx, dy, 0, 0.9), opacity: 0.0, offset: 1 },
        ]
      : [
          { transform: t(dx, dy, 0, 0.9), opacity: 0, offset: 0 },
          { transform: t(dx, dy + 4, tilt / 2, 0.9), opacity: 1, offset: 0.12 },
          { transform: t(dx * 0.45, dy * 0.45 + lift, tilt), opacity: 1, offset: 0.5 },
          { transform: t(0, 0), opacity: 1, offset: 1 },
        ];
    const delay = treat ? lf.startMs : FLIP.knobMs + i * 12;
    const dur = treat ? lf.travelMs : 360;
    const anim = ln.animate(frames, opts(delay, dur));
    running.push(anim);
    landedBy = Math.max(landedBy, delay + dur);
    if (treat) {
      anim.finished.then(() => { li.classList.add("gone"); li.classList.remove("flying"); tile.classList.add("landed"); anim.cancel(); }).catch(() => undefined);
    } else {
      tile.classList.remove("landed");
      anim.finished.then(() => { li.classList.remove("flying"); anim.cancel(); }).catch(() => undefined);
    }
  });

  if (treat) {
    setTimeout(() => { if (treat) setStayText(true); }, plan.stamp.startMs);
    const stamp = $<HTMLElement>(".stamp", stage);
    stamp?.animate(
      [{ transform: `rotate(-8deg) scale(${plan.stamp.scaleFrom})`, opacity: 0 }, { transform: "rotate(-8deg) scale(1)", opacity: 1 }],
      { delay: plan.stamp.startMs, duration: plan.stamp.durationMs, easing: "ease-out", fill: "backwards" },
    );
  } else {
    setStayText(false);
  }
}

if (stage && sw) {
  sw.addEventListener("click", () => setView(!treat));
  sw.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setView(true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setView(false); }
  });
  for (const lab of $$(".lab-trick, .lab-treat")) lab.addEventListener("click", () => setView(lab.classList.contains("lab-treat")));
  $("#see-treat")?.addEventListener("click", () => setTimeout(() => setView(true), 350));
}

/* ---------- Sandbox ---------- */
const sbTotal = $<HTMLElement>("#sb-total");
const sbDetail = $<HTMLElement>("#sb-detail");
let state: SandboxState = defaultSandbox();

function paintSandbox(): void {
  if (sbTotal) sbTotal.textContent = sandboxTotal(state);
  sbTotal?.setAttribute("aria-label", `Made-up month total: ${sandboxTotal(state)}`);
  if (sbDetail) sbDetail.innerHTML = sandboxTally(state, BASE);
  for (const k of SANDBOX) {
    const s = state[k.id];
    const chip = $<HTMLButtonElement>(`.chip[data-id="${k.id}"]`);
    if (chip) {
      chip.setAttribute("aria-pressed", String(s.on));
      const small = $("small", chip);
      if (small) small.textContent = s.on ? "on" : "off";
    }
    const row = $<HTMLElement>(`.row[data-id="${k.id}"]`);
    if (row) {
      row.hidden = !s.on;
      const input = $<HTMLInputElement>("input", row);
      const out = $<HTMLOutputElement>("output", row);
      if (input) {
        input.value = String(Math.round(s.cents / 100));
        input.setAttribute("aria-valuetext", `${money(s.cents)} a month`);
        input.style.setProperty("--p", `${((s.cents / 100 - k.min) / (k.max - k.min)) * 100}%`);
      }
      if (out) out.textContent = money(s.cents);
    }
  }
}

function wakeSandbox(): void {
  for (const el of $$<HTMLInputElement | HTMLButtonElement>(".sand input, .sand .chip")) el.disabled = false;
  for (const k of SANDBOX) {
    $<HTMLButtonElement>(`.chip[data-id="${k.id}"]`)?.addEventListener("click", () => {
      state[k.id] = { ...state[k.id], on: !state[k.id].on };
      paintSandbox();
    });
    $<HTMLInputElement>(`#sl-${k.id}`)?.addEventListener("input", (e) => {
      // A slider moves in whole dollars; the fixture default keeps its cents until touched.
      state[k.id] = { ...state[k.id], cents: Number((e.target as HTMLInputElement).value) * 100 };
      paintSandbox();
    });
  }
  $("#sb-reset")?.addEventListener("click", () => { state = defaultSandbox(); paintSandbox(); });
  paintSandbox();
}
wakeSandbox();

/* ---------- Permission slip ---------- */
function wakeSlip(): void {
  const items = $$<HTMLElement>(".slip-list > li");
  const open = (li: HTMLElement | null): void => {
    for (const it of items) {
      const on = it === li;
      $("button", it)?.setAttribute("aria-expanded", String(on));
      const why = $<HTMLElement>(".why", it);
      if (why) why.hidden = !on;
    }
  };
  items.forEach((li, i) => {
    li.style.setProperty("--k", String(i));
    $("button", li)?.addEventListener("click", () => open($("button", li)?.getAttribute("aria-expanded") === "true" ? null : li));
  });
  open(items[0] ?? null);
}
wakeSlip();

/* ---------- Ghost ---------- */
function wakeGhost(): void {
  const svgs = $$<SVGElement>(".gh-hero, .gh-peek");
  if (reduced.matches) return;
  addEventListener("pointermove", (e) => {
    for (const svg of svgs) {
      const r = svg.getBoundingClientRect();
      if (r.width === 0) continue;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.35);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(5, d / 40);
      for (const eye of $$<SVGElement>(".eye", svg)) eye.style.transform = `translate(${(dx / d) * m}px, ${(dy / d) * m}px)`;
    }
  }, { passive: true });

  const hero = $<SVGElement>(".gh-hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => hero.classList.toggle("paused", !en.isIntersecting)).observe(hero);
  }
}
wakeGhost();

function wakePeek(): void {
  const peeker = $<HTMLElement>(".peeker");
  if (!peeker || reduced.matches || !("IntersectionObserver" in window)) { peeker?.classList.add("up"); return; }
  let hold = 0;
  let lastY = scrollY;
  let fast = false;
  addEventListener("scroll", () => { fast = Math.abs(scrollY - lastY) > 90; lastY = scrollY; }, { passive: true });
  new IntersectionObserver(([en]) => {
    clearTimeout(hold);
    if (en.isIntersecting && en.intersectionRatio >= 0.3 && !fast) {
      peeker.classList.remove("down");
      peeker.classList.add("up");
      hold = window.setTimeout(() => { peeker.classList.replace("up", "down"); }, 400 + 1200);
    } else if (!en.isIntersecting) {
      peeker.classList.remove("up");
    }
  }, { threshold: [0, 0.3] }).observe($(".slip-wrap") ?? peeker);
}
wakePeek();

/* ---------- Margin notes and slip strikes draw on when they scroll into view ---------- */
function wakeDraw(): void {
  if (reduced.matches || !("IntersectionObserver" in window)) return;
  const pairs: Array<[Element | null, string, string]> = [
    [stage, "notes-pre", "notes-in"],
    [$(".slip-sec"), "slip-pre", "slip-in"],
  ];
  for (const [el, pre, inn] of pairs) {
    if (!el) continue;
    el.classList.add(pre);
    new IntersectionObserver((entries, ob) => {
      if (!entries[0].isIntersecting) return;
      requestAnimationFrame(() => { el.classList.remove(pre); el.classList.add(inn); });
      ob.disconnect();
    }, { threshold: 0.2 }).observe(el);
  }
  for (const n of $$(".n3, .n4")) {
    const host = n.closest(".stage, .slip-sec");
    if (host) host.classList.add("notes-pre");
  }
}
wakeDraw();

/* ---------- After dark ---------- */
const theme = $<HTMLButtonElement>("#theme");
if (theme) {
  const dark = (): boolean => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  const paint = (): void => {
    root.dataset.theme = dark() ? "dark" : "light";
    theme.setAttribute("aria-checked", String(dark()));
    theme.setAttribute("aria-label", dark() ? "After dark, on. Switch to daylight" : "After dark, off. Switch on");
  };
  theme.addEventListener("click", () => { root.dataset.theme = dark() ? "light" : "dark"; paint(); });
  paint();
}

/* ---------- October ---------- */
if (new Date().getMonth() === 9 || /[?&]october\b/.test(location.search)) {
  const first = $<HTMLElement>(".lines > li:nth-child(4)");
  if (first) {
    const li = document.createElement("li");
    li.className = "slot oct";
    li.innerHTML = `<div class="ln"><span class="nm">Fun-size, 12 pack</span><i></i><b>&mdash;</b></div><span class="oct-note" aria-hidden="true">one of these is a tax on October.</span>`;
    first.after(li);
  }
}

/* ---------- Typewriter quotes ---------- */
// Runs once, when the quotes scroll into view. Reduced motion: text stays as printed, no sound.
{
  const quotes = $$<HTMLElement>(".duo-q");
  const soundBtn = $<HTMLButtonElement>("#tw-sound");
  if (quotes.length && !reduced.matches && "IntersectionObserver" in window) {
    const audio = typeAudio();
    const state = $<HTMLElement>("#tw-state");
    const paintSound = (): void => {
      soundBtn?.setAttribute("aria-pressed", String(audio.on));
      if (state) state.textContent = audio.on ? "on" : "off";
    };
    if (soundBtn) {
      soundBtn.hidden = false;
      soundBtn.addEventListener("click", () => {
        if (audio.on) audio.disable(); else audio.enable();
        paintSound();
      });
    }
    let tw: ReturnType<typeof typewriter> | null = null;
    let visible = false;
    const host = $<HTMLElement>(".duo-quotes");
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !tw && !reduced.matches) {
        tw = typewriter(quotes, { key: (k) => audio.key(k), target: () => audio.bell() });
        // while it types the quotes region can take focus, so the keyboard can skip too
        host?.setAttribute("tabindex", "0");
        host?.setAttribute("role", "group");
        host?.setAttribute("aria-label", "Quotes, typing. Press Enter, Space or Escape to show them at once.");
        void tw.finished.then(() => {
          io.disconnect();
          for (const a of ["tabindex", "role", "aria-label"]) host?.removeAttribute(a);
        });
      }
      tw?.pause(!visible || document.hidden);
    }, { rootMargin: "0px 0px -20% 0px" });
    if (host) io.observe(host);
    document.addEventListener("visibilitychange", () => tw?.pause(!visible || document.hidden));
    // a tap or click anywhere on the quotes jumps to the end
    host?.addEventListener("pointerdown", (e) => { if (!(e.target as Element).closest("button")) tw?.skip(); });
    // so do Enter and Space on the focused region, and Escape from anywhere while it types
    host?.addEventListener("keydown", (e) => {
      if (e.target !== host || !tw || tw.done) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tw.skip(); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tw && !tw.done) tw.skip(); });
    // live switch to reduced motion: show the text, stop the sound, and put the toggle back to off and away
    reduced.addEventListener("change", () => {
      if (!reduced.matches) return;
      tw?.skip();
      audio.disable();
      paintSound();
      if (soundBtn) soundBtn.hidden = true;
    });
  }
}
