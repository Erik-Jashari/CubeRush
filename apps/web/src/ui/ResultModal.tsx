import { ACHIEVEMENTS, type AchievementId } from '@cuberush/api';
import type { PointsBreakdown } from '@cuberush/cube-core';
import { useEffect, useRef, useState } from 'react';
import { useGhost } from '../game/ghost';
import { useReplay } from '../game/replay';
import { useSettings } from '../game/settings';
import { playSolved } from '../game/sound';
import { useGame, type GameMode, type SolveResult } from '../game/store';
import { formatTime } from '../game/time';
import { useProfile } from '../net/profile';
import {
  createShareLink,
  leaveRound,
  startRound,
  useSession,
  type Submission,
} from '../net/session';
import { celebrate } from './confetti';

/** Delay so the final turn finishes animating before the card covers the cube. */
const SHOW_AFTER_MS = 900;

const EYEBROW: Record<GameMode, string> = {
  quick: 'Solved!',
  daily: 'Daily scramble solved',
  challenge: 'Challenge complete',
  blindfold: 'Blindfold solve',
  survival: 'Run over',
  tutorial: 'Lesson complete',
};

function SubmissionStatus({ submission }: { submission: Submission }) {
  const signedIn = useProfile((s) => s.player !== null);
  switch (submission.status) {
    case 'idle':
    case 'saving':
      return <p className="result__status">Verifying…</p>;
    case 'offline':
      return (
        <p className="result__status">
          {signedIn
            ? "Couldn't reach the server, so this wasn't saved."
            : 'Pick a nickname on the home screen to save your solves.'}
        </p>
      );
    case 'failed':
      return <p className="result__status result__status--bad">Not saved: {submission.message}</p>;
    case 'saved': {
      const { solve } = submission;
      if (!solve.ranked) {
        return <p className="result__status">Verified · practice, points not counted</p>;
      }
      return (
        <p className="result__status result__status--good">
          Verified · saved
          {solve.dailyRank !== null && <> · today’s rank #{solve.dailyRank}</>}
        </p>
      );
    }
  }
}

function PointsTable({
  points,
  mode,
  peeked,
}: {
  points: PointsBreakdown;
  mode: GameMode;
  peeked: boolean;
}) {
  const rows: [string, string][] =
    mode === 'survival'
      ? [['Waves solved', `+${points.waves}`]]
      : [
          ['Speed', `+${points.time}`],
          ['Move efficiency', `+${points.moves}`],
          ['No undo', points.noUndo > 0 ? `+${points.noUndo}` : '—'],
        ];
  if (mode === 'blindfold') {
    rows.push(['Blindfold bonus', peeked ? 'peeked' : `×${points.modeMultiplier}`]);
  }
  if (points.streakMultiplier > 1)
    rows.push(['Streak bonus', `×${points.streakMultiplier.toFixed(2)}`]);
  return (
    <dl className="points">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div className="points__total">
        <dt>Points</dt>
        <dd>{points.total}</dd>
      </div>
    </dl>
  );
}

/** "You beat Alice by 1.20 s" against a challenge creator or a ghost. */
function Comparison({ timeMs }: { timeMs: number }) {
  const challenge = useSession((s) => s.challenge);
  const ghost = useGhost((s) => s.info);
  const rival = challenge
    ? { name: challenge.creator, timeMs: challenge.timeMs }
    : ghost
      ? {
          name: ghost.label === 'Your last run' ? 'your last run' : ghost.label,
          timeMs: ghost.timeMs,
        }
      : null;
  if (!rival) return null;
  const delta = formatTime(Math.abs(rival.timeMs - timeMs));
  const won = timeMs < rival.timeMs;
  return (
    <p className={`result__compare${won ? ' result__compare--won' : ''}`}>
      {won ? `You beat ${rival.name} by ${delta} s!` : `${rival.name} was ${delta} s faster.`}
    </p>
  );
}

type ShareState =
  | { status: 'idle' | 'busy' }
  | { status: 'ready'; url: string; copied: boolean }
  | { status: 'error'; message: string };

/** Creates a challenge link for this solve and shares or copies it. */
function SharePanel({ timeMs }: { timeMs: number }) {
  const [state, setState] = useState<ShareState>({ status: 'idle' });

  const share = async () => {
    setState({ status: 'busy' });
    try {
      const url = await createShareLink();
      const text = `Can you beat my ${formatTime(timeMs)} on this CubeRush scramble?`;
      let copied = false;
      // Phones get the system share sheet; desktops get the link on the clipboard.
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'CubeRush challenge', text, url }).catch(() => undefined);
      } else {
        copied = await navigator.clipboard.writeText(url).then(
          () => true,
          () => false,
        );
      }
      setState({ status: 'ready', url, copied });
    } catch (error) {
      setState({ status: 'error', message: (error as Error).message });
    }
  };

  if (state.status === 'ready') {
    return (
      <div className="share">
        <input
          className="input share__link"
          readOnly
          value={state.url}
          onFocus={(e) => e.target.select()}
        />
        <p className="share__note">
          {state.copied ? 'Link copied. Send it to a friend!' : 'Send this link to a friend.'}
        </p>
      </div>
    );
  }
  return (
    <div className="share">
      <button className="btn" onClick={() => void share()} disabled={state.status === 'busy'}>
        {state.status === 'busy' ? 'Creating link…' : 'Challenge a friend'}
      </button>
      {state.status === 'error' && (
        <p className="share__note result__status--bad">{state.message}</p>
      )}
    </div>
  );
}

function NewAchievements({ ids }: { ids: readonly AchievementId[] }) {
  if (ids.length === 0) return null;
  const names = ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id);
  return (
    <p className="result__achievements" role="status">
      <span aria-hidden>★</span> Achievement{ids.length > 1 ? 's' : ''} unlocked:{' '}
      {names.join(' · ')}
    </p>
  );
}

export function ResultModal() {
  const result = useGame((s) => s.result);
  const mode = useGame((s) => s.mode);
  const peeked = useGame((s) => s.peeked);
  const submission = useSession((s) => s.submission);
  const attemptId = useSession((s) => s.attempt?.id);
  const screen = useGame((s) => s.screen);
  const { goHome, showLeaderboard, showReplay } = useGame.getState();
  const dialog = useRef<HTMLDialogElement>(null);
  const announced = useRef<SolveResult | null>(null);

  // Celebrate once per result; the card hides during a replay and comes back after it.
  useEffect(() => {
    const card = dialog.current;
    if (!card) return;
    if (!result || screen !== 'play') {
      if (card.open) card.close();
      return;
    }
    if (announced.current === result) {
      if (!card.open) card.showModal();
      return;
    }
    announced.current = result;
    if (result.cleared !== 0) {
      celebrate();
      if (useSettings.getState().sound) playSolved();
    }
    const id = window.setTimeout(() => card.showModal(), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [result, screen]);

  const watchReplay = () => {
    const { seed, log } = useGame.getState();
    if (!result) return;
    useReplay.getState().open(seed, log, result.timeMs);
    showReplay();
  };

  // The server's numbers include the streak bonus and its own undo check, so prefer them.
  const points = submission.status === 'saved' ? submission.solve.points : result?.points;
  const leave = (next: () => void) => () => {
    leaveRound();
    next();
  };
  const fresh = mode === 'quick' || mode === 'blindfold' || mode === 'survival';

  return (
    <dialog ref={dialog} className="result" onCancel={(e) => e.preventDefault()}>
      {result && points && mode !== 'tutorial' && (
        <>
          <p className="result__eyebrow">{EYEBROW[mode]}</p>
          <p className="result__time">{formatTime(result.timeMs)}</p>
          <p className="result__moves">
            {result.cleared !== null
              ? `survived · ${result.cleared} ${result.cleared === 1 ? 'wave' : 'waves'} solved`
              : `${result.moveCount} moves`}
          </p>
          {result.cleared === null && <Comparison timeMs={result.timeMs} />}

          <PointsTable points={points} mode={mode} peeked={peeked} />
          <SubmissionStatus submission={submission} />
          {submission.status === 'saved' && (
            <NewAchievements ids={submission.solve.newAchievements} />
          )}
          {mode === 'quick' && submission.status === 'saved' && (
            <SharePanel key={attemptId} timeMs={result.timeMs} />
          )}

          <div className="result__actions">
            {fresh && (
              <button className="btn btn--primary" onClick={() => void startRound(mode)}>
                {mode === 'survival' ? 'New run' : 'New scramble'}
              </button>
            )}
            <button className="btn" onClick={() => void startRound(mode, { retry: true })}>
              Try again
            </button>
            {result.cleared === null && (
              <button className="btn" onClick={watchReplay}>
                Watch replay
              </button>
            )}
            <button className="btn" onClick={leave(showLeaderboard)}>
              Leaderboard
            </button>
            <button className="btn btn--ghost" onClick={leave(goHome)}>
              Home
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
