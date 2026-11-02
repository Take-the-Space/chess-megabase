/**
 * Экран шахмат: доска lichess (chessground) + правила chessops + бот.
 * Вся логика клиентская — API и база не нужны.
 */

import { For, Match, Switch, createEffect, createMemo, createSignal, onMount, Show } from "solid-js";

import type { Color, Position, Role } from "chessops";

import { ChessBoard } from "./ChessBoard.tsx";
import {
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
} from "../lib/chessGame.ts";
import { chooseBotMove, type BotLevel } from "../lib/bot.ts";
import { playSound, type SoundKind } from "../lib/sounds.ts";
import { initMiniApp, telegramWebApp } from "../lib/telegram.ts";

interface GameState {
  position: Position;
  history: GameMove[];
}

const PROMO_PIECES: Role[] = ["queen", "knight", "rook", "bishop"];

const levelLabels: Record<BotLevel, string> = {
  1: "Level 1",
  2: "Level 2",
  3: "Level 3",
};

function newGame(): GameState {
  const position = parsePosition(initialFen());
  if (!position) throw new Error("initial FEN must parse");
  return { position, history: [] };
}

export function ChessApp() {
  const [game, setGame] = createSignal<GameState>(newGame());
  const [orientation, setOrientation] = createSignal<Color>("white");
  const [vsBot, setVsBot] = createSignal(true);
  const [botLevel, setBotLevel] = createSignal<BotLevel>(2);
  const [playerColor, setPlayerColor] = createSignal<Color>("white");
  const [soundOn, setSoundOn] = createSignal(true);
  const [pendingPromo, setPendingPromo] = createSignal<{ from: Key; to: Key } | null>(null);
  const [fenCopied, setFenCopied] = createSignal(false);

  // Токен отложенного хода бота: undo/new game обнуляют запланированный ход.
  let botToken = 0;
  let boardEl: HTMLDivElement | undefined;

  const botColor = createMemo<Color>(() => (playerColor() === "white" ? "black" : "white"));

  const status = createMemo<GameStatus>(() => statusOf(game().position));
  const lastMove = createMemo<[Key, Key] | undefined>(() => {
    const tail = game().history[game().history.length - 1];
    return tail ? [tail.from, tail.to] : undefined;
  });
  const checkKey = createMemo<Key | undefined>(() =>
    status().check ? kingKey(game().position, game().position.turn) : undefined,
  );
  /** Ходим, только если ход человека и игра не кончена. */
  const playable = createMemo(() => {
    if (status().over || pendingPromo()) return false;
    if (vsBot() && game().position.turn !== playerColor()) return false;
    return true;
  });
  const dests = createMemo(() => (playable() ? legalDests(game().position) : new Map<Key, Key[]>()));

  onMount(() => {
    initMiniApp();
  });

  function haptic(kind: "light" | "medium" = "light"): void {
    telegramWebApp()?.hapticFeedback?.impactOccurred?.(kind);
  }

  function sound(kind: SoundKind): void {
    if (soundOn()) playSound(kind);
  }

  function soundFor(st: GameStatus, capture: boolean): SoundKind {
    if (st.over) return "end";
    if (st.check) return "check";
    return capture ? "capture" : "move";
  }

  function doMove(from: Key, to: Key, promotion?: Role): void {
    const st = game();
    const result = applyMove(st.position, from, to, promotion);
    if (!result) return;
    botToken += 1; // любой ход отменяет запланированный ход бота
    setPendingPromo(null);
    setGame({ position: result.position, history: [...st.history, result.move] });
    sound(soundFor(result.status, result.capture));
    haptic(result.status.over ? "medium" : "light");
  }

  function onUserMove(from: Key, to: Key): void {
    if (needsPromotion(game().position, from, to)) {
      setPendingPromo({ from, to });
      return;
    }
    doMove(from, to);
  }

  // Ход бота: небольшой таймаут, чтобы кадр с ходом человека успел отрисоваться.
  createEffect(() => {
    const st = game();
    if (!vsBot() || status().over || pendingPromo()) return;
    if (st.position.turn === playerColor()) return;
    const level = botLevel();
    const token = ++botToken;
    setTimeout(() => {
      if (token !== botToken) return;
      const move = chooseBotMove(game().position, botColor(), level);
      if (move) doMove(move[0], move[1], move[2]);
    }, 240);
  });

  function cancelPromo(): void {
    setPendingPromo(null);
    // вернуть фигуру на место: перерисовать доску из состояния игры
    const st = game();
    setGame({ position: st.position, history: st.history });
  }

  function undo(): void {
    const st = game();
    if (!st.history.length) return;
    botToken += 1;
    const tail = st.history[st.history.length - 1];
    if (!tail) return;
    const plies = vsBot() && st.history.length >= 2 && tail.color === botColor() ? 2 : 1;
    const kept = st.history.slice(0, Math.max(0, st.history.length - plies));
    const last = kept[kept.length - 1];
    const fen = last ? last.fen : initialFen();
    const position = parsePosition(fen);
    if (!position) return;
    setPendingPromo(null);
    setGame({ position, history: kept });
  }

  function newGameWith(color: Color | "random"): void {
    botToken += 1;
    setPendingPromo(null);
    const chosen: Color = color === "random" ? (Math.random() < 0.5 ? "white" : "black") : color;
    setPlayerColor(chosen);
    setOrientation(chosen);
    setGame(newGame());
  }

  function flip(): void {
    setOrientation((o) => (o === "white" ? "black" : "white"));
  }

  async function copyFen(): Promise<void> {
    try {
      await navigator.clipboard.writeText(toFen(game().position));
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 1400);
    } catch {
      /* буфер недоступен — молча, копирование не критично */
    }
  }

  const statusText = createMemo(() => {
    const st = status();
    if (st.over) {
      if (st.winner) return `${st.winner === "white" ? "White" : "Black"} wins — ${st.reason}`;
      return `Draw — ${st.reason}`;
    }
    const side = st.turn === "white" ? "White" : "Black";
    if (vsBot() && st.turn === botColor()) return `${side} is thinking…`;
    return `${side} to move${st.check ? " — check" : ""}`;
  });

  /** SAN-список ходов парами: [1. e4, e5]. */
  const movePairs = createMemo(() => {
    const pairs: Array<{ n: number; white?: string; black?: string }> = [];
    for (const move of game().history) {
      if (move.color === "white") {
        pairs.push({ n: pairs.length + 1, white: move.san });
      } else if (pairs.length && !pairs[pairs.length - 1]?.black) {
        const prev = pairs[pairs.length - 1];
        if (prev) prev.black = move.san;
      } else {
        pairs.push({ n: pairs.length + 1, black: move.san });
      }
    }
    return pairs;
  });

  // Промо-пикер: позиция по файлу назначения и ориентации (как на lichess).
  const promoStyle = createMemo(() => {
    const p = pendingPromo();
    if (!p) return null;
    const file = p.to.charCodeAt(0) - 97;
    return {
      left: `${(file * 100) / 8}%`,
      fromTop: orientation() === "white",
    };
  });

  const promoColor = createMemo<Color>(() => game().position.turn);

  return (
    <div class="chess-app">
      <header class="topbar">
        <div class="brand">
          <span class="dot" aria-hidden="true" />
          <span class="font-display">Chess</span>
          <span class="label">mini app</span>
        </div>
        <button class="btn" onClick={() => setSoundOn(!soundOn())} aria-pressed={soundOn()}>
          {soundOn() ? "Sound on" : "Sound off"}
        </button>
      </header>

      <div class="board-zone">
        <div class="board-frame">
          <ChessBoard
            fen={toFen(game().position)}
            orientation={orientation()}
            turnColor={game().position.turn}
            dests={dests()}
            lastMove={lastMove()}
            check={checkKey() !== undefined}
            interactive={playable()}
            onMove={onUserMove}
            boardRef={(el) => (boardEl = el)}
          />
          <Show when={pendingPromo() && promoStyle()}>
            {(_accessor) => {
              const p = promoStyle()!;
              return (
                <div class="promo-picker" onClick={(e) => e.stopPropagation()}>
                  <For each={PROMO_PIECES}>
                    {(role, i) => (
                      <button
                        class="promo-piece"
                        style={{
                          left: p.left,
                          [p.fromTop ? "top" : "bottom"]: `${(i() * 100) / 8}%`,
                        }}
                        onClick={() => {
                          const pending = pendingPromo();
                          if (pending) doMove(pending.from, pending.to, role);
                        }}
                        aria-label={`Promote to ${role}`}
                      >
                        <span class={`piece ${role} ${promoColor()}`} aria-hidden="true" />
                      </button>
                    )}
                  </For>
                </div>
              );
            }}
          </Show>
        </div>
      </div>

      <div class="side">
        <section class="panel status">
          <div class="status-row">
            <span class={`turn-dot ${status().turn}`} aria-hidden="true" />
            <span class="status-text">{statusText()}</span>
          </div>
          <div class="controls">
            <button class="btn-primary" onClick={() => newGameWith("random")}>
              New game
            </button>
            <button class="btn" onClick={undo} disabled={!game().history.length}>
              Undo
            </button>
            <button class="btn" onClick={flip}>
              Flip
            </button>
            <button class="btn" onClick={copyFen}>
              {fenCopied() ? "Copied" : "Copy FEN"}
            </button>
          </div>
        </section>

        <section class="panel setup">
          <div class="setup-row">
            <span class="label">Opponent</span>
            <div class="segmented">
              <button class={vsBot() ? "seg seg-on" : "seg"} onClick={() => setVsBot(true)}>
                Bot
              </button>
              <button class={!vsBot() ? "seg seg-on" : "seg"} onClick={() => setVsBot(false)}>
                2 players
              </button>
            </div>
          </div>
          <Show when={vsBot()}>
            <div class="setup-row">
              <span class="label">Strength</span>
              <div class="segmented">
                <For each={[1, 2, 3] as BotLevel[]}>
                  {(lvl) => (
                    <button
                      class={botLevel() === lvl ? "seg seg-on" : "seg"}
                      onClick={() => setBotLevel(lvl)}
                    >
                      {levelLabels[lvl]}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="setup-row">
              <span class="label">Play as</span>
              <div class="segmented">
                <For each={["white", "black", "random"] as const}>
                  {(c) => (
                    <button class="seg" onClick={() => newGameWith(c)}>
                      {c === "random" ? "Random" : c === "white" ? "White" : "Black"}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </section>

        <section class="panel moves">
          <div class="moves-head">
            <span class="label">Moves</span>
            <span class="label mono">{game().history.length} plies</span>
          </div>
          <Switch>
            <Match when={movePairs().length === 0}>
              <p class="moves-empty">No moves yet — drag a piece or tap a square.</p>
            </Match>
            <Match when={true}>
              <ol class="move-list mono">
                <For each={movePairs()}>
                  {(pair) => (
                    <li>
                      <span class="move-num">{pair.n}.</span>
                      <span class="move-san">{pair.white}</span>
                      <span class="move-san">{pair.black ?? ""}</span>
                    </li>
                  )}
                </For>
              </ol>
            </Match>
          </Switch>
        </section>
      </div>

      {/* Отмена промо-пикера: тап мимо. */}
      <Show when={pendingPromo()}>
        <div class="promo-backdrop" onClick={cancelPromo} />
      </Show>
    </div>
  );
}
