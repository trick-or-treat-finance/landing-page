// Typewriter reveal. Self-contained: no page, no storage, no network. Reusable as-is.
//
// The real text stays in the DOM and is never touched. `typewriter()` clones each target into an
// aria-hidden layer laid over it, wraps every character of the clone in a span, and reveals them
// one at a time. The clone has the same layout as the original, so nothing moves while it types.
// When it ends (or is skipped) the layer is removed and the untouched original is shown.

export type Rand = () => number;

export interface Beat {
  /** ms to wait before revealing this character */
  wait: number;
  /** what kind of key it is, so sound can differ */
  key: "char" | "space" | "line";
}

const PUNCT_PAUSE: Record<string, number> = { ".": 300, "?": 300, "!": 300, ":": 220, ";": 200, ",": 150, "—": 200, "”": 120 };

/** Rhythm for one run of text: small random delay per key, longer rests at punctuation. */
export function rhythm(text: string, rand: Rand = Math.random): Beat[] {
  const beats: Beat[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const prev = text[i - 1] ?? "";
    let wait = 14 + rand() * 22;
    if (c === " ") wait *= 0.8;
    // a rest after punctuation, felt before the next word starts
    if (c === " " && PUNCT_PAUSE[prev] !== undefined) wait += PUNCT_PAUSE[prev] * (0.7 + rand() * 0.6);
    // an occasional hesitation, like a person
    if (rand() < 0.02) wait += 90 + rand() * 120;
    beats.push({ wait: Math.round(wait), key: c === " " ? "space" : "char" });
  }
  return beats;
}

export interface Hooks {
  /** a key was struck */
  key?: (k: Beat["key"]) => void;
  /** one paragraph has just been fully typed */
  line?: () => void;
  /** one target element has just been fully typed */
  target?: () => void;
}

export interface Typewriter {
  skip(): void;
  /** hold or continue typing (used while the section is off screen) */
  pause(p: boolean): void;
  readonly done: boolean;
  /** resolves once finished or skipped */
  finished: Promise<void>;
}

const BLOCK_PAUSE = 520;
const BETWEEN_TARGETS = 900;

/** Wrap every character of every text node under `p` in a span.tw-c; returns them in order. */
function wrapChars(p: Element): HTMLElement[] {
  const chars: HTMLElement[] = [];
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const ch of node.data) {
      const s = document.createElement("span");
      s.className = "tw-c";
      s.textContent = ch;
      frag.appendChild(s);
      chars.push(s);
    }
    node.replaceWith(frag);
  }
  return chars;
}

export function typewriter(targets: HTMLElement[], hooks: Hooks = {}, rand: Rand = Math.random): Typewriter {
  const layers = targets.map((el) => {
    const layer = el.cloneNode(true) as HTMLElement;
    layer.classList.add("tw-layer");
    layer.setAttribute("aria-hidden", "true");
    layer.removeAttribute("id");
    el.classList.add("tw-live");
    el.appendChild(layer);
    return { el, layer, blocks: [...layer.querySelectorAll("p")].map(wrapChars) };
  });
  const caret = document.createElement("span");
  caret.className = "tw-caret";

  let done = false;
  let timer = 0;
  let paused = false;
  let resume: (() => void) | null = null;
  let ok!: () => void;
  const finished = new Promise<void>((r) => (ok = r));

  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const { el, layer } of layers) { layer.remove(); el.classList.remove("tw-live"); }
    caret.remove();
    ok();
  };

  const sleep = (ms: number): Promise<void> => new Promise((r) => { timer = window.setTimeout(r, ms); });

  const run = async (): Promise<void> => {
    for (const { blocks } of layers) {
      for (const block of blocks) {
        const beats = rhythm(block.map((c) => c.textContent).join(""), rand);
        for (let i = 0; i < block.length; i++) {
          if (done) return;
          if (paused) await new Promise<void>((r) => (resume = r));
          if (done) return;
          await sleep(beats[i].wait);
          if (done) return;
          block[i].classList.add("on");
          block[i].after(caret);
          hooks.key?.(beats[i].key);
        }
        hooks.line?.();
        await sleep(BLOCK_PAUSE);
      }
      hooks.target?.();
      await sleep(BETWEEN_TARGETS - BLOCK_PAUSE);
    }
    finish();
  };

  // The caret rests at the start of the first block before typing begins.
  layers[0]?.blocks[0]?.[0]?.before(caret);
  void run();

  return {
    skip: finish,
    pause(p) { paused = p; if (!p) { resume?.(); resume = null; } },
    get done() { return done; },
    finished,
  };
}
