# Backlog

- [design] Home/About boards contain no [DATE] or footer/legal content; a footer (privacy, terms, contact) is undecided, index.html:end (worker-landing-initial, 2026-09-29)
- [design] Hero art is a crop of brand/trick-or-trat-logo.png (board's blob was not in the spec folder); replace with the owner's exact export, public/hero.jpg (worker-landing-initial, 2026-09-29)
- [ops] Dev server default port 5173 collides with the app's default sign-in URL port, vite.config.ts (worker-landing-initial, 2026-09-29)
- [ci] Pages workflow runs build only; tests need a Chromium so are not run in CI, .github/workflows/pages.yml (worker-landing-golive, 2026-09-29)
- [design] Hero JPEG background (#faf6ee-ish) shows a faint box edge against the page background at 1280; match the page colour or mask the edge, public/hero.jpg + src/style.css:58 (worker-landing-v1-fix, 2026-09-29)
