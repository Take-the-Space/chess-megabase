/**
 * Ядро шахматного стартера: доска lichess (chessground) + правила chessops
 * + клиентский бот + звуки + Telegram Mini App-хелперы. Всё клиентское —
 * API и база не нужны.
 *
 * В приложении импортировать отсюда, а не из внутренних путей пакета:
 *   import { ChessApp } from "@chess-starter/chess";
 *   import "@chess-starter/chess/chess.css";  // раскладка поверх chessground
 */

export { ChessApp } from "./components/ChessApp.tsx";
export { ChessBoard } from "./components/ChessBoard.tsx";

export {
  applyMove,
  initialFen,
  kingKey,
  legalDests,
  needsPromotion,
  parsePosition,
  statusOf,
  toFen,
  type GameMove,
  type GameStatus,
  type Key,
} from "./lib/chessGame.ts";

export { chooseBotMove, type BotLevel, type BotMove } from "./lib/bot.ts";
export { playSound, type SoundKind } from "./lib/sounds.ts";
export { initMiniApp, telegramWebApp } from "./lib/telegram.ts";
