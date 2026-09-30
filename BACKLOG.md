# Backlog

- [design] Home/About boards contain no [DATE] or footer/legal content; a footer (privacy, terms, contact) is undecided, index.html:end (worker-landing-initial, 2026-09-29)
- [design] Hero art is a crop of brand/trick-or-trat-logo.png (board's blob was not in the spec folder); replace with the owner's exact export, public/hero.jpg (worker-landing-initial, 2026-09-29)
- [ops] Dev server default port 5173 collides with the app's default sign-in URL port, vite.config.ts (worker-landing-initial, 2026-09-29)
- [design] Hero crop has faint row banding at its right/top edge where the company tiles were painted out; replace with the owner's tile-free export, public/hero.jpg (worker-landing-golive, 2026-09-29)
- [ci] Pages workflow runs build only; tests need a Chromium so are not run in CI, .github/workflows/pages.yml (worker-landing-golive, 2026-09-29)
