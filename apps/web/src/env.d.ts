/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Адрес API (Worker). Пусто — используется тот же origin, путь /api. */
  readonly PUBLIC_API_BASE?: string;
  /** Username бота (без @) для кнопки Telegram Login Widget. */
  readonly PUBLIC_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
