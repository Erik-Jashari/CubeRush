import { useGame } from '../game/store';
import { useSettings } from '../game/settings';
import { utcDateKey } from '../game/time';

export function Home() {
  const startGame = useGame((s) => s.startGame);
  const inspection = useSettings((s) => s.inspection);
  const update = useSettings((s) => s.update);

  return (
    <main className="home">
      <div className="home__panel">
        <h1 className="home__title">
          Cube<span>Rush</span>
        </h1>
        <p className="home__tagline">Scramble. Solve. Beat the clock.</p>

        <div className="home__actions">
          <button
            className="btn btn--primary btn--big"
            onClick={() => startGame('quick', { inspection })}
          >
            Quick play
            <small>A fresh random scramble</small>
          </button>
          <button className="btn btn--big" onClick={() => startGame('daily', { inspection })}>
            Daily scramble
            <small>Same cube for everyone · {utcDateKey()}</small>
          </button>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={inspection}
            onChange={(e) => update({ inspection: e.target.checked })}
          />
          <span>15 s inspection before the timer starts</span>
        </label>
      </div>
    </main>
  );
}
