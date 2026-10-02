import type { ChallengeDto } from '@cuberush/api';
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { api } from '../net/api';
import { useProfile } from '../net/profile';
import { startRound, useSession } from '../net/session';

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; challenge: ChallengeDto };

/** Landing page for a `/c/<code>` share link. */
export function ChallengeScreen() {
  const code = useSession((s) => s.challengeCode);
  const starting = useSession((s) => s.starting);
  const signedIn = useProfile((s) => s.player !== null);
  const goHome = useGame((s) => s.goHome);
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    if (!code) return;
    let live = true;
    setLoad({ state: 'loading' });
    api.challenge(code).then(
      (challenge) => live && setLoad({ state: 'ready', challenge }),
      (error: Error) => live && setLoad({ state: 'error', message: error.message }),
    );
    return () => {
      live = false;
    };
  }, [code]);

  return (
    <main className="home">
      <div className="home__panel board-panel">
        <div className="board-panel__head">
          <button className="btn btn--ghost" onClick={goHome}>
            ← Home
          </button>
          <h2>Challenge</h2>
        </div>

        {load.state === 'loading' && <p className="board__note">Loading challenge…</p>}
        {load.state === 'error' && <p className="board__note board__note--bad">{load.message}</p>}
        {load.state === 'ready' && (
          <>
            <p className="challenge__pitch">
              <strong>{load.challenge.creator}</strong> solved this scramble in{' '}
              <strong className="challenge__time">{formatTime(load.challenge.timeMs)}</strong> (
              {load.challenge.moveCount} moves). Can you beat it?
            </p>
            <button
              className="btn btn--primary btn--big"
              disabled={starting}
              onClick={() => void startRound('challenge', { challenge: load.challenge })}
            >
              Accept challenge
              <small>Race {load.challenge.creator}’s ghost on the same scramble</small>
            </button>
            {!signedIn && (
              <p className="board__caption challenge__guest">
                Playing as a guest: your time won’t be added to the results.
              </p>
            )}
            <div className="board-panel__body">
              <p className="board__caption">Best times on this challenge</p>
              <table className="board">
                <tbody>
                  {load.challenge.results.map((r) => (
                    <tr key={r.rank}>
                      <td>{r.rank}</td>
                      <td className="board__name">{r.nickname}</td>
                      <td className="num">{formatTime(r.timeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
