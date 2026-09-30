# Backlog

- [design] Home/About boards contain no [DATE] or footer/legal content; a footer (privacy, terms, contact) is undecided, index.html:end (worker-landing-initial, 2026-09-29)
- [design] Hero art is a crop of brand/trick-or-trat-logo.png (board's blob was not in the spec folder); replace with the owner's exact export, public/hero.jpg (worker-landing-initial, 2026-09-29)
- [ops] Dev server default port 5173 collides with the app's default sign-in URL port, vite.config.ts (worker-landing-initial, 2026-09-29)
- [tooling] No coverage provider or fast-check installed (no network); add @vitest/coverage-v8 and fast-check as devDependencies and a coverage threshold, package.json:devDependencies (worker-landing-engine, 2026-09-29)
- [design] Motion spec says lines "fan out on a 300 ms stagger"; engine reads it as a 300 ms window across all ownable lines (12 lines) not 300 ms per line, confirm, src/engine/flip.ts:FLIP.fanOutMs (worker-landing-engine, 2026-09-29)
- [design] direction.html still shows the 5-category placeholder split and generic monogram tiles; replace with SAMPLE_MONTH and the 12 company tiles, direction.html:164-184 (worker-landing-engine, 2026-09-29)
