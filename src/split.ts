// The split-the-dinner section: one sample dinner, split four ways, then settled. Nothing here fetches,
// stores or sends anything. Every figure is whole cents and comes from the same numbers the markup prints.

const TOTAL = 31_200;
const BUDGET = 24_000;
const FRIENDS = ["maya", "sam", "jo"] as const;
const FLIP_MS = 520;

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `total` cents between `people`, each a whole number of cents: the leftover cents go one each to the earlier people. */
export function evenShares(total: number, people: number): number[] {
  const base = Math.floor(total / people);
  const left = total - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < left ? 1 : 0));
}

type State = "whole" | "split" | "settled";

function wake(): void {
  const stage = document.querySelector<HTMLElement>("#split-stage");
  const go = document.querySelector<HTMLButtonElement>("#split-go");
  const settle = document.querySelector<HTMLButtonElement>("#split-settle");
  const live = document.querySelector<HTMLElement>("#split-live");
  const totalEl = stage?.querySelector<HTMLElement>(".split-total b");
  const budgetEl = document.querySelector<HTMLElement>("#split-budget-text");
  const pendingEl = document.querySelector<HTMLElement>("#split-pending");
  const fill = stage?.querySelector<HTMLElement>(".meter .fill");
  if (!stage || !go || !settle || !live || !totalEl || !budgetEl || !pendingEl || !fill) return;

  const [mine, ...others] = evenShares(TOTAL, FRIENDS.length + 1) as [number, ...number[]];
  const owed = others.reduce((a, b) => a + b, 0);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const name = (who: string): string => who[0]!.toUpperCase() + who.slice(1);
  let timers: number[] = [];
  let state: State = "whole";

  const stub = (who: string): HTMLElement | null => stage.querySelector<HTMLElement>(`.stub[data-who=${who}]`);
  const stopSettling = (): void => { timers.forEach(clearTimeout); timers = []; };

  function paint(next: State): void {
    state = next;
    stage!.dataset.state = next;
    go!.setAttribute("aria-pressed", String(next !== "whole"));
    settle!.hidden = next !== "split";
    totalEl!.textContent = dollars(next === "whole" ? TOTAL : mine);
    const shown = next === "whole" ? TOTAL : mine;
    fill!.style.setProperty("--p", String(Math.min(100, (shown / BUDGET) * 100)));
    budgetEl!.textContent = next === "whole"
      ? `${dollars(TOTAL)} of ${dollars(BUDGET)} · over by ${dollars(TOTAL - BUDGET)}`
      : `${dollars(mine)} of ${dollars(BUDGET)} · ${dollars(BUDGET - mine)} left`;
    for (const who of FRIENDS) {
      const el = stub(who);
      if (!el) continue;
      const paid = next === "settled";
      el.classList.toggle("pending", !paid);
      el.classList.toggle("paid", paid);
      el.classList.remove("flip");
      el.querySelector(".stub-t")!.textContent = paid ? "paid" : "pending";
    }
    pendingEl!.textContent = next === "split"
      ? `pending ${dollars(owed)} · 3 friends who swore they'd pay you back.`
      : next === "settled" ? "all square." : "";
  }

  function say(text: string): void { live!.textContent = text; }

  go.addEventListener("click", () => {
    stopSettling();
    if (state === "whole") {
      paint("split");
      say(
        `Split four ways. The bill was ${dollars(TOTAL)} and your share is ${dollars(mine)}. ` +
          `${dollars(owed)} is pending from Maya, Sam and Jo. ` +
          `Dining budget: ${dollars(mine)} of ${dollars(BUDGET)}, ${dollars(BUDGET - mine)} left.`,
      );
    } else {
      paint("whole");
      say(`Back to the whole dinner: ${dollars(TOTAL)}. Dining budget over by ${dollars(TOTAL - BUDGET)}.`);
    }
  });

  settle.addEventListener("click", () => {
    if (state !== "split") return;
    const done = (): void => {
      paint("settled");
      say(`All three paid. Nothing is pending. Dining budget stays at ${dollars(mine)} of ${dollars(BUDGET)}.`);
    };
    if (reduced.matches) { done(); return; }
    settle.disabled = true;
    FRIENDS.forEach((who, i) => {
      timers.push(window.setTimeout(() => {
        const el = stub(who);
        el?.classList.replace("pending", "paid");
        el?.classList.add("flip");
        const tag = el?.querySelector(".stub-t");
        if (tag) tag.textContent = "paid";
        pendingEl.textContent = `paid. ${who} redeemed.`;
      }, i * FLIP_MS));
    });
    timers.push(window.setTimeout(() => { settle.disabled = false; done(); }, FRIENDS.length * FLIP_MS));
  });

  paint("whole");
}

if (typeof document !== "undefined") wake();
