// The "be the first to know" form. Built with VITE_LEADS_URL it posts the address, with the visitor's
// consent, to our own list when they submit and never before. Built without it the form is not offered.
// A page that is only read makes no request to any other site.
import "./signup.css";

const LEADS_URL: string = import.meta.env.VITE_LEADS_URL ?? "";
// Anything with an @, text either side and a dot after it. The server is the judge; this only saves a trip.
const LOOKS_LIKE_AN_ADDRESS = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

const SAID = {
  thanks: "Got it. We'll email you once, when it opens.",
  notAnAddress: "That doesn't look like an email address.",
  needConsent: "Please tick the box to say you agree to be emailed, then send again.",
  slowDown: "A lot of tries just now. Give it a bit and try again.",
  unreachable: "We couldn't reach the list. Try again in a moment.",
} as const;
// waitlist-1 in the backend's docs/waitlist.md. The list records which wording was agreed to, so do not reword it here.
const CONSENT = "I agree to be emailed once when this launches, and I can leave the list from the link in that email.";

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
  const agree = field<HTMLInputElement>("input", { id: "lead-consent", type: "checkbox", name: "consent", checked: false });
  agree.setAttribute("aria-describedby", "lead-status");
  const agreeLabel = field<HTMLLabelElement>("label", { htmlFor: "lead-consent", textContent: CONSENT });
  const consent = field<HTMLDivElement>("div", { className: "lead-consent" });
  consent.append(agree, agreeLabel);
  const send = field<HTMLButtonElement>("button", { className: "btn", type: "submit", textContent: "Tell me" });
  const status = field<HTMLParagraphElement>("p", { className: "lead-status", id: "lead-status" });
  status.setAttribute("role", "alert");
  const form = field<HTMLFormElement>("form", { className: "lead-form", noValidate: true });
  form.append(label, email, consent, status, wrap, send);
  opener.replaceWith(form);
  email.focus();

  agree.addEventListener("change", () => { if (agree.checked) agree.removeAttribute("aria-invalid"); });
  const say = (words: string, kind: "good" | "bad") => { status.textContent = words; status.dataset.kind = kind; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = email.value.trim();
    if (!LOOKS_LIKE_AN_ADDRESS.test(address)) { say(SAID.notAnAddress, "bad"); return; }
    if (!agree.checked) { agree.setAttribute("aria-invalid", "true"); say(SAID.needConsent, "bad"); agree.focus(); return; }
    agree.removeAttribute("aria-invalid");
    send.disabled = true;
    try {
      const res = await fetch(LEADS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, source: "landing", consent: true, website: trap.value }),
      });
      if (res.status === 202) { form.replaceChildren(status); say(SAID.thanks, "good"); return; }
      say(res.status === 429 ? SAID.slowDown : res.status === 422 ? SAID.notAnAddress : SAID.unreachable, "bad");
    } catch {
      say(SAID.unreachable, "bad");
    }
    send.disabled = false;
  });
}

const opener = document.querySelector<HTMLButtonElement>("#notify-open");
if (opener && LEADS_URL) {
  opener.hidden = false;
  opener.addEventListener("click", () => openOurForm(opener), { once: true });
}

export {};
