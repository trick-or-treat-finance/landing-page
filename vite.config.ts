import { resolve } from "node:path";
import { defineConfig } from "vite";

// Served from https://trick-or-treat-finance.github.io/landing-page/ (GitHub Pages).
// Page links are relative; this base prefixes assets and public files.
export default defineConfig({
  base: "/landing-page/",
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
      },
    },
  },
});
