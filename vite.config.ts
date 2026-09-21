import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Relative, not root-absolute: GitHub Pages project sites serve from a subpath
  // (username.github.io/repo-name/), not the domain root, so "/assets/..." 404s there.
  base: "./",
  build: {
    outDir: "dist",
  },
});
