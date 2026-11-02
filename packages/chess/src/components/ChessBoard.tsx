/**
 * Solid-обёртка над chessground — опенсорсной доской lichess (BSD-2).
 * Компонент только рисует доску; правила и состояние игры — в lib/chessGame.
 */

import { createEffect, onCleanup, onMount } from "solid-js";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key as CgKey } from "chessground/types";
import type { Color } from "chessops";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "../styles/chess.css";

import type { Key } from "../lib/chessGame.ts";

/**
 * chessground типизирует dests/lastMove литеральными ключами ("e4"),
 * chessGame отдаёт строки — на границе компонента приводим типы.
 */
const toCg = {
  dests: (dests: Map<Key, Key[]>) => dests as Map<CgKey, CgKey[]>,
  lastMove: (lastMove: [Key, Key] | undefined) => lastMove as [CgKey, CgKey] | undefined,
};

export interface ChessBoardProps {
  fen: string;
  orientation: Color;
  turnColor: Color;
  /** Легальные назначения текущего цвета; пустая карта — ходить нельзя. */
  dests: Map<Key, Key[]>;
  lastMove: [Key, Key] | undefined;
  /** Есть ли шах у стороны, чей ход, — chessground сам подсветит короля. */
  check: boolean;
  /** Пользователь может двигать фигуры (false — когда ход бота/игра окончена). */
  interactive: boolean;
  onMove: (from: Key, to: Key) => void;
  /** ref на корневой элемент доски (для промо-пикера поверх доски). */
  boardRef?: (el: HTMLDivElement) => void;
}

export function ChessBoard(props: ChessBoardProps) {
  let el!: HTMLDivElement;
  let api: Api | null = null;

  const sync = () => {
    if (!api) return;
    api.set({
      fen: props.fen,
      turnColor: props.turnColor,
      orientation: props.orientation,
      lastMove: toCg.lastMove(props.lastMove),
      check: props.check || undefined,
      movable: {
        free: false,
        color: props.interactive ? props.turnColor : "both",
        dests: toCg.dests(props.dests),
        showDests: true,
        events: { after: (from, to) => props.onMove(from as Key, to as Key) },
      },
    });
  };

  onMount(() => {
    api = Chessground(el, {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      coordinates: true,
      coordinatesOnSquares: true,
      animation: { enabled: true, duration: 160 },
      movable: {
        free: false,
        color: props.turnColor,
        dests: toCg.dests(props.dests),
        showDests: true,
        events: { after: (from, to) => props.onMove(from as Key, to as Key) },
      },
      premovable: { enabled: false },
      drawable: { enabled: false },
      highlight: { lastMove: true, check: true },
    });
    props.boardRef?.(el);
    sync();
  });

  createEffect(sync);
  onCleanup(() => api?.destroy());

  return <div ref={(node) => (el = node)} class="board" />;
}
