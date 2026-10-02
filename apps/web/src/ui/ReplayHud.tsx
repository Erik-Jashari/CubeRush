import { useEffect, useRef } from 'react';
import { REPLAY_SPEEDS, useReplay } from '../game/replay';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';

/** Controls for watching a finished solve back. */
export function ReplayHud() {
  const playing = useReplay((s) => s.playing);
  const speed = useReplay((s) => s.speed);
  const durationMs = useReplay((s) => s.durationMs);
  const { togglePlay, restart, setSpeed } = useReplay.getState();
  const backToResult = useGame((s) => s.backToResult);
  const clock = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // The clock runs every frame, so it's written straight to the DOM.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const { clockMs, durationMs } = useReplay.getState();
      if (clock.current) clock.current.textContent = formatTime(clockMs);
      if (bar.current)
        bar.current.style.transform = `scaleX(${durationMs ? clockMs / durationMs : 0})`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="hud">
      <header className="hud__top">
        <button className="btn btn--ghost" onClick={backToResult}>
          ← Back
        </button>
        <div className="timer">
          <span className="timer__label">Replay</span>
          <span ref={clock} className="timer__value" />
        </div>
        <div className="stat">
          <span className="stat__label">Total</span>
          <span className="stat__value">{formatTime(durationMs)}</span>
        </div>
      </header>

      <footer className="hud__bottom">
        <div className="replay__track" aria-hidden>
          <div ref={bar} className="replay__bar" />
        </div>
        <div className="hud__actions">
          <button className="btn btn--primary" onClick={togglePlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn" onClick={restart}>
            Restart
          </button>
        </div>
        <div className="tabs replay__speeds" role="group" aria-label="Playback speed">
          {REPLAY_SPEEDS.map((s) => (
            <button
              key={s}
              className={`tabs__tab${s === speed ? ' tabs__tab--on' : ''}`}
              aria-pressed={s === speed}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
