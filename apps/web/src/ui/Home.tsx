import { NICKNAME_PATTERN, NICKNAME_RULES, utcDateKey } from '@cuberush/api';
import { useEffect, useState, type FormEvent } from 'react';
import { useSettings } from '../game/settings';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { ApiError } from '../net/api';
import { useProfile } from '../net/profile';
import { startRound, useSession } from '../net/session';
import { MODE_INFO } from './modes';

function NicknameForm() {
  const register = useProfile((s) => s.register);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!NICKNAME_PATTERN.test(name)) {
      setError(`Nicknames are ${NICKNAME_RULES}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="join" onSubmit={submit} noValidate>
      <label htmlFor="nickname">Pick a nickname to save points and join the leaderboard</label>
      <div className="join__row">
        <input
          id="nickname"
          className="input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname"
          autoComplete="nickname"
          maxLength={20}
          aria-invalid={error !== null}
          aria-describedby="nickname-help"
        />
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
      <p id="nickname-help" className={error ? 'join__error' : 'join__help'} role="status">
        {error ?? 'Or just play as a guest; guest solves are not saved.'}
      </p>
    </form>
  );
}

function ProfileLine() {
  const player = useProfile((s) => s.player)!;
  const me = useProfile((s) => s.me);
  return (
    <p className="profile">
      Playing as <strong>{player.nickname}</strong>
      {me && (
        <>
          <span className="profile__sep">·</span>
          {me.totalPoints.toLocaleString()} pts
          {me.streak > 0 && (
            <>
              <span className="profile__sep">·</span>
              {me.streak}-day streak
            </>
          )}
        </>
      )}
    </p>
  );
}

function dailySubtitle(
  signedIn: boolean,
  daily: { rankedAvailable: boolean; entry: { rank: number; timeMs: number } | null } | undefined,
): string {
  if (!signedIn || !daily) return `Same cube for everyone · ${utcDateKey()}`;
  if (daily.rankedAvailable) return 'One ranked try today · same cube for everyone';
  if (daily.entry)
    return `You placed #${daily.entry.rank} in ${formatTime(daily.entry.timeMs)} · replay as practice`;
  return 'Ranked try used · replay as practice';
}

export function Home() {
  const player = useProfile((s) => s.player);
  const daily = useProfile((s) => s.me?.daily);
  const starting = useSession((s) => s.starting);
  const showLeaderboard = useGame((s) => s.showLeaderboard);
  const inspection = useSettings((s) => s.inspection);
  const ghost = useSettings((s) => s.ghost);
  const update = useSettings((s) => s.update);

  // Points, streak and the daily status may have changed since the last visit.
  useEffect(() => {
    void useProfile.getState().refresh();
  }, []);

  return (
    <main className="home">
      <div className="home__panel">
        <h1 className="home__title">
          Cube<span>Rush</span>
        </h1>
        <p className="home__tagline">Scramble. Solve. Beat the clock.</p>

        {player ? <ProfileLine /> : <NicknameForm />}

        <div className="home__actions">
          <button
            className="btn btn--primary btn--big"
            disabled={starting}
            onClick={() => void startRound('quick')}
          >
            {MODE_INFO.quick.name}
            <small>{MODE_INFO.quick.blurb}</small>
          </button>
          <button
            className="btn btn--big"
            disabled={starting}
            onClick={() => void startRound('daily')}
          >
            {MODE_INFO.daily.name}
            <small>{dailySubtitle(player !== null, daily)}</small>
          </button>
          <div className="home__modes">
            {(['blindfold', 'survival'] as const).map((mode) => (
              <button
                key={mode}
                className="btn btn--big btn--mode"
                disabled={starting}
                onClick={() => void startRound(mode)}
              >
                {MODE_INFO[mode].name}
                <small>{MODE_INFO[mode].blurb}</small>
              </button>
            ))}
          </div>
          <button className="btn" onClick={showLeaderboard}>
            Leaderboard
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
        <label className="toggle">
          <input
            type="checkbox"
            checked={ghost}
            onChange={(e) => update({ ghost: e.target.checked })}
          />
          <span>Race a ghost replay when one is available</span>
        </label>
      </div>
    </main>
  );
}
