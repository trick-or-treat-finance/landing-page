import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// The one config value: where "Sign in" and "See your month" go.
// Set VITE_APP_URL at build time; the default targets the local app.
export const DEFAULT_APP_URL = "http://localhost:5173/signin";

function appUrl(): Plugin {
  const url = process.env.VITE_APP_URL || DEFAULT_APP_URL;
  return {
    name: "app-url",
    transformIndexHtml: (html) => html.replaceAll("%APP_URL%", url),
  };
}

export default defineConfig({
  plugins: [appUrl()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about.html"),
      },
    },
  },
});
