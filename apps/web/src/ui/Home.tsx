import {
  LOGIN_CODE_LENGTH,
  nicknameProblem,
  normalizeLoginCode,
  THEMES,
  utcDateKey,
} from '@cuberush/api';
import { useEffect, useState, type FormEvent } from 'react';
import { useSettings } from '../game/settings';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { useTutorial } from '../game/tutorial';
import { ApiError } from '../net/api';
import { FREE_THEMES, useActiveTheme, useProfile } from '../net/profile';
import { startRound, useSession } from '../net/session';
import { MODE_INFO } from './modes';
import { ThemeChip } from './ThemeChip';

const SETTINGS = [
  { key: 'inspection', label: '15 s inspection before the timer starts' },
  { key: 'ghost', label: 'Race a ghost replay when one is available' },
  { key: 'sound', label: 'Sound effects' },
  { key: 'melody', label: 'Melody mode: every face plays a note' },
  { key: 'keyboard', label: 'Keyboard turns (press ? during a solve to see the keys)' },
] as const;

/** Signs in to an existing player on this device. */
function LoginCodeForm({ onCancel }: { onCancel: () => void }) {
  const login = useProfile((s) => s.login);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (normalizeLoginCode(code).length !== LOGIN_CODE_LENGTH) {
      setError(`Login codes have ${LOGIN_CODE_LENGTH} letters and numbers.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="join" onSubmit={submit} noValidate>
      <label htmlFor="login-code">Enter the login code from your profile on another device</label>
      <div className="join__row">
        <input
          id="login-code"
          className="input input--code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
          aria-invalid={error !== null}
          aria-describedby="login-help"
        />
        <button className="btn btn--primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p id="login-help" className={error ? 'join__error' : 'join__help'} role="status">
        {error ?? (
          <button type="button" className="link" onClick={onCancel}>
            Pick a new nickname instead
          </button>
        )}
      </p>
    </form>
  );
}

function NicknameForm() {
  const register = useProfile((s) => s.register);
  const [withCode, setWithCode] = useState(false);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    const problem = nicknameProblem(name);
    if (problem) {
      setError(problem);
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

  if (withCode) return <LoginCodeForm onCancel={() => setWithCode(false)} />;
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
        {error ?? 'Or just play as a guest; guest solves are not saved.'}{' '}
        <button type="button" className="link" onClick={() => setWithCode(true)}>
          Have a login code?
        </button>
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
  const settings = useSettings();
  const { update } = settings;
  const showProfile = useGame((s) => s.showProfile);
  const showLearn = useGame((s) => s.showLearn);
  const theme = useActiveTheme();
  const ownedThemes = useProfile((s) => s.me?.themes) ?? FREE_THEMES;
  // Someone who has never solved here and hasn't opened a lesson gets the tutorial up front.
  const neverSolved = useProfile((s) => (s.me?.solves ?? 0) === 0);
  const noLessons = useTutorial((s) => s.done.length === 0);
  const newcomer = neverSolved && noLessons;

  // Points, streak and the daily status may have changed since the last visit.
  useEffect(() => {
    void useProfile.getState().refresh();
  }, []);

  const learnButton = (
    <button
      className={newcomer ? 'btn btn--big btn--highlight' : 'btn btn--big'}
      onClick={showLearn}
    >
      Learn to solve
      <small>{newcomer ? 'New to cubing? Start here' : 'Moves 101 · the beginner method'}</small>
    </button>
  );

  return (
    <main className="home">
      <div className="home__panel">
        <h1 className="home__title">
          Cube<span>Rush</span>
        </h1>
        <p className="home__tagline">Scramble. Solve. Beat the clock.</p>

        {player ? <ProfileLine /> : <NicknameForm />}

        <div className="home__actions">
          {newcomer && learnButton}
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
          {!newcomer && learnButton}
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
          <div className="home__row">
            <button className="btn" onClick={showLeaderboard}>
              Leaderboard
            </button>
            {player && (
              <button className="btn" onClick={showProfile}>
                Profile
              </button>
            )}
          </div>
        </div>

        <details className="settings">
          <summary>Privacy</summary>
          <p className="privacy">
            CubeRush stores your nickname, your solve times and moves, and a scrambled (hashed) copy
            of your login token and login code. No email, no tracking, no ads. Your nickname and
            times are public on the leaderboards. Guests store nothing on the server; your settings
            and lesson progress stay in this browser.
          </p>
        </details>

        <details className="settings">
          <summary>Settings</summary>
          {SETTINGS.map(({ key, label }) => (
            <label key={key} className="toggle">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="theme-picker" role="radiogroup" aria-label="Theme">
            <span>Theme</span>
            {ownedThemes.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={theme === id}
                aria-label={THEMES.find((t) => t.id === id)?.name}
                className={
                  theme === id ? 'theme-picker__item theme-picker__item--on' : 'theme-picker__item'
                }
                onClick={() => update({ theme: id })}
              >
                <ThemeChip theme={id} />
              </button>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
