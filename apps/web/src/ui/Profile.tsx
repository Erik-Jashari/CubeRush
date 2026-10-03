import {
  ACHIEVEMENTS,
  SHOP,
  type ShopKind,
  type AchievementDto,
  type SkinId,
  type ThemeId,
  type StatsResponse,
} from '@cuberush/api';
import { summarizeTimes } from '@cuberush/cube-core';
import { useState, type ReactNode } from 'react';
import { useSettings } from '../game/settings';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { api, ApiError } from '../net/api';
import { useActiveSkin, useActiveTheme, useProfile } from '../net/profile';
import { SKIN_LOOKS } from '../scene/skins';
import { SolveChart } from './SolveChart';
import { ThemeChip } from './ThemeChip';
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

interface ShopSectionProps {
  kind: ShopKind;
  title: string;
  owned: readonly string[];
  active: string;
  preview: (id: string) => ReactNode;
  equip: (id: string) => void;
}

/** One row per item: equipped, equip, or unlock with points. */
function ShopSection({ kind, title, owned, active, preview, equip }: ShopSectionProps) {
  const token = useProfile((s) => s.token)!;
  const balance = useProfile((s) => s.me?.wallet.balance ?? 0);
  const refresh = useProfile((s) => s.refresh);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const unlock = async (id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      await api.unlock(token, kind, id);
      await refresh();
      equip(id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="shop">
      <h3 className="shop__title">{title}</h3>
      {message && <p className="board__note board__note--bad">{message}</p>}
      <ul className="skins">
        {SHOP[kind].map((item) => {
          const affordable = balance >= item.cost;
          return (
            <li key={item.id} className={`skin${active === item.id ? ' skin--on' : ''}`}>
              {preview(item.id)}
              <span className="skin__name">
                {item.name}
                <span className="board__caption">
                  {item.cost === 0 ? 'Free' : `${item.cost.toLocaleString()} pts`}
                </span>
              </span>
              {active === item.id ? (
                <span className="skin__state">Equipped</span>
              ) : owned.includes(item.id) ? (
                <button className="btn" onClick={() => equip(item.id)}>
                  Equip
                </button>
              ) : (
                <button
                  className="btn btn--primary"
                  disabled={!affordable || busy !== null}
                  onClick={() => void unlock(item.id)}
                  title={affordable ? undefined : `You need ${item.cost - balance} more points`}
                >
                  {busy === item.id ? 'Unlocking…' : 'Unlock'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShopTab() {
  const me = useProfile((s) => s.me);
  const skin = useActiveSkin();
  const theme = useActiveTheme();
  const update = useSettings((s) => s.update);

  if (!me) {
    return (
      <p className="board__note">Pick a nickname to earn points and unlock skins and themes.</p>
    );
  }

  return (
    <>
      <p className="wallet">
        <span className="wallet__value">{me.wallet.balance.toLocaleString()}</span> points to spend
        <span className="board__caption"> · spending never lowers your leaderboard total</span>
      </p>
      <ShopSection
        kind="skin"
        title="Cube skins"
        owned={me.skins}
        active={skin}
        preview={(id) => <Swatch skin={id as SkinId} />}
        equip={(id) => update({ skin: id as SkinId })}
      />
      <ShopSection
        kind="theme"
        title="Themes"
        owned={me.themes}
        active={theme}
        preview={(id) => <ThemeChip theme={id as ThemeId} />}
        equip={(id) => update({ theme: id as ThemeId })}
      />
    </>
  );
}

/** Login code for other devices, signed-in devices, and signing out. */
function AccountTab() {
  const token = useProfile((s) => s.token)!;
  const me = useProfile((s) => s.me);
  const refresh = useProfile((s) => s.refresh);
  const logout = useProfile((s) => s.logout);
  const goHome = useGame((s) => s.goHome);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <p className="board__note">Loading…</p>;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  const makeCode = () =>
    run(async () => {
      setCode((await api.loginCode(token)).code);
      setCopied(false);
      await refresh();
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
    } catch {
      setMessage('Couldn’t copy; select the code and copy it by hand.');
    }
  };
  const signOutOthers = () =>
    run(async () => {
      await api.logoutOthers(token);
      await refresh();
    });
  const signOut = () =>
    run(async () => {
      await logout();
      goHome();
    });

  return (
    <div className="account">
      {message && <p className="board__note board__note--bad">{message}</p>}

      <section>
        <h3 className="shop__title">Login code</h3>
        <p className="account__text">
          Your account lives in this browser. A login code lets you sign in on another device, or
          come back after clearing your browser.
        </p>
        {code ? (
          <>
            <p className="account__code">
              <code>{code}</code>
              <button className="btn btn--small" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </p>
            <p className="account__text account__text--warn">
              Save it somewhere safe, like a password manager. You won’t see it again, and anyone
              with it can play as you.
            </p>
          </>
        ) : (
          <>
            {me.hasLoginCode && (
              <p className="account__text">
                You already made a code. Lost it? A new one replaces it.
              </p>
            )}
            <button className="btn" disabled={busy} onClick={() => void makeCode()}>
              {me.hasLoginCode ? 'Make a new login code' : 'Make a login code'}
            </button>
          </>
        )}
      </section>

      <section>
        <h3 className="shop__title">Devices</h3>
        <p className="account__text">
          {me.otherSessions === 0
            ? 'Only this browser is signed in.'
            : `Signed in here and on ${me.otherSessions} other ${me.otherSessions === 1 ? 'device' : 'devices'}.`}
        </p>
        <div className="account__actions">
          {me.otherSessions > 0 && (
            <button className="btn" disabled={busy} onClick={() => void signOutOthers()}>
              Sign out other devices
            </button>
          )}
          {confirmSignOut ? (
            <>
              <span className="account__text account__text--warn">
                {me.hasLoginCode
                  ? 'You’ll need your login code to come back.'
                  : `Without a login code you can’t get back to ${me.player.nickname}.`}
              </span>
              <button className="btn" disabled={busy} onClick={() => void signOut()}>
                Sign out anyway
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmSignOut(true)}>
              Sign out of this browser
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

const TABS = {
  stats: 'Stats',
  achievements: 'Achievements',
  shop: 'Shop',
  account: 'Account',
} as const;

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
          {tab === 'shop' && <ShopTab />}
          {tab === 'account' && <AccountTab />}
        </div>
      </div>
    </main>
  );
}
