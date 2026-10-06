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

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** One polite status line at the bottom of the screen, gone after a few seconds. */
export function toast(text: string): void {
  if (!toastEl) {
    toastEl = document.createElement("p");
    toastEl.className = "egg-toast";
    toastEl.setAttribute("role", "status");
    document.body.append(toastEl);
  }
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
      "psst: ↑ ↑ ↓ ↓ ← → ← → b a",
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
  pokeGhost();
  tabAway();
  halloween();
}
