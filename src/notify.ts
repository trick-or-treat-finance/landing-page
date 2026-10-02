// "Be the first to know": a plain HTML form that posts natively to Buttondown's embed-subscribe endpoint
// (their docs say not to call it with fetch: the reply may need a CAPTCHA or a fix the visitor must see).
// The username lives in index.html on #notify-form's action, nowhere else. No third-party script, email only.
const form = document.querySelector<HTMLFormElement>("#notify-form");
const thanks = document.querySelector<HTMLElement>("#notify-thanks");
const err = document.querySelector<HTMLElement>("#notify-err");
const wait = document.querySelector<HTMLElement>("#notify-wait");
const input = document.querySelector<HTMLInputElement>("#notify-email");

export const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isConfigured = (action: string): boolean => /^https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/[\w.-]+$/.test(action) && !/YOUR-BUTTONDOWN-USERNAME/.test(action);

if (form && thanks && err && wait && input) {
  const fail = (msg: string): void => {
    err.textContent = msg;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  };
  const ready = isConfigured(form.getAttribute("action") ?? "");
  if (!ready) {
    // Never pretend to take an email we cannot send.
    input.disabled = true;
    form.querySelector<HTMLButtonElement>(".notify-btn")!.disabled = true;
    wait.hidden = false;
  }
  form.noValidate = true; // our own message, not the browser bubble; without JS the native check still runs
  form.addEventListener("submit", (e) => {
    if (!ready) return e.preventDefault();
    if (!looksLikeEmail(input.value)) {
      e.preventDefault();
      return fail("That doesn’t look like an email. Try again?");
    }
    err.hidden = true;
    input.removeAttribute("aria-invalid");
    // Let the native post go (opens Buttondown in a new tab). We cannot read its reply, so we only say what happens next.
    setTimeout(() => {
      form.hidden = true;
      thanks.hidden = false;
      thanks.focus();
    }, 0);
  });
}
