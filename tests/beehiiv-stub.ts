import type { Browser, BrowserContext } from "playwright-core";

// The page embeds beehiiv's sign-up loader. Tests must not depend on that live third party (it opens an iframe
// that keeps loading analytics, so "networkidle" never settles), so every browser the tests launch answers
// the beehiiv origin with an empty 200 instead. The request is still made and still seen by the tests.
export const BEEHIIV = "https://subscribe-forms.beehiiv.com";
const stub = (ctx: BrowserContext) => ctx.route(`${BEEHIIV}/**`, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));

export function stubBeehiiv(browser: Browser): Browser {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => { const c = await newContext(...a); await stub(c); return c; };
  browser.newPage = async (...a) => (await browser.newContext(a[0])).newPage();
  return browser;
}
