/**
 * UnoCSS-пресет Dota 2 Oracle.
 *
 * Даёт наши токены в виде утилит (`text-signal`, `bg-panel`, `border-line`…)
 * и короткий набор шорткатов для повторяющихся паттернов интерфейса.
 *
 * Важно: мы не добавляем дефолтных «красивых» теней и крупных радиусов —
 * публичная поверхность строится на линиях и плотности (см. DESIGN.md).
 */

import type { Preset } from "unocss";

import { tokens } from "./tokens.ts";

export function presetD2o(): Preset {
  return {
    name: "@chess-starter/ui",
    theme: {
      colors: tokens.colors,
      fontFamily: {
        display: tokens.font.display,
        text: tokens.font.text,
        mono: tokens.font.mono,
      },
      borderRadius: tokens.radius,
    },
    shortcuts: [
      // Поверхности: рамка вместо тени, малый радиус — «приборный» вид.
      ["panel", "border border-line bg-panel rounded-sm"],
      ["panel-2", "border border-line bg-panel-2 rounded-sm"],
      [
        "btn",
        "inline-flex items-center gap-2 border border-line-strong bg-panel-2 px-3 py-2 text-sm text-text rounded-sm transition-colors duration-150 hover:border-signal hover:text-signal",
      ],
      [
        "btn-primary",
        "inline-flex items-center gap-2 border border-signal bg-signal px-3 py-2 text-sm font-medium text-ink rounded-sm transition-colors duration-150 hover:bg-signal/90",
      ],
      ["btn-ghost", "inline-flex items-center gap-2 px-2 py-1 text-sm text-muted rounded-sm hover:text-text"],
      // Заголовок секции с тонкой линией — повторяющийся элемент страниц.
      ["section-title", "font-display text-sm text-text"],
      // Данные: числа всегда моноширинные, чтобы колонки выравнивались.
      ["stat-num", "font-mono tabular-nums text-text"],
      ["label", "text-xs text-muted"],
    ],
    rules: [
      // Табличные цифры для любых числовых блоков.
      ["tabular-nums", { "font-variant-numeric": "tabular-nums" }],
    ],
  };
}
