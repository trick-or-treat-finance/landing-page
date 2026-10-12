// The "be the first to know" form. Built with VITE_LEADS_URL it posts the address to our own list when
// the visitor submits and never before; built without it, beehiiv's form is fetched when the visitor asks,
// exactly as before. Either way a page that is only read makes no request to any other site.
import "./signup.css";

const LEADS_URL: string = import.meta.env.VITE_LEADS_URL ?? "";
const LOADER = "https://subscribe-forms.beehiiv.com/v3/loader.js";
// Anything with an @, text either side and a dot after it. The server is the judge; this only saves a trip.
const LOOKS_LIKE_AN_ADDRESS = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

const SAID = {
  thanks: "Got it. We'll email you once, when it opens.",
  notAnAddress: "That doesn't look like an email address.",
  slowDown: "A lot of tries just now. Give it a bit and try again.",
  unreachable: "We couldn't reach the list. Try again in a moment.",
} as const;

function openBeehiiv(opener: HTMLButtonElement): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = LOADER;
  script.dataset.beehiivForm = opener.dataset.beehiivForm ?? "";
  opener.replaceWith(script);
}

function field<T extends HTMLElement>(tag: string, set: Partial<T> & Record<string, unknown>): T {
  return Object.assign(document.createElement(tag), set) as T;
}

function openOurForm(opener: HTMLButtonElement): void {
  const email = field<HTMLInputElement>("input", { id: "lead-email", type: "email", name: "email", autocomplete: "email", placeholder: "you@example.com" });
  const label = field<HTMLLabelElement>("label", { htmlFor: "lead-email", textContent: "Your email" });
  // A box no person sees or tabs to: a robot that fills every input fills this one, and the list ignores it.
  const trap = field<HTMLInputElement>("input", { type: "text", name: "website", tabIndex: -1, autocomplete: "off" });
  trap.setAttribute("aria-hidden", "true");
  const wrap = field<HTMLDivElement>("div", { className: "lead-trap" });
  wrap.append(trap);
  const send = field<HTMLButtonElement>("button", { className: "btn", type: "submit", textContent: "Tell me" });
  const status = field<HTMLParagraphElement>("p", { className: "lead-status", id: "lead-status" });
  status.setAttribute("role", "status");
  const form = field<HTMLFormElement>("form", { className: "lead-form", noValidate: true });
  form.append(label, email, wrap, send, status);
  opener.replaceWith(form);
  email.focus();

  const say = (words: string, kind: "good" | "bad") => { status.textContent = words; status.dataset.kind = kind; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!LOOKS_LIKE_AN_ADDRESS.test(address)) { say(SAID.notAnAddress, "bad"); return; }
    send.disabled = true;
    try {
      const res = await fetch(LEADS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, source: "landing", website: trap.value }),
      });
      if (res.status === 202) { form.replaceChildren(status); say(SAID.thanks, "good"); return; }
      say(res.status === 429 ? SAID.slowDown : res.status === 422 ? SAID.notAnAddress : SAID.unreachable, "bad");
    } catch {
      say(SAID.unreachable, "bad");
    }
    send.disabled = false;
  });
}

function sayItIsOurs(): void {
  const fp = document.querySelector("#fp-email + p");
  if (fp) fp.textContent = "The “Be the first to know” form sends your email address to Trick or Treat, and nothing else: no tracker, no third party. We keep the address and the day you left it, and email you once when we launch. Every email has a link that takes you off the list.";
}

const opener = document.querySelector<HTMLButtonElement>("#notify-open");
if (opener) {
  opener.hidden = false;
  if (LEADS_URL) sayItIsOurs();
  opener.addEventListener("click", () => (LEADS_URL ? openOurForm(opener) : openBeehiiv(opener)), { once: true });
}

export {};
