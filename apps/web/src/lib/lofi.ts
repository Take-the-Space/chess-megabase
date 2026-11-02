/**
 * Генеративная lofi-музыка на WebAudio: мягкие пэды, арпеджио с ленивым
 * свингом и виниловый шум. Никаких внешних ассетов и API — всё синтез
 * в браузере. Стартует только по пользовательскому жесту (autoplay policy).
 */

const AUDIO_CONTEXT =
  typeof window !== "undefined" ? window.AudioContext : undefined;

/** Аккордовые прогрессии в полутонах от тоники (минорный чилл). */
const PROGRESSION: number[][] = [
  [0, 3, 7, 10, 14], // Am7(+9)
  [-5, 3, 8, 12, 15], // Fmaj7
  [3, 7, 10, 14, 17], // Cmaj7
  [-2, 5, 10, 14, 17], // G6
];

/** midi → частота. */
function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const seconds = 3;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class LofiEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private bar = 0;
  private nextBarTime = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private playing = false;

  /** Флаг для UI: играет ли сейчас музыка. */
  get isPlaying(): boolean {
    return this.playing;
  }

  async start(): Promise<void> {
    if (this.playing) return;
    if (!AUDIO_CONTEXT) return;
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    this.playing = true;
    this.nextBarTime = ctx.currentTime + 0.1;
    this.scheduleLoop();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    if (ctx && this.master) {
      // Плавный уход в тишину, чтобы не щёлкать.
      const now = ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.6);
    }
  }

  private build(): void {
    const ctx = new AUDIO_CONTEXT!();
    this.ctx = ctx;
    this.noiseBuffer = makeNoiseBuffer(ctx);

    const master = ctx.createGain();
    master.gain.value = 0;

    // Мягкий срез верхов — «тёплый» лоуфай-характер.
    const warmth = ctx.createBiquadFilter();
    warmth.type = "lowpass";
    warmth.frequency.value = 2400;
    warmth.Q.value = 0.4;

    // Пространство: дилей с обратной связью вместо честного реверба.
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;

    master.connect(warmth);
    warmth.connect(ctx.destination);
    warmth.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);

    this.master = master;
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
    this.startVinyl();
  }

  /** Тихий виниловый шум: полосовой шум + редкие щелчки. */
  private startVinyl(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.012;
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start();

    // Щелчки: короткие импульсы на редкой случайной сетке.
    const crackle = () => {
      if (!this.playing || !this.ctx || !this.master) return;
      const now = ctx.currentTime;
      const click = ctx.createOscillator();
      click.type = "square";
      click.frequency.value = 1800 + Math.random() * 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.015 + Math.random() * 0.02, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      click.connect(g);
      g.connect(this.master);
      click.start(now);
      click.stop(now + 0.04);
      setTimeout(crackle, 400 + Math.random() * 2600);
    };
    setTimeout(crackle, 1200);
  }

  /** Планировщик тактов: 4 аккорда × ~5 с, внутри такта — арпеджио. */
  private scheduleLoop(): void {
    const tick = () => {
      const ctx = this.ctx;
      if (!ctx || !this.playing) return;
      const barLen = 5.2;
      while (this.nextBarTime < ctx.currentTime + 1.0) {
        this.scheduleBar(this.nextBarTime, PROGRESSION[this.bar % PROGRESSION.length], barLen);
        this.bar++;
        this.nextBarTime += barLen;
      }
    };
    this.timer = window.setInterval(tick, 250);
    tick();
  }

  private scheduleBar(t0: number, chord: number[], barLen: number): void {
    // Пэд: две скользящие синусоиды на верхних голосах аккорда.
    this.pad(t0, barLen, chord[chord.length - 1]);
    this.pad(t0 + 0.4, barLen - 0.4, chord[1]);

    // Арпеджио: 8 нот на такт, ленивый джиттер темпа, октавные перелёты.
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const when = t0 + (i * barLen) / steps + (Math.random() - 0.5) * 0.08;
      if (Math.random() < 0.2) continue; // дыхание между нотами
      const note = chord[i % chord.length] + (Math.random() < 0.3 ? 12 : 0);
      this.pluck(when, note);
    }

    // Редкий низкий бас на сильную долю.
    if (Math.random() < 0.8) this.bass(t0 + 0.05, chord[0] - 24);
    if (Math.random() < 0.4) this.bass(t0 + barLen * 0.6, chord[0] - 24);
  }

  private pad(t: number, dur: number, note: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz(note + 60);
    osc.detune.value = (Math.random() - 0.5) * 10;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(900, t + dur / 2);
    lp.frequency.linearRampToValueAtTime(500, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);

    osc.connect(lp);
    lp.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  private pluck(t: number, note: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz(note + 72);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 1);
  }

  private bass(t: number, note: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz(note + 48);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 1.8);
  }
}
