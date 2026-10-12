# trick or treat — landing page

Static marketing site (Vite + TypeScript, no UI framework): `index.html` (landing) and `about.html` (how it works / what it doesn't do). Built to the owner's boards `Home.dc.html` and `About.dc.html`. Fonts (Geist, Nunito 800) are bundled locally; no trackers, analytics or third-party requests.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (note: same port as the app default; use -- --port 5180)
npm run build      # -> dist/
npm test           # builds, checks links, checks no horizontal overflow at 375/768/1280/1920
npm run shots      # after build: full-page screenshots into ./shots
```

## Config

No config. The Vite `base` is `/landing-page/` (GitHub Pages project URL), so use `http://localhost:5173/landing-page/` in dev. "Sign in" and "See your month" read "Coming soon" until the app is public; there is no link to the app.

## Deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on push to `main`. Actions are pinned to full commit SHAs.

## Docker

```sh
docker build -t tot-landing .
docker run --rm -p 8080:80 tot-landing   # http://localhost:8080/landing-page/
```

## Tests

`npm test` needs a Chromium for Playwright: `npx playwright-core install chromium-headless-shell`, or set `CHROMIUM_PATH`.

`npm run test:changed` runs only the tests your branch can reach (vitest `--changed` against `origin/main`, or `BASE=<ref>`); a change to page code, config, scripts or docs runs everything.
The full `npm test` stays the gate for an epic branch merging to main.

`npm run check` (test integrity) fails when the branch edited, deleted or renamed an existing test, `.feature` file or fixture; added files are fine. Run it with `PR_TITLE` set to the PR title: a PR that holds only that change and is titled `Test change: <why>` may change them, and an unset title fails closed. It compares against `origin/main`, or `BASE=<ref>`. The protected globs are at the top of `scripts/check-test-integrity.sh`. This repo has no pull-request CI (only the Pages deploy), so the gate is this command plus god's check of the PR file list.
