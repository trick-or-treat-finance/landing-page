# trick or treat — landing page

Static marketing site (Vite + TypeScript, no UI framework): `index.html` (landing) and `about.html` (how it works / what it can't do). Built to the owner's boards `Home.dc.html` and `About.dc.html`. Fonts (Geist, Nunito 800) are bundled locally; no trackers, analytics or third-party requests.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (note: same port as the app default; use -- --port 5180)
npm run build      # -> dist/
npm test           # builds, checks links, checks no horizontal overflow at 375/768/1280/1920
npm run shots      # after build: full-page screenshots into ./shots
```

## Config

One value: `VITE_APP_URL`, the target of every "Sign in" / "See your month" link (default `http://localhost:5173/signin`). Set at build time, see `.env.example`.

## Docker

```sh
docker build --build-arg VITE_APP_URL=https://app.example.com/signin -t tot-landing .
docker run --rm -p 8080:80 tot-landing
```

## Tests

`npm test` needs a Chromium for Playwright: `npx playwright-core install chromium-headless-shell`, or set `CHROMIUM_PATH`.
