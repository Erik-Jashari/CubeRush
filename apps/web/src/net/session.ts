import {
  challengePath,
  type AttemptDto,
  type ChallengeDto,
  type Mode,
  type SolveDto,
} from '@cuberush/api';
import { create } from 'zustand';
import { useGhost } from '../game/ghost';
import { useSettings } from '../game/settings';
import { useGame, type TimedMove } from '../game/store';
import { api, ApiError } from './api';
import { useProfile } from './profile';

export type Submission =
  | { status: 'idle' }
  /** No attempt on the server (guest, or the server was unreachable): nothing to save. */
  | { status: 'offline' }
  | { status: 'saving' }
  | { status: 'saved'; solve: SolveDto }
  | { status: 'failed'; message: string };

interface SessionState {
  /** The server attempt behind the current round, if any. */
  attempt: AttemptDto | null;
  /** True while waiting for the server to hand out a scramble. */
  starting: boolean;
  submission: Submission;
  /** The challenge being played, if any. */
  challenge: ChallengeDto | null;
  /** Code from a `/c/<code>` link, shown on the challenge screen. */
  challengeCode: string | null;
}

export const useSession = create<SessionState>()(() => ({
  attempt: null,
  starting: false,
  submission: { status: 'idle' },
  challenge: null,
  challengeCode: null,
}));

/** The player's most recent finished solve, raced as a ghost when they retry that scramble. */
let lastRun: { seed: string; log: TimedMove[]; timeMs: number } | null = null;

/** Guards against an older request finishing after a newer round has started. */
let round = 0;

export interface RoundOptions {
  /** Replay the current scramble (as unranked practice). */
  retry?: boolean;
  /** Required to start a `challenge` round the first time. */
  challenge?: ChallengeDto;
}

/** Picks something to race: the challenger, today's best (in practice), or your last run. */
async function loadGhost(mode: Mode, seed: string, attempt: AttemptDto | null, id: number) {
  const ghost = useGhost.getState();
  ghost.clear();
  if (!useSettings.getState().ghost || mode === 'blindfold' || mode === 'survival') return;

  const { challenge } = useSession.getState();
  if (mode === 'challenge' && challenge) {
    ghost.load(seed, { label: challenge.creator, timeMs: challenge.timeMs }, challenge.moves);
    return;
  }
  const { token } = useProfile.getState();
  if (mode === 'daily' && token && attempt && !attempt.ranked) {
    try {
      const best = await api.dailyGhost(token);
      if (id !== round) return;
      ghost.load(
        seed,
        { label: `${best.nickname} (today’s best)`, timeMs: best.timeMs },
        best.moves,
      );
      return;
    } catch {
      // No ghost available; fall back to the player's own last run.
    }
  }
  if (id === round && lastRun?.seed === seed) {
    ghost.load(seed, { label: 'Your last run', timeMs: lastRun.timeMs }, lastRun.log);
  }
}

/**
 * Starts a round. Signed-in players get their scramble from the server so the solve can be
 * verified; guests, or anyone the server can't be reached for, play offline on a local seed.
 */
export async function startRound(mode: Mode, options: RoundOptions = {}): Promise<void> {
  const id = ++round;
  const { token } = useProfile.getState();
  const session = useSession.getState();
  const previous = session.attempt;
  const challenge = mode === 'challenge' ? (options.challenge ?? session.challenge) : null;
  useSession.setState({ starting: true });

  let attempt: AttemptDto | null = null;
  if (token) {
    try {
      const retryOf = options.retry && previous?.mode === mode ? previous.id : undefined;
      attempt = await api.createAttempt(token, {
        mode,
        ...(retryOf ? { retryOf } : {}),
        ...(challenge && !retryOf ? { challenge: challenge.code } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) useProfile.getState().forget();
    }
  }
  if (id !== round) return;

  const seed =
    attempt?.seed ?? (options.retry ? useGame.getState().seed : (challenge?.seed ?? undefined));
  const { inspection } = useSettings.getState();
  useGame.getState().startGame(mode, { inspection, ...(seed ? { seed } : {}) });
  useSession.setState({ attempt, starting: false, submission: { status: 'idle' }, challenge });
  void loadGhost(mode, useGame.getState().seed, attempt, id);
}

/** Leaving a round drops its attempt; an unfinished attempt simply expires on the server. */
export function leaveRound(): void {
  round++;
  useGhost.getState().clear();
  useSession.setState({
    attempt: null,
    starting: false,
    submission: { status: 'idle' },
    challenge: null,
  });
}

/** Opens the screen for a `/c/<code>` share link. */
export function openChallenge(code: string): void {
  leaveRound();
  useSession.setState({ challengeCode: code });
  useGame.getState().showChallenge();
}

/** Turns the finished quick-play solve into a share link. */
export async function createShareLink(): Promise<string> {
  const { attempt } = useSession.getState();
  const { token } = useProfile.getState();
  if (!attempt || !token) throw new Error('Pick a nickname to share challenges.');
  const { code } = await api.createChallenge(token, attempt.id);
  return new URL(challengePath(code), window.location.origin).href;
}

async function submitSolve(): Promise<void> {
  const { attempt } = useSession.getState();
  const { token } = useProfile.getState();
  if (!attempt || !token) {
    useSession.setState({ submission: { status: 'offline' } });
    return;
  }

  const { log, usedUndo, peeked } = useGame.getState();
  useSession.setState({ submission: { status: 'saving' } });
  try {
    const solve = await api.submitSolve(token, {
      attemptId: attempt.id,
      moves: log,
      usedUndo,
      ...(attempt.mode === 'blindfold' ? { peeked } : {}),
    });
    if (useSession.getState().attempt?.id !== attempt.id) return;
    useSession.setState({ submission: { status: 'saved', solve } });
    void useProfile.getState().refresh();
  } catch (error) {
    if (useSession.getState().attempt?.id !== attempt.id) return;
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    useSession.setState({ submission: { status: 'failed', message } });
  }
}

/** Sends every finished round to the server and remembers it for ghost races. Call once. */
export function connectSession(): () => void {
  void useProfile.getState().refresh();
  return useGame.subscribe((state, prev) => {
    if (!state.result || prev.result) return;
    if (state.mode !== 'survival') {
      lastRun = { seed: state.seed, log: state.log, timeMs: state.result.timeMs };
    }
    void submitSolve();
  });
}
