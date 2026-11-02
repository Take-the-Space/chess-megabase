/**
 * Telegram Mini App: тонкая обёртка над window.Telegram.WebApp.
 *
 * Приложение одно и то же для веба и Mini App — здесь только адаптация:
 * распознать среду, отдать initData для API, привести хром к нашей теме.
 */

export interface TelegramWebApp {
  initData: string;
  colorScheme?: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string } };
  /** Тактильная отдача. Есть только внутри Mini App. */
  hapticFeedback?: {
    impactOccurred?(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred?(type: "error" | "success" | "warning"): void;
    selectionChanged?(): void;
  };
  /** Открывает инвойс Telegram Stars. Есть только внутри Mini App. */
  openInvoice?(url: string, callback?: (status: string) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isMiniApp(): boolean {
  return telegramWebApp() !== null;
}

/** Инициализация Mini App: разворачиваем, красим хром, помечаем <html>. */
export function initMiniApp(): void {
  const app = telegramWebApp();
  if (!app) return;
  document.documentElement.dataset.runtime = "telegram";
  app.ready();
  app.expand();
  app.setHeaderColor?.("#0e141a");
  app.setBackgroundColor?.("#0e141a");
}

export type InvoiceStatus = "paid" | "cancelled" | "failed" | "pending";

/**
 * Открывает инвойс Telegram Stars. Возвращает false вне Mini App — вызывающий
 * может показать ссылку или открыть её в новой вкладке.
 */
export function openStarsInvoice(
  url: string,
  onStatus?: (status: InvoiceStatus) => void,
): boolean {
  const app = telegramWebApp();
  if (!app?.openInvoice) return false;
  app.openInvoice(url, (status) => onStatus?.(normalizeInvoiceStatus(status)));
  return true;
}

function normalizeInvoiceStatus(raw: string): InvoiceStatus {
  return raw === "paid" || raw === "cancelled" || raw === "failed" || raw === "pending"
    ? raw
    : "pending";
}
