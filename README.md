# chess-megabase

Мегабаза партий Take the Space: **115 142 партии** 24 элитных гроссмейстеров —
от Карлсена и Каспарова до Морозевича и Адамса. Мгновенный поиск по игрокам
и турнирам, чиловый просмотрщик на доске lichess, генеративная lofi-музыка.

**Архитектура** — индекс и тела разнесены, чтобы всё было почти бесплатно:

- **Cloudflare Worker** (`tts-chess-megabase`): статика приложения + индекс
  метаданных (`apps/web/public/data/meta.json`, ~15 МБ, ~1.9 МБ в gzip).
  Клиент один раз скачивает индекс, кладёт в IndexedDB (по ETag) и дальше
  ищет мгновенно, в том числе офлайн.
- **Sailbox-библиотека** (спящая VM, wake-on-demand): канонические PGN-файлы
  (79 МБ) + SQLite-индекс смещений. Крошечный HTTP-сервер отдаёт тело партии
  по `GET /g/<id>.pgn` (заголовок `x-db-key` — заслон от сканеров). Бокс спит
  при простое (>300 с) и просыпается от первого запроса (~1 с); пока он
  холодный — клиент ретраит с «Пробуждаем библиотеку…».
- **Просмотрщик**: доска chessground + парсер chessops, автоплей, горячие
  клавиши (←/→, Home/End, пробел — автоплей, M — музыка).

**Данные:** [pgnmentor.com](https://www.pgnmentor.com/files.html) — свободно
распространяемые файлы партий по игрокам (Carlsen 7818, Nakamura 10220,
Kasparov 2128, Morozevich 2793, … всего 115 142). Канонизация: UTF-8/LF,
разрезание по `[Event` после начала movetext (в файлах pgnmentor бывают
пустые строки внутри партий), индекс со смещениями.

**Ядро:**
- [chessground](https://github.com/lichess-org/chessground) (BSD-2-Clause) — официальная доска lichess.
- [chessops](https://github.com/ornicar/chessops) (GPL-3.0-or-later) — правила и PGN-парсер.
- Музыка — генеративный lofi на WebAudio, без внешних ассетов.

**Лицензия:** GPLv3 (следствие GPL-зависимости chessops). Тексты уведомлений — в конце файла.

## Разработка

```bash
pnpm install
pnpm dev:web        # http://localhost:4321/app
pnpm typecheck
pnpm build
pnpm deploy         # wrangler deploy (нужен логин wrangler или CLOUDFLARE_API_TOKEN)
```

## Уведомления о стороннем коде

- **chessground** — BSD-2-Clause, © lichess.org (Thibault Duplessis и контрибьюторы).
- **cburnett** — SVG-фигуры, © Colin M.L. Burnett (лицензия указана в CSS chessground).
- **chessops** — GPL-3.0-or-later, © ornicar/lila contributors; делает весь проект производным от GPL.
- **Партии** — pgnmentor.com (свободно распространяемые PGN-файлы игроков).
