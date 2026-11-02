// @ts-check
import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";
import UnoCSS from "@unocss/astro";

export default defineConfig({
  // Публичные страницы — статические (SEO, скорость), приложение — остров Solid.
  output: "static",
  integrations: [solid(), UnoCSS()],
  vite: {
    build: { target: "es2022" },
  },
});
