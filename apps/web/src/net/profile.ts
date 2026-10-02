import { THEMES, type MeResponse, type PlayerDto, type SkinId, type ThemeId } from '@cuberush/api';
import { create } from 'zustand';
import { useSettings } from '../game/settings';
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

  async refresh() {
    const { token } = get();
    if (!token) return;
    try {
      set({ me: await api.me(token) });
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
