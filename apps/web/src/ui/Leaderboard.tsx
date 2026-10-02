import {
  utcDateKey,
  type AllTimeEntry,
  type AllTimeLeaderboard,
  type DailyEntry,
  type DailyLeaderboard,
} from '@cuberush/api';
import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { api } from '../net/api';
import { useProfile } from '../net/profile';

type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

function useBoard<T>(fetcher: (token: string | null) => Promise<T>): Load<T> {
  const token = useProfile((s) => s.token);
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    fetcher(token).then(
      (data) => live && setLoad({ state: 'ready', data }),
      (error: Error) => live && setLoad({ state: 'error', message: error.message }),
    );
    return () => {
      live = false;
    };
  }, [fetcher, token]);
  return load;
}

interface Column<E> {
  label: string;
  cell: (entry: E) => ReactNode;
  numeric?: boolean;
}

interface BoardProps<E> {
  load: Load<{ entries: E[]; me: E | null }>;
  columns: Column<E>[];
}

/** Ranked table; the player's own row is highlighted, and appended when outside the top. */
function Board<E extends { rank: number; nickname: string }>({ load, columns }: BoardProps<E>) {
  const nickname = useProfile((s) => s.player?.nickname);
  if (load.state === 'loading') return <p className="board__note">Loading…</p>;
  if (load.state === 'error') {
    return <p className="board__note board__note--bad">{load.message}</p>;
  }
  const { entries, me } = load.data;
  if (entries.length === 0)
    return <p className="board__note">No ranked solves yet. Be the first!</p>;

  const meOutside = me !== null && !entries.some((e) => e.rank === me.rank);
  const rows = meOutside ? [...entries, me] : entries;
  return (
    <table className="board">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          {columns.map((c) => (
            <th key={c.label} scope="col" className={c.numeric ? 'num' : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => {
          const classes = [
            e.nickname === nickname ? 'board__me' : '',
            meOutside && i === entries.length ? 'board__gap' : '',
          ];
          return (
            <tr key={e.rank} className={classes.join(' ').trim() || undefined}>
              <td>{e.rank}</td>
              <td className="board__name">{e.nickname}</td>
              {columns.map((c) => (
                <td key={c.label} className={c.numeric ? 'num' : undefined}>
                  {c.cell(e)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const DAILY_COLUMNS: Column<DailyEntry>[] = [
  { label: 'Time', cell: (e) => formatTime(e.timeMs), numeric: true },
  { label: 'Moves', cell: (e) => e.moveCount, numeric: true },
  { label: 'Pts', cell: (e) => e.points, numeric: true },
];

const ALL_TIME_COLUMNS: Column<AllTimeEntry>[] = [
  { label: 'Points', cell: (e) => e.points.toLocaleString(), numeric: true },
  { label: 'Solves', cell: (e) => e.solves, numeric: true },
  { label: 'Best', cell: (e) => (e.bestMs === null ? '—' : formatTime(e.bestMs)), numeric: true },
];

function DailyBoard() {
  const load = useBoard<DailyLeaderboard>(api.dailyLeaderboard);
  const date = load.state === 'ready' ? load.data.date : utcDateKey();
  return (
    <>
      <p className="board__caption">Today’s scramble · {date} (UTC) · fastest first</p>
      <Board load={load} columns={DAILY_COLUMNS} />
    </>
  );
}

function AllTimeBoard() {
  const load = useBoard<AllTimeLeaderboard>(api.allTimeLeaderboard);
  return (
    <>
      <p className="board__caption">Total points from ranked solves</p>
      <Board load={load} columns={ALL_TIME_COLUMNS} />
    </>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<'daily' | 'all-time'>('daily');
  const goHome = useGame((s) => s.goHome);

  return (
    <main className="home">
      <div className="home__panel board-panel">
        <div className="board-panel__head">
          <button className="btn btn--ghost" onClick={goHome}>
            ← Home
          </button>
          <h2>Leaderboard</h2>
        </div>
        <div className="tabs" role="tablist">
          {(['daily', 'all-time'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tabs__tab${tab === t ? ' tabs__tab--on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'daily' ? 'Today' : 'All time'}
            </button>
          ))}
        </div>
        <div className="board-panel__body" role="tabpanel">
          {tab === 'daily' ? <DailyBoard /> : <AllTimeBoard />}
        </div>
      </div>
    </main>
  );
}
