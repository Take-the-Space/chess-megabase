/**
 * Дизайн-токены — единственный источник правды.
 *
 * Направление: «приборная доска». Основа — холодный сине-чёрный, цвет несёт
 * СМЫСЛ (positive/negative, сигнал внимания), а не украшает. Крупные радиусы
 * и тени на каждой поверхности — запрещены (см. DESIGN.md).
 */

export const tokens = {
  colors: {
    ink: "#0e141a",
    "ink-2": "#0a0f14",
    panel: "#161e26",
    "panel-2": "#1d2731",
    line: "#2a3641",
    "line-strong": "#3a4956",
    text: "#e7eef4",
    muted: "#94a7b4",
    faint: "#63737f",
    positive: "#78b05a",
    negative: "#c1564b",
    signal: "#e2a24a",
    danger: "#d0564b",
  },
  font: {
    display: '"Archivo", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
    text: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "Cascadia Mono", "JetBrains Mono", Menlo, monospace',
  },
  radius: {
    none: "0px",
    sm: "2px",
    DEFAULT: "4px",
    md: "6px",
  },
} as const;
