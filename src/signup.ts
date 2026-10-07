// The only code that talks to a third party: beehiiv's form is fetched when the visitor asks for it,
// so a page that is only read makes no request to any other site.
const LOADER = "https://subscribe-forms.beehiiv.com/v3/loader.js";

const opener = document.querySelector<HTMLButtonElement>("#notify-open");
if (opener) {
  opener.hidden = false;
  opener.addEventListener("click", () => {
    const script = document.createElement("script");
    script.async = true;
    script.src = LOADER;
    script.dataset.beehiivForm = opener.dataset.beehiivForm ?? "";
    opener.replaceWith(script);
  }, { once: true });
}

export {};
