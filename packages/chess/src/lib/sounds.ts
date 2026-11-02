/**
 * Синтезированные звуки ходов: короткий «клик» дерева, как у lichess.
 * WebAudio без внешних файлов; создаётся лениво по первому ходу.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Короткий щелчок: осциллятор + резкий спад громкости. */
function tick(freq: number, duration: number, gain: number, delay = 0): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t0 = ac.currentTime + delay;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + duration);
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

export type SoundKind = "move" | "capture" | "check" | "end";

export function playSound(kind: SoundKind): void {
  switch (kind) {
    case "move":
      tick(820, 0.06, 0.08);
      break;
    case "capture":
      tick(260, 0.09, 0.14);
      tick(420, 0.05, 0.08, 0.02);
      break;
    case "check":
      tick(660, 0.07, 0.1);
      tick(990, 0.07, 0.1, 0.09);
      break;
    case "end":
      tick(440, 0.1, 0.12);
      tick(330, 0.14, 0.12, 0.12);
      tick(220, 0.2, 0.12, 0.26);
      break;
  }
}
