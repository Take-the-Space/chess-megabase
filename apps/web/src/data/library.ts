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

/**
 * Транслитерация кириллицы в латиницу (только строчные + ё: до транслита
 * строка всегда приводится к нижнему регистру).
 */
const CYR: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/**
 * Фонетическая редукция латиницы: однопроходная свёртка диграфов и одиночных
 * букв так, чтобы транслит кириллицы и оригинальная латиница давали одну форму.
 * «Карлсен» → karlsen = reduce("Carlsen").
 */
function reduceLatin(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    switch (src[i]) {
      case "s":
        if (src.startsWith("shch", i)) { out += "s"; i += 4; }
        else if (src.startsWith("sch", i)) { out += "s"; i += 3; }
        else if (src.startsWith("sh", i)) { out += "s"; i += 2; }
        else { out += "s"; i++; }
        break;
      case "z":
        if (src.startsWith("zh", i)) { out += "z"; i += 2; } else { out += "z"; i++; }
        break;
      case "k":
        if (src.startsWith("kh", i)) { out += "k"; i += 2; } else { out += "k"; i++; }
        break;
      case "t":
        if (src.startsWith("ts", i) || src.startsWith("tz", i)) { out += "k"; i += 2; } else { out += "t"; i++; }
        break;
      case "c":
        if (src.startsWith("ch", i) || src.startsWith("ck", i)) { out += "k"; i += 2; } else { out += "k"; i++; }
        break;
      case "j":
        if (src.startsWith("ja", i)) { out += "a"; i += 2; }
        else if (src.startsWith("ju", i)) { out += "u"; i += 2; }
        else { out += "i"; i++; }
        break;
      case "y":
        if (src.startsWith("ya", i)) { out += "a"; i += 2; }
        else if (src.startsWith("yu", i)) { out += "u"; i += 2; }
        else { out += "i"; i++; }
        break;
      case "i":
        if (src.startsWith("iy", i)) { out += "i"; i += 2; }
        else if (src.startsWith("ia", i)) { out += "a"; i += 2; }
        else { out += "i"; i++; }
        break;
      case "x": out += "ks"; i++; break;
      case "w": out += "v"; i++; break;
      default: out += src[i]; i++;
    }
  }
  return out;
}

/** Кеш редуцированных hay-строк: привязан к identity массива rows. */
let reducedCache: { rows: MetaRow[]; hays: string[] } | null = null;

/** Редуцированные hay-строки индекса: строятся лениво, один раз на массив rows. */
function reducedHays(rows: MetaRow[]): string[] {
  if (reducedCache && reducedCache.rows === rows) return reducedCache.hays;
  const hays = rows.map((r) => reduceLatin(`${r.w} ${r.b} ${r.e}`.toLowerCase()));
  reducedCache = { rows, hays };
  return hays;
}

/** Подстрочный поиск без учёта регистра по игрокам и турниру. */
export function searchGames(rows: MetaRow[], query: string, limit = 100): MetaRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Кириллический запрос: транслит запроса + редукция обеих сторон,
  // иначе в латинском индексе («Carlsen») ничего не находится.
  if (/[а-яё]/.test(q)) {
    const nq = reduceLatin(q.replace(/[а-яё]/g, (ch) => CYR[ch] ?? ch));
    // Ъ/Ь транслитерируются в пустые строки — пустых термов быть не должно,
    // иначе запрос из одних «ъ» матчил бы весь индекс.
    const nterms = nq.split(/\s+/).filter(Boolean);
    if (!nterms.length) return [];
    const hays = reducedHays(rows);
    const found: { row: MetaRow; score: number }[] = [];
    for (let n = 0; n < rows.length; n++) {
      const row = rows[n]!;
      const hay = hays[n]!;
      let score = 0;
      let ok = true;
      for (const t of nterms) {
        const idx = hay.indexOf(t);
        if (idx < 0) { ok = false; break; }
        // Скоринг тот же, что в латинском пути: начало имени весомее.
        score += idx === 0 || hay[idx - 1] === " " || hay[idx - 1] === "," ? 2 : 1;
      }
      if (ok) found.push({ row, score });
    }
    found.sort((a, b) => b.row.d.localeCompare(a.row.d) || b.score - a.score);
    return found.slice(0, limit).map((h) => h.row);
  }

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
