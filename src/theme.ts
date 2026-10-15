// Day / night, one button on every page. A choice made on one page holds on the next;
// with no choice saved, the system setting decides. Storage can be blocked: then it lasts the page.
const KEY = "tot-theme";
const root = document.documentElement;
const saved = ((): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } })();
if (saved === "dark" || saved === "light") root.dataset.theme = saved;

const dark = (): boolean => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
const btn = document.querySelector<HTMLButtonElement>("#theme");
if (btn) {
  // The label names the mode a press switches to, matching the icon.
  const paint = (): void => { btn.setAttribute("aria-label", dark() ? "Switch to light mode" : "Switch to dark mode"); };
  btn.addEventListener("click", () => {
    root.dataset.theme = dark() ? "light" : "dark";
    try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* blocked: this page only */ }
    paint();
    btn.classList.remove("swap");
    void btn.offsetWidth;
    btn.classList.add("swap");
  });
  btn.addEventListener("animationend", () => btn.classList.remove("swap"));
  paint();
}
