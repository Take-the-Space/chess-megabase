# chess-starter

Стартер шахматных веб-приложений (Telegram Mini App + обычный браузер) на
открытой доске lichess. Из него собираются обучающие приложения для детей
и взрослых — школы, тренеры, самостоятельная практика.

**Ядро:**
- [chessground](https://github.com/lichess-org/chessground) (BSD-2-Clause) — официальная доска lichess: drag'n'drop, подсветка легальных ходов, превращения, last move/check.
- [chessops](https://github.com/ornicar/chessops) (GPL-3.0-or-later) — движок правил lichess: легальность, SAN, статус партии.
- Клиентский бот (minimax с alpha-beta, 3 уровня) — без сервера.
- Звуки (WebAudio-синтез) и haptics Telegram.
- Дизайн-контракт Take the Space (тёмная тема, панели, сигнальный цвет) в `packages/ui`.

**Лицензия:** GPLv3 (следствие GPL-зависимости chessops). Тексты уведомлений — в конце файла.

## Структура

```
apps/web/            # приложение-оболочка: страницы, layout, брендинг
packages/chess/      # ядро: доска, правила, бот, звуки, Telegram-хелперы
packages/ui/         # дизайн-система (токены, UnoCSS preset)
```

`packages/chess` экспортирует:

```ts
import {
  ChessApp,      // готовый экран «играть с ботом» — база для любого обучающего приложения
  ChessBoard,    // обёртка chessground (контролируемая: fen, dests, lastMove, check, события)
  applyMove, legalDests, statusOf, needsPromotion, parsePosition, toFen, // правила
  chooseBotMove, // бот: level 1|2|3
  playSound,
  initMiniApp, telegramWebApp,
} from "@chess-starter/chess";
import "@chess-starter/chess/chess.css"; // раскладка поверх chessground
```

## Как создать новое приложение

1. **Use this template** (репозиторий помечен как template) → новый репозиторий в `Take-the-Space`.
2. Поменять имя воркера в `wrangler.jsonc` (`"name": "tts-<приложение>"`) — URL будет
   `https://tts-<приложение>.iosurun.workers.dev`.
3. Писать своё приложение:
   - простой путь — импортировать `ChessApp` и менять параметры/внешний вид;
   - свой сценарий (уроки, задачи, разбор) — собрать экран из `ChessBoard` +
     функций правил из `packages/chess`, глядя на `ChessApp.tsx` как на образец.
4. Брендинг: `apps/web/src/pages/index.astro`, заголовки в `Base.astro`.
5. Секреты деплоя (если ещё не в орге): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   → GitHub Actions сам задеплоит на push в `main` (job `deploy`; без секретов — только CI).

## Разработка

```bash
pnpm install
pnpm dev:web        # http://localhost:4321/app
pnpm typecheck
pnpm build
pnpm deploy         # wrangler deploy (нужен логин wrangler или CLOUDFLARE_API_TOKEN)
```

Telegram: @BotFather → /mybots → Bot Settings → Menu Button → URL страницы `/app/`.

## Уведомления о стороннем коде

- **chessground** — BSD-2-Clause, © lichess.org (Thibault Duplessis и контрибьюторы).
- **cburnett** — SVG-фигуры, © Colin M.L. Burnett (лицензия указана в CSS chessground).
- **chessops** — GPL-3.0-or-later, © ornicar/lila contributors; делает весь проект производным от GPL.
