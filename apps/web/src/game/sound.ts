import type { Move } from '@cuberush/cube-core';

/** The face a turn belongs to, for picking its note: outer layers by side, inner ones as slices. */
export function turnFace(move: Move, n: number): string {
  const faces = { x: ['L', 'R', 'M'], y: ['D', 'U', 'E'], z: ['B', 'F', 'S'] }[move.axis];
  if (move.from === 0 && move.to === n - 1) return 'rotation';
  if (move.to === n - 1) return faces[1]!;
  if (move.from === 0) return faces[0]!;
  return faces[2]!;
}

/** A major pentatonic scale, so any sequence of turns sounds pleasant. */
const NOTES: Record<string, number> = {
  R: 523.25, // C5
  L: 587.33, // D5
  U: 659.25, // E5
  D: 783.99, // G5
  F: 880.0, // A5
  B: 1046.5, // C6
  M: 440.0, // A4
  E: 392.0, // G4
  S: 329.63, // E4
  rotation: 261.63, // C4
};

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Created on first use; browsers only allow audio after the player has interacted. */
function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** A short, bright tick: filtered noise with a fast decay. */
function click(ctx: AudioContext): void {
  if (!noise) {
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2800;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0.35;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

function tone(ctx: AudioContext, frequency: number, at: number, length = 0.22, volume = 0.18) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A click per turn, or in melody mode the turn's note (an octave down when counterclockwise). */
export function playTurn(move: Move, n: number, melody: boolean): void {
  const ctx = audio();
  if (!ctx) return;
  if (!melody) {
    click(ctx);
    return;
  }
  const note = NOTES[turnFace(move, n)]!;
  tone(ctx, move.turns === -1 ? note / 2 : note, ctx.currentTime);
}

/** A rising arpeggio for a finished solve. */
export function playSolved(): void {
  const ctx = audio();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(ctx, f, ctx.currentTime + i * 0.09, 0.35, 0.16),
  );
}
