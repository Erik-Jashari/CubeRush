import { formatMoves } from '@cuberush/cube-core';
import { useEffect } from 'react';
import { useGame } from '../game/store';
import { useSettings } from '../game/settings';
import { utcDateKey } from '../game/time';
import { Timer } from './Timer';

export function Hud() {
  const mode = useGame((s) => s.mode);
  const status = useGame((s) => s.status);
  const moveCount = useGame((s) => s.moveCount);
  const scramble = useGame((s) => s.scramble);
  const canUndo = useGame((s) => s.status === 'solving' && s.undoStack.length > 0);
  const inspectionEndsAt = useGame((s) => s.inspectionEndsAt);
  const { undo, restart, goHome, startGame, endInspection } = useGame.getState();
  const inspection = useSettings((s) => s.inspection);

  // Inspection running out starts the clock, as in competition.
  useEffect(() => {
    if (inspectionEndsAt === null) return;
    const id = window.setTimeout(() => endInspection(), inspectionEndsAt - performance.now());
    return () => window.clearTimeout(id);
  }, [inspectionEndsAt, endInspection]);

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

  const waiting = status === 'ready' || status === 'inspecting';

  return (
    <div className="hud">
      <header className="hud__top">
        <button className="btn btn--ghost" onClick={goHome} aria-label="Back to home">
          ← Home
        </button>
        <Timer />
        <div className="stat">
          <span className="stat__label">Moves</span>
          <span className="stat__value">{moveCount}</span>
        </div>
      </header>

      <div className="hud__badge">
        {mode === 'daily' ? `Daily scramble · ${utcDateKey()}` : 'Quick play'}
      </div>

      <footer className="hud__bottom">
        {waiting && (
          <p className="hud__hint">
            Drag a sticker to turn its layer · drag the background to look around
            <br />
            The timer starts on your first turn
          </p>
        )}
        <p className="scramble" aria-label="Scramble">
          {formatMoves(scramble)}
        </p>
        <div className="hud__actions">
          <button className="btn" onClick={() => undo()} disabled={!canUndo}>
            Undo
          </button>
          <button className="btn" onClick={() => restart()}>
            Restart
          </button>
          {mode === 'quick' && (
            <button className="btn btn--primary" onClick={() => startGame('quick', { inspection })}>
              New scramble
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
