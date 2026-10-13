// Small jokes for people who poke at things. None of them fetch, store or send anything,
// none of them moves the layout (the toast and the bat are fixed and out of flow), and
// with reduced motion they still say their line, they just do not move.

export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
export const POKES = [
  "ok that tickles.",
  "i'm sample data, not a piñata.",
  "every tap is a vote. you keep voting for me.",
  "fine. here's your treat: nothing. it's a sample month.",
];
export const POKE_EVERY = 3;
export const AWAY_TITLE = "👻 your receipt misses you";
export const HALLOWEEN_TITLE = "Trick or Treat: it's literally our day 🎃";
export const BOO_LINE = "boo. did your net worth just flinch?";
export const THEME_LINES = { dark: "lights off. the ghost works nights.", light: "lights on. the ghost is squinting." };
export const FINE_LINE = "kidding. we're not that kind of company.";
export const WORD_LINES = { treat: "treat side. same month, new sort.", trick: "trick side. back to what it cost." };

/** A word as the keys that spell it, for konamiMatcher. */
export function wordKeys(word: string): string[] {
  return [...word];
}

/** Whole days from the visitor's today to 31 October, on their own calendar; null outside October. */
export function sleepsToHalloween(now: Date): number | null {
  if (now.getMonth() !== 9) return null;
  return 31 - now.getDate();
}

export function sleepsLine(n: number): string {
  return n === 0 ? "halloween is today" : `${n} ${n === 1 ? "sleep" : "sleeps"} until halloween`;
}

/** True on 31 October in the visitor's own time zone, or with ?halloween in the address. */
export function isHalloween(now: Date, search = ""): boolean {
  return (now.getMonth() === 9 && now.getDate() === 31) || /[?&]halloween\b/.test(search);
}

/** Feeds keys in; returns true on the key that completes the Konami code. */
export function konamiMatcher(code: readonly string[] = KONAMI): (key: string) => boolean {
  let last: string[] = [];
  return (key) => {
    last = [...last, key.length === 1 ? key.toLowerCase() : key].slice(-code.length);
    if (last.join() !== code.join()) return false;
    last = [];
    return true;
  };
}

/** The line for the nth poke (1-based), or null when this poke says nothing. */
export function pokeLine(n: number): string | null {
  if (n < POKE_EVERY || n % POKE_EVERY) return null;
  return POKES[(n / POKE_EVERY - 1) % POKES.length]!;
}

/** A phone-like device: touch input and no hover. Decided by input, never by user agent or width, so a narrow desktop window keeps the joke. */
const touchOnly = (): boolean => matchMedia("(hover: none) and (pointer: coarse)").matches;
const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** One polite status line at the bottom of the screen, gone after a few seconds. */
export function toast(text: string, announce = true): void {
  if (!toastEl) {
    toastEl = document.createElement("p");
    toastEl.className = "egg-toast";
    toastEl.setAttribute("role", "status");
    document.body.append(toastEl);
  }
  // aria-hidden when something else is already speaking for the same event (the receipt's own status on a flip).
  toastEl.setAttribute("aria-hidden", String(!announce));
  toastEl.textContent = text;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove("on"), 4200);
}

function wiggle(el: Element | null, cls: string): void {
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).getBoundingClientRect();
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function consoleNote(base: string): void {
  console.log(
    "%c👻 you opened devtools. respect.%c\n" +
      "nothing to find in here: every number on this page is a sample month, not real data.\n" +
      `found a real bug anyway? ${location.origin}${base}hello-hacker.html has our email. we say thank you.\n` +
      "psst: ↑ ↑ ↓ ↓ ← → ← → b a. or just type boo, treat, trick.",
    "font: 700 14px system-ui; color: #155646",
    "font: 12px ui-monospace, monospace",
  );
}

function konami(): void {
  const match = konamiMatcher();
  document.addEventListener("keydown", (e) => {
    // sliders, the switch and form fields use arrow keys for real work; the code only counts from the page itself
    const t = e.target as Element | null;
    if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable], [role=slider]")) return;
    if (!match(e.key)) return;
    toast("cheat code accepted. sadly money has no cheat codes. +0 net worth unlocked.");
    wiggle(document.querySelector(".gh-hero"), "egg-spin");
  });
}

/** Typed words, from the page itself and never from a field: boo scares the ghost, treat and trick flip the receipt. */
function typedWords(): void {
  const boo = konamiMatcher(wordKeys("boo"));
  const treat = konamiMatcher(wordKeys("treat"));
  const trick = konamiMatcher(wordKeys("trick"));
  const flipTo = (side: "treat" | "trick"): void => {
    const sw = document.querySelector<HTMLButtonElement>("#sw");
    const flips = sw !== null && (sw.getAttribute("aria-checked") === "true") !== (side === "treat");
    if (flips) sw.click();
    toast(WORD_LINES[side], !flips);
  };
  document.addEventListener("keydown", (e) => {
    const t = e.target as Element | null;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable], [role=slider]")) return;
    const hits = [boo(e.key), treat(e.key), trick(e.key)];
    if (hits[0]) { wiggle(document.querySelector(".gh-hero"), "egg-boop"); toast(BOO_LINE); }
    if (hits[1]) flipTo("treat");
    if (hits[2]) flipTo("trick");
  });
}

/** October only: the hint under the buttons also counts the sleeps. Added text, nothing moves above it. */
function countdown(): void {
  const n = sleepsToHalloween(new Date());
  const hint = document.querySelector(".hero-hint");
  if (n === null || !hint) return;
  const span = document.createElement("span");
  span.className = "hero-sleeps";
  span.textContent = ` ${sleepsLine(n)} 🎃`;
  hint.append(span);
}

/** The switch answers with a line; the theme script has already flipped by the time this runs. */
function themeLines(): void {
  document.querySelector("#theme")?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    toast(dark ? THEME_LINES.dark : THEME_LINES.light);
  });
}

/** The hero ghost closes its eyes for a moment every few seconds; the CSS animation is the only thing that moves, and it is not started under reduced motion. */
function blink(): void {
  const eyes = [...document.querySelectorAll<SVGElement>(".gh-hero .eye")];
  if (!eyes.length) return;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let timer = 0;
  const once = (): void => {
    timer = 0;
    if (motion.matches) return;
    if (document.visibilityState === "visible") {
      for (const eye of eyes) {
        eye.classList.add("egg-blink");
        eye.addEventListener("animationend", () => eye.classList.remove("egg-blink"), { once: true });
      }
    }
    timer = window.setTimeout(once, 3000 + Math.random() * 3000);
  };
  const sync = (): void => {
    clearTimeout(timer);
    timer = 0;
    for (const eye of eyes) eye.classList.remove("egg-blink");
    if (!motion.matches) timer = window.setTimeout(once, 2500);
  };
  motion.addEventListener("change", sync);
  sync();
}

/** The fine print shrinks as it comes into view, then springs back to full size and says so, once per visit. Transform only, so nothing reflows; reduced motion gets the line and no movement; phones get neither (the gag does not land there). */
function finePrint(): void {
  if (touchOnly()) return;
  const heading = document.querySelector(".fine-h");
  const footer = document.querySelector(".site-footer");
  if (!heading || !footer || !("IntersectionObserver" in window)) return;
  const watch = new IntersectionObserver(([en]) => {
    if (!en?.isIntersecting) return;
    watch.disconnect();
    if (reduced()) { toast(FINE_LINE); return; }
    footer.classList.add("fp-shrunk");
    setTimeout(() => {
      footer.classList.remove("fp-shrunk");
      toast(FINE_LINE);
    }, 1800);
  }, { threshold: 1, rootMargin: "0px 0px -15% 0px" });
  watch.observe(heading);
}

function pokeGhost(): void {
  const ghost = document.querySelector<SVGElement>(".gh-hero");
  if (!ghost) return;
  let n = 0;
  ghost.addEventListener("click", () => {
    n += 1;
    wiggle(ghost, "egg-boop");
    const line = pokeLine(n);
    if (line) toast(line);
  });
}

function tabAway(): void {
  let home = document.title;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { home = document.title; document.title = AWAY_TITLE; }
    else if (document.title === AWAY_TITLE) document.title = home;
  });
}

function halloween(): void {
  if (!isHalloween(new Date(), location.search)) return;
  document.title = HALLOWEEN_TITLE;
  document.documentElement.classList.add("halloween");
  if (reduced()) return;
  const bat = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  bat.setAttribute("class", "egg-bat");
  bat.setAttribute("viewBox", "0 0 64 32");
  bat.setAttribute("aria-hidden", "true");
  bat.setAttribute("focusable", "false");
  bat.innerHTML = `<path d="M32 10c-3 0-4 3-4 5-4-6-12-9-20-6 4 2 6 6 5 10 3-3 8-3 10 1 2-3 6-3 9 0 3-3 7-3 9 0 2-4 7-4 10-1-1-4 1-8 5-10-8-3-16 0-20 6 0-2-1-5-4-5Z" fill="currentColor"/>`;
  bat.addEventListener("animationend", () => bat.remove(), { once: true });
  document.body.append(bat);
}

export function wakeEggs(base: string): void {
  consoleNote(base);
  konami();
  typedWords();
  countdown();
  themeLines();
  blink();
  finePrint();
  pokeGhost();
  tabAway();
  halloween();
}
