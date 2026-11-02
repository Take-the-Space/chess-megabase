/**
 * Правила шахмат — только chessops (движок правил lichess).
 * Компоненты и бот не знают ничего про правила, кроме этого модуля.
 */

import {
  type Color,
  type Move,
  type Position,
  type Role,
  type Square,
  isNormal,
  makeSquare,
  parseSquare,
  squareRank,
} from "chessops";
import { Chess } from "chessops/chess";
import { INITIAL_FEN, makeFen, parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";

export type { Color, Role, Move, Position };

/**
 * Цель хода на доске — ключ вида "e4" (формат chessground).
 * Строка, а не число-chessops Square: Map в chessground типизирован строками.
 */
export type Key = string;

export interface GameMove {
  san: string;
  from: Key;
  to: Key;
  color: Color;
  /** FEN позиции после хода. */
  fen: string;
}

export interface GameStatus {
  /** У кого ход (в текущей позиции). */
  turn: Color;
  check: boolean;
  over: boolean;
  winner: Color | null;
  reason: string | null;
}

export function initialFen(): string {
  return INITIAL_FEN;
}

export function parsePosition(fen: string): Position | null {
  const parts = parseFen(fen);
  if (parts.isErr) return null;
  const setup = Chess.fromSetup(parts.value);
  return setup.isErr ? null : setup.value;
}

export function fenOf(position: Position): string {
  return makeFen(position.toSetup());
}

/** Легальные назначения стороны, чей сейчас ход, — формат chessground. */
export function legalDests(position: Position): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const [from, targets] of position.allDests()) {
    const keys: Key[] = [];
    for (const to of targets) keys.push(makeSquare(to));
    dests.set(makeSquare(from), keys);
  }
  return dests;
}

/** Нужна ли лигиция: пешка идёт на последнюю горизонталь обычным ходом. */
export function needsPromotion(position: Position, from: Key, to: Key): boolean {
  const fromSq = parseSquare(from);
  if (fromSq === undefined) return false;
  const piece = position.board.get(fromSq);
  if (!piece || piece.role !== "pawn") return false;
  const toSq = parseSquare(to);
  if (toSq === undefined) return false;
  const lastRank = piece.color === "white" ? 7 : 0;
  return squareRank(toSq) === lastRank;
}

/**
 * Кандидаты на ход из a в b: превращение пешки даёт до четырёх ходов.
 * Легальность проверяем через position.isLegal — chessground присылает
 * только легальные from/to, но перестраховаться дешевле, чем играть illegal.
 */
function moveCandidates(position: Position, from: Square, to: Square): Move[] {
  const piece = position.board.get(from);
  if (!piece) return [];
  const base: Move = { from, to };
  const lastRank = piece.color === "white" ? 7 : 0;
  if (piece.role === "pawn" && squareRank(to) === lastRank) {
    return [
      { from, to, promotion: "queen" },
      { from, to, promotion: "knight" },
      { from, to, promotion: "rook" },
      { from, to, promotion: "bishop" },
    ];
  }
  return [base];
}

/** Легальные ходы из a в b (может быть несколько — превращения). */
export function legalMoves(position: Position, from: Key, to: Key): Move[] {
  const fromSq = parseSquare(from);
  const toSq = parseSquare(to);
  if (fromSq === undefined || toSq === undefined) return [];
  return moveCandidates(position, fromSq, toSq).filter((m) => position.isLegal(m));
}

export interface ApplyResult {
  position: Position;
  move: GameMove;
  /** Матовка/пат и пр. — статус после хода. */
  status: GameStatus;
  /** Был ли ход взятием (включая взятие на проходе) — для звука. */
  capture: boolean;
}

/** Применить ход (с превращением или без) и вернуть новое состояние. */
export function applyMove(
  position: Position,
  from: Key,
  to: Key,
  promotion?: Role,
): ApplyResult | null {
  const fromSq = parseSquare(from);
  const toSq = parseSquare(to);
  if (fromSq === undefined || toSq === undefined) return null;

  const legal = moveCandidates(position, fromSq, toSq).filter((m) => position.isLegal(m));
  if (!legal.length) return null;
  const move =
    (promotion ? legal.find((m) => isNormal(m) && m.promotion === promotion) : undefined) ??
    legal[0];
  if (!move) return null;

  const moved = position.board.get(fromSq);
  const target = position.board.get(toSq);
  const enPassant = isNormal(move) && moved?.role === "pawn" && move.to === position.epSquare;
  const capture = target !== undefined || Boolean(enPassant);

  const san = makeSan(position.clone(), move);
  const next = position.clone();
  next.play(move);

  const gameMove: GameMove = { san, from, to, color: position.turn, fen: fenOf(next) };
  return { position: next, move: gameMove, status: statusOf(next), capture };
}

/** Статус позиции: ход, шах, конец. */
export function statusOf(position: Position): GameStatus {
  const turn = position.turn;
  const check = position.isCheck();
  if (position.isEnd()) {
    if (position.isCheckmate()) {
      return {
        turn,
        check,
        over: true,
        winner: turn === "white" ? "black" : "white",
        reason: "checkmate",
      };
    }
    if (position.isStalemate()) {
      return { turn, check, over: true, winner: null, reason: "stalemate" };
    }
    if (position.isInsufficientMaterial()) {
      return { turn, check, over: true, winner: null, reason: "insufficient material" };
    }
    return { turn, check, over: true, winner: null, reason: "draw" };
  }
  return { turn, check, over: false, winner: null, reason: null };
}

/** Клетка короля цвета — для подсветки шаха (как на lichess). */
export function kingKey(position: Position, color: Color): Key | undefined {
  const king = position.board.kingOf(color);
  return king === undefined ? undefined : makeSquare(king);
}

/** FEN текущей позиции (undo восстанавливает по нему). */
export { fenOf as toFen };
