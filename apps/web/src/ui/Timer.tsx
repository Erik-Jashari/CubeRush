import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';

type TimerSource = Pick<
  ReturnType<typeof useGame.getState>,
  'status' | 'startedAt' | 'finishedAt' | 'countdownEndsAt'
>;

export function timerText(s: TimerSource, now: number): string {
  switch (s.status) {
    case 'inspecting':
    case 'memorizing':
      return String(Math.max(0, Math.ceil(((s.countdownEndsAt ?? now) - now) / 1000)));
    case 'ready':
      return formatTime(0);
    case 'solving':
      return formatTime(now - (s.startedAt ?? now));
    case 'solved':
      return formatTime((s.finishedAt ?? now) - (s.startedAt ?? now));
  }
}

const LABELS: Record<TimerSource['status'], string> = {
  ready: 'Time',
  inspecting: 'Inspection',
  memorizing: 'Memorize',
  solving: 'Time',
  solved: 'Solved',
};

/** Updates its text every animation frame without re-rendering React. */
export function Timer() {
  const ref = useRef<HTMLSpanElement>(null);
  const status = useGame((s) => s.status);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = timerText(useGame.getState(), performance.now());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`timer timer--${status}`} role="timer" aria-live="off">
      <span className="timer__label">{LABELS[status]}</span>
      <span ref={ref} className="timer__value" />
    </div>
  );
}
