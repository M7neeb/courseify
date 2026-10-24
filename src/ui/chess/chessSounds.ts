// Board sounds for games: a wooden knock for a move, a sharper one for a capture, a ping for
// check. Made with the Web Audio API on the fly, so there is nothing to download. Played only
// while "Sounds" is on in the board settings and in the app's Settings.

import type { Move } from 'chess.js';
import { app } from '../../core/state.svelte.ts';
import { chessPrefs } from './prefs.svelte.ts';

/** Board sounds need both switches: the board's own and the app-wide Sounds setting. */
const enabled = (): boolean => chessPrefs.sounds && app.settings.sounds;

let context: AudioContext | undefined;

function ctx(): AudioContext | undefined {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return undefined;
    context ??= new Ctx();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return undefined;
  }
}

/** A short percussive hit: a pitch that drops fast, through a band of noise-like overtones. */
function knock(at: number, pitch: number, volume: number, length = 0.07) {
  const c = ctx();
  if (!c) return;
  const start = c.currentTime + at;
  for (const [mult, type, share] of [
    [1, 'triangle', 1],
    [2.7, 'square', 0.18]
  ] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(pitch * mult, start);
    osc.frequency.exponentialRampToValueAtTime(pitch * mult * 0.55, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * share, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
}

function ping(at: number, pitch: number, volume: number, length = 0.16) {
  const c = ctx();
  if (!c) return;
  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = pitch;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** The right sound for a move that was just played. */
export function playMoveSound(move: Move, givesCheck: boolean): void {
  if (!enabled()) return;
  try {
    if (givesCheck) {
      knock(0, 210, 0.2);
      ping(0.03, 880, 0.05);
    } else if (move.flags.includes('k') || move.flags.includes('q')) {
      knock(0, 200, 0.18);
      knock(0.09, 180, 0.16);
    } else if (move.captured) {
      knock(0, 330, 0.24, 0.06);
      knock(0.025, 150, 0.16, 0.08);
    } else if (move.promotion) {
      knock(0, 200, 0.18);
      ping(0.04, 1046, 0.04);
    } else {
      knock(0, 190, 0.2);
    }
  } catch {
    // Sound is a nice-to-have.
  }
}

export function playGameStart(): void {
  if (!enabled()) return;
  ping(0, 523, 0.05);
  ping(0.1, 784, 0.05);
}

export function playGameEnd(): void {
  if (!enabled()) return;
  ping(0, 784, 0.05, 0.22);
  ping(0.14, 523, 0.05, 0.3);
}

/** A soft tick when your clock runs low. */
export function playLowTime(): void {
  if (!enabled()) return;
  ping(0, 1320, 0.04, 0.08);
  ping(0.16, 1320, 0.04, 0.08);
}
