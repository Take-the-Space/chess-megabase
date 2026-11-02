/**
 * Простой бот: minimax с alpha-beta по material + piece-square tables.
 * Достаточно, чтобы мини-апп играл «против компьютера» без сервера.
 */

import { type Color, type Move, type Position, type Role, isNormal, makeSquare, squareRank } from "chessops";
import { parsePosition, type Key } from "./chessGame.ts";

const MATERIAL: Record<string, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0,
};

/** Оценка с точки зрения белых. */
function evaluate(position: Position): number {
  if (position.isCheckmate()) return position.turn === "white" ? -100000 : 100000;
  if (position.isStalemate() || position.isInsufficientMaterial()) return 0;

  let score = 0;
  for (const square of position.board.occupied) {
    const piece = position.board.get(square);
    if (!piece) continue;
    const rank = squareRank(square);
    const file = square % 8;
    let value = MATERIAL[piece.role] ?? 0;

    // Piece-square: пешки и лёгкие фигуры любят центр и продвижение.
    if (piece.role === "pawn") {
      const advancement = piece.color === "white" ? rank - 1 : 6 - rank;
      value += advancement * advancement * 4;
      const center = 3.5 - Math.abs(file - 3.5);
      value += Math.round(center * 6);
    } else if (piece.role === "knight" || piece.role === "bishop") {
      const center = 3.5 - Math.abs(file - 3.5);
      value += Math.round(center * 5);
    }
    score += piece.color === "white" ? value : -value;
  }
  return score;
}

function scoreFor(position: Position, color: Color): number {
  const raw = evaluate(position);
  return color === "white" ? raw : -raw;
}

/** Все упорядоченные ходы стороны, чей ход: взятия и превращения первыми. */
function orderedMoves(position: Position): Move[] {
  const moves: Move[] = [];
  for (const [from, targets] of position.allDests()) {
    const piece = position.board.get(from);
    for (const to of targets) {
      const lastRank = piece?.color === "white" ? 7 : 0;
      if (piece?.role === "pawn" && squareRank(to) === lastRank) {
        for (const promotion of ["queen", "knight", "rook", "bishop"] as Role[]) {
          moves.push({ from, to, promotion });
        }
      } else {
        moves.push({ from, to });
      }
    }
  }
  const weight = (m: Move) => {
    let w = 0;
    if (isNormal(m) && position.board.get(m.to)) w += 100;
    if (isNormal(m) && m.promotion) w += 80;
    return w;
  };
  return moves.sort((a, b) => weight(b) - weight(a));
}

function search(
  position: Position,
  depth: number,
  alpha: number,
  beta: number,
  color: Color,
): number {
  if (depth === 0 || position.isEnd()) return scoreFor(position, color);

  const maximizing = position.turn === color;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(position)) {
    const next = position.clone();
    next.play(move);
    const score = search(next, depth - 1, alpha, beta, color);
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Уровень бота: 1 — жадный, 2 — 2 полухода, 3 — 3 полухода. */
export type BotLevel = 1 | 2 | 3;

/** Ход бота: [from, to, promotion?]. */
export type BotMove = [Key, Key, Role?];

/** Выбрать ход для цвета color в текущей позиции. null — ходов нет. */
export function chooseBotMove(position: Position, color: Color, level: BotLevel): BotMove | null {
  if (position.isEnd() || position.turn !== color) return null;

  let bestScore = -Infinity;
  let bestMoves: BotMove[] = [];

  for (const move of orderedMoves(position)) {
    const next = position.clone();
    next.play(move);
    const score = search(next, level - 1, -Infinity, Infinity, color);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [botMoveOf(move)];
    } else if (score === bestScore) {
      // Случайность среди равных — бот не зацикливается.
      if (Math.random() < 0.5) bestMoves = [botMoveOf(move)];
    }
  }

  return bestMoves[0] ?? null;
}

function botMoveOf(move: Move): BotMove {
  // В обычных шахматах DropMove не бывает.
  if (!isNormal(move)) throw new Error("drop move in standard chess");
  const from = makeSquare(move.from);
  const to = makeSquare(move.to);
  return move.promotion ? [from, to, move.promotion] : [from, to];
}

export { parsePosition };
