import type { SkinId, ThemeId } from '@cuberush/api';
import { create } from 'zustand';

export interface Settings {
  /** 15 s look at the scramble before the timer starts. */
  inspection: boolean;
  /** Race a ghost replay when one is available. */
  ghost: boolean;
  /** Click on every turn and a fanfare on solves. */
  sound: boolean;
  /** Each face plays its own note, so a fast solve sounds like a melody. */
  melody: boolean;
  /** Turn the cube with the keyboard (csTimer layout). */
  keyboard: boolean;
  /** Chosen look; only applied if the player owns it. */
  skin: SkinId;
  /** Chosen page theme; paid ones only apply if owned. */
  theme: ThemeId;
}

const STORAGE_KEY = 'cuberush:settings';
const DEFAULTS: Settings = {
  inspection: true,
  ghost: true,
  sound: true,
  melody: false,
  keyboard: true,
  skin: 'classic',
  theme: 'midnight',
};

// Storage can be missing or throw (private windows, blocked site data); settings then just reset.
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisted this time.
  }
}

interface SettingsState extends Settings {
  update(patch: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...load(),
  update(patch) {
    set(patch);
    const { inspection, ghost, sound, melody, keyboard, skin, theme } = get();
    save({ inspection, ghost, sound, melody, keyboard, skin, theme });
  },
}));
