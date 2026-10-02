import { formatMoves, SURVIVAL } from '@cuberush/cube-core';
import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { useProfile } from '../net/profile';
import { leaveRound, startRound, useSession } from '../net/session';
import { MODE_INFO } from './modes';
import { Timer } from './Timer';

function RoundBadge() {
  const mode = useGame((s) => s.mode);
  const attempt = useSession((s) => s.attempt);
  const creator = useSession((s) => s.challenge?.creator);
  const signedIn = useProfile((s) => s.player !== null);
  const kind = attempt
    ? attempt.ranked
      ? 'Ranked'
      : 'Practice'
    : signedIn
      ? 'Offline · not saved'
      : 'Guest · not saved';
  const name = mode === 'challenge' && creator ? `Challenge from ${creator}` : MODE_INFO[mode].name;
  return (
    <div className="hud__badge">
      {name} · {kind}
    </div>
  );
}

/** Lives, waves solved, and a bar draining toward the next wave. */
function SurvivalPanel() {
  const run = useGame((s) => s.survival)!;
  const bar = useRef<HTMLDivElement>(null);

  // Runs the wave clock: deadlines are checked every frame while the run lasts.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const game = useGame.getState();
      game.tick();
      const { survival, startedAt } = useGame.getState();
      if (bar.current && survival && startedAt !== null) {
        const left = survival.waveStartedAt + SURVIVAL.waveMs - (performance.now() - startedAt);
        const fraction = Math.min(1, Math.max(0, left / SURVIVAL.waveMs));
        bar.current.style.transform = `scaleX(${survival.endedAt === null ? fraction : 0})`;
        bar.current.dataset.urgent = String(fraction < 0.25);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="survival" aria-live="polite">
      <span className="survival__lives" aria-label={`${run.lives} lives left`}>
        {Array.from({ length: SURVIVAL.lives }, (_, i) => (
          <span key={i} className={i < run.lives ? 'life' : 'life life--lost'} aria-hidden>
            ♥
          </span>
        ))}
      </span>
      <span>Wave {run.wave + 1}</span>
      <span>{run.cleared} solved</span>
      <div className="survival__track" aria-hidden>
        <div ref={bar} className="survival__bar" />
      </div>
    </div>
  );
}

function Hint() {
  const mode = useGame((s) => s.mode);
  const status = useGame((s) => s.status);
  if (status === 'memorizing') {
    return <p className="hud__hint">Memorize the cube. The stickers go blank when time is up.</p>;
  }
  if (mode === 'blindfold' && status === 'solving') {
    return <p className="hud__hint">Solve from memory. Turns still work, colors don’t show.</p>;
  }
  if (mode === 'survival' && status === 'solving') {
    return (
      <p className="hud__hint">
        Solve each wave before the bar runs out. Miss it and you lose a life while the next wave
        piles on.
      </p>
    );
  }
  if (status === 'ready' || status === 'inspecting') {
    return (
      <p className="hud__hint">
        Drag a sticker to turn its layer · drag the background or right-drag to look around
        <br />
        The timer starts on your first turn
      </p>
    );
  }
  return null;
}

export function Hud() {
  const mode = useGame((s) => s.mode);
  const moveCount = useGame((s) => s.moveCount);
  const scramble = useGame((s) => s.scramble);
  const canUndo = useGame((s) => s.status === 'solving' && s.undoStack.length > 0);
  const countdownEndsAt = useGame((s) => s.countdownEndsAt);
  const canPeek = useGame((s) => s.mode === 'blindfold' && s.status === 'solving' && !s.peeked);
  const survival = useGame((s) => s.survival !== null);
  const starting = useSession((s) => s.starting);
  const { undo, goHome, endCountdown, peek } = useGame.getState();

  // Inspection or memorization running out starts the clock.
  useEffect(() => {
    if (countdownEndsAt === null) return;
    const id = window.setTimeout(() => endCountdown(), countdownEndsAt - performance.now());
    return () => window.clearTimeout(id);
  }, [countdownEndsAt, endCountdown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const home = () => {
    leaveRound();
    goHome();
  };

  return (
    <div className="hud">
      <header className="hud__top">
        <button className="btn btn--ghost" onClick={home} aria-label="Back to home">
          ← Home
        </button>
        <Timer />
        <div className="stat">
          <span className="stat__label">Moves</span>
          <span className="stat__value">{moveCount}</span>
        </div>
      </header>

      <RoundBadge />
      {survival && <SurvivalPanel />}

      <footer className="hud__bottom">
        <Hint />
        {/* Blindfold hides the scramble too, or it could be undone from the notation. */}
        {scramble.length > 0 && mode !== 'blindfold' && (
          <p className="scramble" aria-label={survival ? 'Latest wave' : 'Scramble'}>
            {formatMoves(scramble)}
          </p>
        )}
        <div className="hud__actions">
          <button className="btn" onClick={() => undo()} disabled={!canUndo}>
            Undo
          </button>
          {canPeek && (
            <button className="btn" onClick={peek} title="Show the colors; loses the ×2 bonus">
              Peek
            </button>
          )}
          <button
            className="btn"
            onClick={() => void startRound(mode, { retry: true })}
            disabled={starting}
            title="Replay this scramble as practice"
          >
            Restart
          </button>
          {mode !== 'daily' && mode !== 'challenge' && (
            <button
              className="btn btn--primary"
              onClick={() => void startRound(mode)}
              disabled={starting}
            >
              {mode === 'survival' ? 'New run' : 'New scramble'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
