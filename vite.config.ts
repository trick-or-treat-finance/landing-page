import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import {
  defaultSandbox, receiptLines, sandboxChips, sandboxRows, sandboxTally, sandboxTotal, tiles,
} from "./src/render";

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
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
      },
    },
  },
});
