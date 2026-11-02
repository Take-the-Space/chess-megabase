/**
 * Данные мегабазы: индекс метаданных (статика воркера) + тела партий
 * с Sailbox-библиотеки, которая спит и просыпается по запросу.
 *
 * Индекс — один компактный JSON (~15 МБ, ~1.9 МБ в gzip от Cloudflare).
 * Кешируем в IndexedDB по ETag: повторные визиты отрабатывают офлайн-быстро.
 */

/** Внешний адрес Sailbox-библиотеки (HTTP-ингресс, wake-on-demand). */
export const BOX_URL = "https://sb-15ca5b18-9463-491a-81ae-07f260ec300e-80.sail.box";

/** Лёгкий заслон от сканеров: проверяется сервером библиотеки. */
export const DB_API_KEY = "6b194801a048de958bad42b9d041fb4c";

/** Одна запись индекса (компактные ключи — ради ~15 МБ на 115k партий). */
export interface MetaRow {
  /** id партии, например carlsen-00915 */
  i: string;
  /** белые */
  w: string;
  /** чёрные */
  b: string;
  /** результат: 1-0 | 0-1 | 1/2-1/2 | * */
  r: string;
  /** дата AAAA.ММ.ДД (возможны ?) */
  d: string;
  /** турнир */
  e: string;
  /** код дебюта ECO */
  eco: string;
  /** число полуходов (оценка по movetext) */
  p: number;
}

const DB_NAME = "chess-megabase";
const STORE = "meta";
const ETAG_KEY = "etag";
const DATA_KEY = "data";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<unknown | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Загружает индекс: сначала IndexedDB (если ETag совпал), потом сеть. */
export async function loadMeta(onProgress?: (note: string) => void): Promise<MetaRow[]> {
  onProgress?.("Открываем локальный кеш…");
  try {
    const head = await fetch("/data/meta.json", { method: "HEAD" });
    const etag = head.headers.get("etag") ?? "";
    const cached = (await idbGet(ETAG_KEY)) as string | undefined;
    if (etag && cached === etag) {
      const data = (await idbGet(DATA_KEY)) as MetaRow[] | undefined;
      if (data) {
        onProgress?.(`Индекс из кеша: ${data.length.toLocaleString("ru")} партий`);
        return data;
      }
    }
  } catch {
    /* кеш не критичен */
  }

  onProgress?.("Качаем индекс (один раз, ~2 МБ)…");
  const res = await fetch("/data/meta.json");
  if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`);
  const rows = (await res.json()) as MetaRow[];
  try {
    const etag = res.headers.get("etag") ?? "";
    if (etag) {
      await idbPut(ETAG_KEY, etag);
      await idbPut(DATA_KEY, rows);
    }
  } catch {
    /* нет IndexedDB — просто работаем без кеша */
  }
  onProgress?.(`${rows.length.toLocaleString("ru")} партий в индексе`);
  return rows;
}

/** Тело партии с Sailbox. Бокс может спать — ретраим до пробуждения. */
export async function fetchGameBody(
  id: string,
  onStatus?: (note: string) => void,
): Promise<string> {
  const url = `${BOX_URL}/g/${encodeURIComponent(id)}.pgn`;
  const attempts = 20;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { "x-db-key": DB_API_KEY } });
      if (res.ok) return await res.text();
      onStatus?.(attempt === 1 ? "Библиотека спит — будим…" : `Пробуждаем… попытка ${attempt}`);
    } catch {
      onStatus?.(attempt === 1 ? "Библиотека спит — будим…" : `Пробуждаем… попытка ${attempt}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(1000 + attempt * 500, 3000)));
  }
  throw new Error("Библиотека не отвечает — попробуйте ещё раз позже");
}

/** Подстрочный поиск без учёта регистра по игрокам и турниру. */
export function searchGames(rows: MetaRow[], query: string, limit = 100): MetaRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const hits: { row: MetaRow; score: number }[] = [];
  for (const row of rows) {
    const hay = `${row.w} ${row.b} ${row.e}`.toLowerCase();
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const idx = hay.indexOf(t);
      if (idx < 0) { ok = false; break; }
      // Имя начинается с запроса — весомее.
      score += idx === 0 || hay[idx - 1] === " " || hay[idx - 1] === "," ? 2 : 1;
    }
    if (ok) hits.push({ row, score });
  }
  hits.sort((a, b) => b.row.d.localeCompare(a.row.d) || b.score - a.score);
  return hits.slice(0, limit).map((h) => h.row);
}

export function formatMeta(row: MetaRow): string {
  const date = row.d === "????.??.??" ? "" : row.d.slice(0, 4);
  return [row.e, date, row.eco].filter(Boolean).join(" · ");
}
