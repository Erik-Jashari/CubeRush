import confetti from 'canvas-confetti';
import { STICKER_COLORS } from '../scene/colors';

export function celebrate(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = Object.values(STICKER_COLORS);
  const fire = (x: number, angle: number) =>
    void confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 55,
      angle,
      origin: { x, y: 0.75 },
      colors,
    });
  fire(0.15, 60);
  fire(0.85, 120);
}
