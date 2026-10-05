// The owner's ghost-state art on the home page: every one reserves its square (no layout
// shift), loads lazily (none is the LCP image), is decorative (the words beside it say it),
// and its files exist and stay small. Files are made by scripts/ghosts/cutout.py.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve("index.html"), "utf8");
const ghosts = html.match(/<img class="(?:how|cta)-ghost"[^>]*>/g) ?? [];

describe("ghost states on the home page", () => {
  it("shows the four story ghosts: syncing, pick-companies, payday, then empty-welcome by the sign-up", () => {
    expect(ghosts.map((tag) => /ghosts\/([a-z-]+)-256/.exec(tag)?.[1])).toEqual(["syncing", "pick-companies", "payday", "empty-welcome"]);
  });

  it("each reserves its square, loads lazily and is decorative", () => {
    for (const tag of ghosts) {
      const w = /width="(\d+)"/.exec(tag)?.[1];
      expect(w, tag).toBeDefined();
      expect(tag).toContain(`height="${w}"`);
      expect(tag).toContain('loading="lazy"');
      expect(tag).toContain('alt=""');
    }
  });

  it("has both files for each, each small", () => {
    for (const tag of ghosts) {
      for (const [file, limit] of [[/src="\/([^"]+)"/.exec(tag)?.[1], 60_000], [/(ghosts\/[a-z-]+-512\.webp)/.exec(tag)?.[1], 120_000]] as const) {
        expect(statSync(resolve("public", file as string)).size, file).toBeLessThan(limit);
      }
    }
  });
});
