// "Be the first to know": one email field, POSTed to the form's own `action`.
// TODO(provider): the action URL lives in index.html on #notify-form and nowhere else.
// While it is empty nothing is sent (the thank-you still shows, so the page can be reviewed).
// No third-party script, no tracker: a plain fetch to the action, email only.
const form = document.querySelector<HTMLFormElement>("#notify-form");
const thanks = document.querySelector<HTMLElement>("#notify-thanks");
const err = document.querySelector<HTMLElement>("#notify-err");
const input = document.querySelector<HTMLInputElement>("#notify-email");

export const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

if (form && thanks && err && input) {
  const fail = (msg: string): void => {
    err.textContent = msg;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  };
  form.noValidate = true; // our own message, not the browser bubble; without JS the native check still runs
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!looksLikeEmail(email)) return fail("That doesn’t look like an email. Try again?");
    err.hidden = true;
    input.removeAttribute("aria-invalid");
    const action = form.getAttribute("action") ?? "";
    if (action) {
      try {
        // no-cors: most form endpoints do not send CORS headers; the reply is opaque, a resolved fetch counts as sent.
        await fetch(action, { method: "POST", body: new URLSearchParams({ email }), mode: "no-cors", referrerPolicy: "no-referrer", credentials: "omit" });
      } catch {
        return fail("Couldn’t send that. Check your connection and try again.");
      }
    } else console.warn("notify: no form action configured yet, nothing was sent");
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus();
  });
}
