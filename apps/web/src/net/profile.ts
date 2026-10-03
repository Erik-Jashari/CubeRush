import {
  THEMES,
  type LessonId,
  type MeResponse,
  type PlayerDto,
  type SkinId,
  type ThemeId,
} from '@cuberush/api';
import { create } from 'zustand';
import { useSettings } from '../game/settings';
import { lessonsToUpload, useTutorial } from '../game/tutorial';
import { api, ApiError } from './api';

const STORAGE_KEY = 'cuberush:player';

interface Saved {
  player: PlayerDto;
  token: string;
}

// The token is the player's only key, so it lives in this browser. Storage may be unavailable
// (private windows, blocked site data); the player then plays as a guest.
function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(saved: Saved | null): void {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted; the nickname lasts until the page closes.
  }
}

interface ProfileState {
  player: PlayerDto | null;
  token: string | null;
  /** Totals, streak and today's daily status; null until loaded or when offline. */
  me: MeResponse | null;
  /** Claims a nickname. Throws ApiError (e.g. `nickname_taken`). */
  register(nickname: string): Promise<void>;
  /** Signs this browser in to an existing player with their login code. Throws ApiError. */
  login(code: string): Promise<void>;
  /** Signs this browser out; the player can come back with their login code. */
  logout(): Promise<void>;
  refresh(): Promise<void>;
  /** Forgets the saved token, e.g. after the server stops recognizing it. */
  forget(): void;
}

const saved = load();

export const useProfile = create<ProfileState>()((set, get) => ({
  player: saved?.player ?? null,
  token: saved?.token ?? null,
  me: null,

  async register(nickname) {
    const { player, token } = await api.register(nickname);
    save({ player, token });
    set({ player, token });
    await get().refresh();
  },

  async login(code) {
    const { player, token } = await api.login(code);
    save({ player, token });
    set({ player, token, me: null });
    await get().refresh();
  },

  async logout() {
    const { token } = get();
    // Signing out locally matters more than telling the server, which may be unreachable.
    if (token) await api.logout(token).catch(() => undefined);
    get().forget();
  },

  async refresh() {
    const { token } = get();
    if (!token) return;
    try {
      const me = await api.me(token);
      set({ me });
      await syncLessons(token, me.lessons);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) get().forget();
      // Unreachable server: keep what we had and play offline.
    }
  },

  forget() {
    save(null);
    set({ player: null, token: null, me: null });
  },
}));

async function uploadLessons(token: string, ids: LessonId[]): Promise<void> {
  if (ids.length === 0) return;
  const { lessons } = await api.saveLessons(token, ids);
  const { me } = useProfile.getState();
  if (me) useProfile.setState({ me: { ...me, lessons } });
}

/** Brings this browser's and the account's finished lessons together, both ways. */
async function syncLessons(token: string, server: readonly LessonId[]): Promise<void> {
  const tutorial = useTutorial.getState();
  const upload = lessonsToUpload(tutorial.done, server);
  tutorial.adopt(server);
  await uploadLessons(token, upload);
}

// Finishing a lesson while signed in saves it to the account too. (Lessons adopted from the
// account are already there, so they're filtered out.)
useTutorial.subscribe((s, prev) => {
  const { token, me } = useProfile.getState();
  if (s.done === prev.done || !token || !me) return;
  const added = s.done.filter((id) => !prev.done.includes(id));
  void uploadLessons(token, lessonsToUpload(added, me.lessons)).catch(() => {});
});

/**
 * The skin to draw: the player's choice if the server says they own it, classic otherwise.
 * Editing local settings can pick a skin but never unlock one.
 */
export function useActiveSkin(): SkinId {
  const chosen = useSettings((s) => s.skin);
  const owned = useProfile((s) => s.me?.skins);
  return chosen !== 'classic' && owned?.includes(chosen) ? chosen : 'classic';
}

export const FREE_THEMES: readonly ThemeId[] = THEMES.filter((t) => t.cost === 0).map((t) => t.id);

/** The page theme: free ones for anyone, paid ones only if the server says they're owned. */
export function useActiveTheme(): ThemeId {
  const chosen = useSettings((s) => s.theme);
  const owned = useProfile((s) => s.me?.themes);
  return FREE_THEMES.includes(chosen) || owned?.includes(chosen) ? chosen : 'midnight';
}
