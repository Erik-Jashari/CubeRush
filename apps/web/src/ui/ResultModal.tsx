import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { useSettings } from '../game/settings';
import { formatTime } from '../game/time';
import { celebrate } from './confetti';

/** Delay so the final turn finishes animating before the card covers the cube. */
const SHOW_AFTER_MS = 900;

export function ResultModal() {
  const result = useGame((s) => s.result);
  const mode = useGame((s) => s.mode);
  const { restart, goHome, startGame } = useGame.getState();
  const inspection = useSettings((s) => s.inspection);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!result) {
      dialog.current?.close();
      return;
    }
    celebrate();
    const id = window.setTimeout(() => dialog.current?.showModal(), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [result]);

  const p = result?.points;
  return (
    <dialog ref={dialog} className="result" onCancel={(e) => e.preventDefault()}>
      {result && p && (
        <>
          <p className="result__eyebrow">
            {mode === 'daily' ? 'Daily scramble solved' : 'Solved!'}
          </p>
          <p className="result__time">{formatTime(result.timeMs)}</p>
          <p className="result__moves">{result.moveCount} moves</p>

          <dl className="points">
            <div>
              <dt>Speed</dt>
              <dd>+{p.time}</dd>
            </div>
            <div>
              <dt>Move efficiency</dt>
              <dd>+{p.moves}</dd>
            </div>
            <div>
              <dt>No undo</dt>
              <dd>{p.noUndo > 0 ? `+${p.noUndo}` : '—'}</dd>
            </div>
            <div className="points__total">
              <dt>Points</dt>
              <dd>{p.total}</dd>
            </div>
          </dl>

          {mode === 'daily' && (
            <p className="result__note">The daily leaderboard arrives with online play.</p>
          )}

          <div className="result__actions">
            {mode === 'quick' && (
              <button
                className="btn btn--primary"
                onClick={() => startGame('quick', { inspection })}
              >
                New scramble
              </button>
            )}
            <button className="btn" onClick={() => restart()}>
              Try again
            </button>
            <button className="btn btn--ghost" onClick={goHome}>
              Home
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
