import {
  ACHIEVEMENTS,
  SKINS,
  type AchievementDto,
  type SkinId,
  type StatsResponse,
} from '@cuberush/api';
import { summarizeTimes } from '@cuberush/cube-core';
import { useState } from 'react';
import { useSettings } from '../game/settings';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { api, ApiError } from '../net/api';
import { useActiveSkin, useProfile } from '../net/profile';
import { SKIN_LOOKS } from '../scene/skins';
import { SolveChart } from './SolveChart';
import { useLoad } from './useLoad';

const CHART_SOLVES = 50;

function signedIn<T>(fetch: (token: string) => Promise<T>) {
  return (token: string | null) =>
    token ? fetch(token) : Promise.reject(new Error('Pick a nickname to track your progress.'));
}
const fetchStats = signedIn(api.stats);
const fetchAchievements = signedIn(api.achievements);

function Tile({ label, ms }: { label: string; ms: number | null }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{ms === null ? '—' : formatTime(ms)}</span>
    </div>
  );
}

function StatsTab() {
  const { load } = useLoad<StatsResponse>(fetchStats);
  if (load.state === 'loading') return <p className="board__note">Loading…</p>;
  if (load.state === 'error') return <p className="board__note board__note--bad">{load.message}</p>;
  const { solves } = load.data;
  if (solves.length === 0) {
    return <p className="board__note">No solves yet. Finish one and your stats show up here.</p>;
  }

  const stats = summarizeTimes(solves.map((s) => s.timeMs));
  return (
    <>
      <div className="tiles">
        <Tile label="Best" ms={stats.best} />
        <Tile label="Ao5" ms={stats.ao5} />
        <Tile label="Ao12" ms={stats.ao12} />
        <Tile label="Best Ao5" ms={stats.bestAo5} />
        <Tile label="Best Ao12" ms={stats.bestAo12} />
        <div className="tile">
          <span className="tile__label">Solves</span>
          <span className="tile__value">{stats.count}</span>
        </div>
      </div>
      <p className="board__caption">
        Last {Math.min(CHART_SOLVES, solves.length)} solves · Ao5 and Ao12 drop the best and worst
        time
      </p>
      <SolveChart solves={solves.slice(-CHART_SOLVES)} />
    </>
  );
}

function AchievementsTab() {
  const { load } = useLoad<AchievementDto[]>(fetchAchievements);
  if (load.state === 'loading') return <p className="board__note">Loading…</p>;
  if (load.state === 'error') return <p className="board__note board__note--bad">{load.message}</p>;
  const byId = new Map(load.data.map((a) => [a.id, a]));
  const done = load.data.filter((a) => a.unlocked).length;

  return (
    <>
      <p className="board__caption">
        {done} of {ACHIEVEMENTS.length} unlocked
      </p>
      <ul className="achievements">
        {ACHIEVEMENTS.map((def) => {
          const state = byId.get(def.id);
          const unlocked = state?.unlocked ?? false;
          return (
            <li key={def.id} className={`achievement${unlocked ? ' achievement--on' : ''}`}>
              <span className="achievement__mark" aria-hidden>
                {unlocked ? '★' : '☆'}
              </span>
              <span>
                <strong>{def.name}</strong>
                <span className="achievement__desc">{def.description}</span>
              </span>
              <span className="achievement__state">
                {unlocked
                  ? 'Unlocked'
                  : def.target !== undefined
                    ? `${state?.progress ?? 0} / ${def.target}`
                    : 'Locked'}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A face of the cube in the skin's colors, as a preview. */
function Swatch({ skin }: { skin: SkinId }) {
  const look = SKIN_LOOKS[skin];
  const faces = ['U', 'F', 'R', 'L', 'B', 'U', 'D', 'R', 'F'] as const;
  return (
    <span className="swatch" style={{ background: look.body }} aria-hidden>
      {faces.map((f, i) => (
        <span key={i} style={{ background: look.stickers[f] }} />
      ))}
    </span>
  );
}

function SkinsTab() {
  const token = useProfile((s) => s.token);
  const me = useProfile((s) => s.me);
  const refresh = useProfile((s) => s.refresh);
  const active = useActiveSkin();
  const update = useSettings((s) => s.update);
  const [busy, setBusy] = useState<SkinId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!token || !me) {
    return <p className="board__note">Pick a nickname to earn points and unlock skins.</p>;
  }

  const unlock = async (skin: SkinId) => {
    setBusy(skin);
    setMessage(null);
    try {
      await api.unlock(token, skin);
      await refresh();
      update({ skin });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="wallet">
        <span className="wallet__value">{me.wallet.balance.toLocaleString()}</span> points to spend
        <span className="board__caption"> · spending never lowers your leaderboard total</span>
      </p>
      {message && <p className="board__note board__note--bad">{message}</p>}
      <ul className="skins">
        {SKINS.map((skin) => {
          const owned = me.skins.includes(skin.id);
          const affordable = me.wallet.balance >= skin.cost;
          return (
            <li key={skin.id} className={`skin${active === skin.id ? ' skin--on' : ''}`}>
              <Swatch skin={skin.id} />
              <span className="skin__name">
                {skin.name}
                <span className="board__caption">
                  {skin.cost === 0 ? 'Free' : `${skin.cost.toLocaleString()} pts`}
                </span>
              </span>
              {active === skin.id ? (
                <span className="skin__state">Equipped</span>
              ) : owned ? (
                <button className="btn" onClick={() => update({ skin: skin.id })}>
                  Equip
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  disabled={!affordable || busy !== null}
                  onClick={() => void unlock(skin.id)}
                  title={
                    affordable ? undefined : `You need ${skin.cost - me.wallet.balance} more points`
                  }
                >
                  {busy === skin.id ? 'Unlocking…' : 'Unlock'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const TABS = { stats: 'Stats', achievements: 'Achievements', skins: 'Skins' } as const;

export function Profile() {
  const [tab, setTab] = useState<keyof typeof TABS>('stats');
  const goHome = useGame((s) => s.goHome);
  const nickname = useProfile((s) => s.player?.nickname);

  return (
    <main className="home">
      <div className="home__panel board-panel profile-panel">
        <div className="board-panel__head">
          <button className="btn btn--ghost" onClick={goHome}>
            ← Home
          </button>
          <h2>{nickname ?? 'Profile'}</h2>
        </div>
        <div className="tabs" role="tablist">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tabs__tab${tab === t ? ' tabs__tab--on' : ''}`}
              onClick={() => setTab(t)}
            >
              {TABS[t]}
            </button>
          ))}
        </div>
        <div className="board-panel__body" role="tabpanel">
          {tab === 'stats' && <StatsTab />}
          {tab === 'achievements' && <AchievementsTab />}
          {tab === 'skins' && <SkinsTab />}
        </div>
      </div>
    </main>
  );
}
