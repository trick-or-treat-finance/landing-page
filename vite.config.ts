/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import {
  defaultSandbox, receiptLines, sandboxChips, sandboxRows, sandboxTally, sandboxTotal, tiles,
} from "./src/render";
import { growSection } from "./src/grow-view";

// The home page ships complete: the receipt, the tiles and the sandbox defaults are written
// into the HTML at build time from the same engine the browser uses, so it reads with JS off.
function staticParts(): Plugin {
  return {
    name: "static-parts",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const st = defaultSandbox();
        return html
          .replace("<!--@grow-->", growSection())
          .replace("<!--@lines-->", receiptLines())
          .replace("<!--@tiles-->", tiles("/"))
          .replace("<!--@chips-->", sandboxChips())
          .replace("<!--@rows-->", sandboxRows())
          .replace("<!--@total-->", sandboxTotal(st))
          .replace("<!--@detail-->", sandboxTally(st, "/"));
      },
    },
  };
}

// Served from https://trick-or-treat-finance.github.io/landing-page/ (GitHub Pages).
// Page links are relative; this base prefixes assets and public files.
export default defineConfig({
  base: "/landing-page/",
  plugins: [staticParts()],
  test: {
    // The browser suites ran 5-6 s per test at load average ~500 (the 5 s default failed header-contrast, issue #20 and eggs tests that pass alone); 30 s clears the slowest with margin.
    testTimeout: 30_000,
    // Separate setting: testTimeout does not reach beforeEach/afterEach, and any hook without its own timeout (the suites set 60-120 s on beforeAll/afterAll) got the 10 s default.
    hookTimeout: 60_000,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
        "hello-hacker": resolve(import.meta.dirname, "hello-hacker.html"),
        // GitHub Pages serves dist/404.html, with an HTTP 404, for every unknown path.
        notfound: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
});
