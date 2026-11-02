/**
 * Библиотека партий: поиск по игрокам в локальном индексе + просмотрщик
 * на доске lichess. Тело партии подгружается со спящего Sailbox.
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { isNormal, makeSquare, type Color, type Position } from "chessops";
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";

import { ChessBoard } from "@chess-starter/chess";
import type { Key } from "@chess-starter/chess";

import { formatMeta, fetchGameBody, loadMeta, searchGames, type MetaRow } from "../data/library.ts";
import { LofiEngine } from "../lib/lofi.ts";

interface Frame {
  fen: string;
  turn: Color;
  check: boolean;
  san: string;
  lastMove: [Key, Key] | undefined;
}

function startFrame(position: Position): Frame {
  return {
    fen: makeFen(position.toSetup()),
    turn: position.turn,
    check: position.isCheck(),
    san: "",
    lastMove: undefined,
  };
}

function parseFrames(pgn: string): Frame[] {
  const game = parsePgn(pgn)[0];
  if (!game) return [startFrame(Chess.default())];
  const start = startingPosition(game.headers);
  let position: Position = start.isOk ? start.value : Chess.default();
  const frames = [startFrame(position)];
  for (const node of game.moves.mainline()) {
    const move = parseSan(position, node.san ?? "");
    if (!move) break;
    position = position.clone();
    position.play(move);
    frames.push({
      fen: makeFen(position.toSetup()),
      turn: position.turn,
      check: position.isCheck(),
      san: node.san ?? "",
      lastMove: isNormal(move) ? [makeSquare(move.from), makeSquare(move.to)] : undefined,
    });
  }
  return frames;
}

function moveLabel(ply: number): string {
  const number = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${number}.` : `${number}...`;
}

const SPEEDS: { label: string; ms: number }[] = [
  { label: "Медленно", ms: 3200 },
  { label: "Спокойно", ms: 1800 },
  { label: "Бодро", ms: 900 },
];

const RESULT_RU: Record<string, string> = {
  "1-0": "1–0",
  "0-1": "0–1",
  "1/2-1/2": "½",
  "*": "*",
};

export function LibraryApp() {
  const [meta, setMeta] = createSignal<MetaRow[]>([]);
  const [bootNote, setBootNote] = createSignal("Загрузка…");
  const [booted, setBooted] = createSignal(false);

  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<MetaRow[]>([]);

  const [current, setCurrent] = createSignal<MetaRow | undefined>(undefined);
  const [pgn, setPgn] = createSignal<string | undefined>(undefined);
  const [loadNote, setLoadNote] = createSignal("");

  const [cursor, setCursor] = createSignal(0);
  const [orientation, setOrientation] = createSignal<Color>("white");
  const [playing, setPlaying] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [musicOn, setMusicOn] = createSignal(false);

  const lofi = new LofiEngine();

  onMount(async () => {
    try {
      const rows = await loadMeta(setBootNote);
      setMeta(rows);
      setBooted(true);
      setBootNote("");
      // ?game=<id> из ссылки — грузим сразу.
      const wanted = new URLSearchParams(window.location.search).get("game");
      if (wanted) {
        const row = rows.find((r) => r.i === wanted);
        if (row) void pickGame(row);
      }
    } catch (e) {
      setBootNote(`Индекс не загрузился: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // Поиск с дебаунсом по всему индексу.
  createEffect(() => {
    const q = query();
    const rows = meta();
    const timer = window.setTimeout(() => setHits(searchGames(rows, q, 60)), 180);
    onCleanup(() => clearTimeout(timer));
  });

  const frames = createMemo(() => (pgn() ? parseFrames(pgn()!) : []));
  const frame = createMemo(() => {
    const f = frames();
    return f[Math.min(cursor(), f.length - 1)] ?? startFrame(Chess.default());
  });

  const go = (target: number) => {
    const last = frames().length - 1;
    setCursor(Math.max(0, Math.min(target, last)));
  };
  const step = (delta: number) => go(cursor() + delta);

  createEffect(() => {
    if (!playing()) return;
    const timer = window.setInterval(() => {
      if (cursor() >= frames().length - 1) {
        setPlaying(false);
        return;
      }
      step(1);
    }, SPEEDS[speed()]!.ms);
    onCleanup(() => clearInterval(timer));
  });

  const toggleMusic = () => {
    if (musicOn()) {
      lofi.stop();
      setMusicOn(false);
    } else {
      void lofi.start();
      setMusicOn(true);
    }
  };

  const pickGame = async (row: MetaRow) => {
    setPlaying(false);
    setCursor(0);
    setCurrent(row);
    setPgn(undefined);
    setLoadNote("Запрашиваем партию…");
    try {
      const body = await fetchGameBody(row.i, setLoadNote);
      setPgn(body);
      setLoadNote("");
    } catch (e) {
      setLoadNote(e instanceof Error ? e.message : String(e));
    }
  };

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") { setPlaying(false); step(-1); }
      else if (event.key === "ArrowRight") { setPlaying(false); step(1); }
      else if (event.key === "Home") { setPlaying(false); go(0); }
      else if (event.key === "End") { setPlaying(false); go(frames().length - 1); }
      else if (event.key === " ") { event.preventDefault(); setPlaying((v) => !v); }
      else if (event.key.toLowerCase() === "m") toggleMusic();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  onCleanup(() => lofi.stop());

  const resultOf = (row: MetaRow) => RESULT_RU[row.r] ?? row.r;
  const whose = (name: string, focus?: string) => (focus && name === focus ? "text-signal" : "");

  return (
    <div class="mx-auto w-full max-w-[1080px] px-4">
      {/* Поиск */}
      <div class="py-4">
        <Show when={!booted()} fallback={
          <input
            class="w-full border border-line bg-panel px-4 py-3 text-text rounded-sm placeholder:text-faint focus:border-signal focus:outline-none"
            placeholder="Игрок или турнир: Морозевич, Карлсен, Билль…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        }>
          <span class="label">{bootNote()}</span>
        </Show>
      </div>

      <div class="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Результаты поиска */}
        <div class="panel max-h-[80vh] overflow-y-auto p-3 lg:max-h-[720px]">
          <span class="section-title px-1">Партии</span>
          <Show when={hits().length > 0}>
            <span class="label px-1">{hits().length < 60 ? hits().length : "первые 60"} найдено</span>
          </Show>
          <div class="mt-2 grid gap-1">
            <For each={hits()}>
              {(row) => (
                <button
                  class={`border-l-2 px-2 py-1.5 text-left transition-colors ${
                    current()?.i === row.i
                      ? "border-signal bg-panel-2"
                      : "border-transparent hover:border-line hover:bg-panel-2"
                  }`}
                  onClick={() => void pickGame(row)}
                >
                  <span class="block truncate text-sm">
                    <span class={whose(row.w, current()?.w)}>{row.w}</span>
                    <span class="text-faint"> — </span>
                    <span class={whose(row.b, current()?.b)}>{row.b}</span>
                  </span>
                  <span class="block truncate text-xs text-faint">
                    {formatMeta(row)} {resultOf(row) !== "*" ? `· ${resultOf(row)}` : ""}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Доска + управление */}
        <div class="grid gap-4">
          <Show when={current()} fallback={
            <div class="panel grid place-items-center p-10">
              <p class="label">Найдите партию — например, «Морозевич» или «Гельфанд»</p>
            </div>
          }>
            <div class="mx-auto w-full max-w-[560px]">
              <div class="board-frame">
                <ChessBoard
                  fen={frame().fen}
                  orientation={orientation()}
                  turnColor={frame().turn}
                  dests={new Map()}
                  lastMove={frame().lastMove}
                  check={frame().check}
                  interactive={false}
                  onMove={() => {}}
                />
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button class="btn" title="В начало (Home)" onClick={() => { setPlaying(false); go(0); }}>
                  ⏮
                </button>
                <button class="btn" title="Назад (←)" onClick={() => { setPlaying(false); step(-1); }}>
                  ◀
                </button>
                <button class="btn-primary" title="Автоплей (пробел)" onClick={() => setPlaying((v) => !v)}>
                  {playing() ? "⏸ Пауза" : "▶ Автоплей"}
                </button>
                <button class="btn" title="Вперёд (→)" onClick={() => { setPlaying(false); step(1); }}>
                  ▶
                </button>
                <button class="btn" title="В конец (End)" onClick={() => { setPlaying(false); go(frames().length - 1); }}>
                  ⏭
                </button>
                <select
                  class="border border-line bg-panel-2 px-2 py-2 text-sm text-muted rounded-sm"
                  value={speed()}
                  onChange={(e) => setSpeed(Number(e.currentTarget.value))}
                >
                  {SPEEDS.map((s, i) => (
                    <option value={i}>{s.label}</option>
                  ))}
                </select>
                <button
                  class={`btn ${musicOn() ? "border-signal text-signal" : ""}`}
                  title="Генеративная lofi-музыка (M)"
                  onClick={toggleMusic}
                >
                  {musicOn() ? "♫ Музыка" : "♪ Тишина"}
                </button>
              </div>

              <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span class="label">
                  Ход {cursor() === 0 ? "—" : `${moveLabel(cursor() - 1)} ${frame().san}`} из {frames().length - 1}
                </span>
                <button class="btn-ghost" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
                  ⇅ Перевернуть доску
                </button>
              </div>

              {/* Заголовок и статус загрузки */}
              <div class="panel mt-4 p-4">
                <Show when={current()} fallback={null}>
                  {(c) => (
                    <span class="section-title">
                      {c().w} — {c().b} {resultOf(c())}
                    </span>
                  )}
                </Show>
                <Show when={current()}>
                  {(c) => <p class="label mt-1">{formatMeta(c())} · {c().p} полуходов</p>}
                </Show>
                <Show when={loadNote()}>
                  <p class="mt-2 text-sm text-signal">{loadNote()}</p>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
