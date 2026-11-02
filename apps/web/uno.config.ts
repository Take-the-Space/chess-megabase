import { defineConfig, presetWind3 } from "unocss";

import { presetD2o } from "@chess-starter/ui/preset";

export default defineConfig({
  // presetWind3 — стандартные утилиты; presetD2o — наши токены и шорткаты.
  // Слоп-риск гасим не набором пресетов, а правилами из DESIGN.md.
  presets: [presetWind3(), presetD2o()],
});
