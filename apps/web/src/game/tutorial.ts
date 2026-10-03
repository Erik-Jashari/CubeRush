import { LESSON_IDS, type LessonId } from '@cuberush/api';
import type { Move } from '@cuberush/cube-core';
import { create } from 'zustand';

const STORAGE_KEY = 'cuberush:learn';

// Progress is kept in this browser (and on the account when signed in, see net/profile.ts);
// storage may be missing or throw.
function loadDone(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ((JSON.parse(raw) as { done?: string[] }).done ?? []) : [];
  } catch {
    return [];
  }
}

function saveDone(done: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ done }));
  } catch {
    // Not saved this time.
  }
}

/** Lessons finished in this browser that the account doesn't have yet (unknown ids skipped). */
export function lessonsToUpload(local: readonly string[], server: readonly LessonId[]): LessonId[] {
  return local.filter(
    (id): id is LessonId =>
      (LESSON_IDS as readonly string[]).includes(id) && !server.includes(id as LessonId),
  );
}

interface TutorialState {
  lessonId: string | null;
  step: number;
  /** The turn the on-cube arrow points out, if any. */
  hint: Move | null;
  /** Lessons about the bottom layer look at the cube from below. */
  view: 'top' | 'bottom';
  /** Finished lesson ids. */
  done: string[];
  open(lessonId: string, view: 'top' | 'bottom'): void;
  setStep(step: number): void;
  setHint(hint: Move | null): void;
  complete(lessonId: string): void;
  /** Adds lessons finished on another device. */
  adopt(lessonIds: readonly string[]): void;
  close(): void;
}

export const useTutorial = create<TutorialState>()((set, get) => ({
  lessonId: null,
  step: 0,
  hint: null,
  view: 'top',
  done: loadDone(),

  open(lessonId, view) {
    set({ lessonId, step: 0, hint: null, view });
  },

  setStep(step) {
    set({ step, hint: null });
  },

  setHint(hint) {
    set({ hint });
  },

  complete(lessonId) {
    const { done } = get();
    if (done.includes(lessonId)) return;
    const next = [...done, lessonId];
    saveDone(next);
    set({ done: next });
  },

  adopt(lessonIds) {
    const { done } = get();
    const next = [...done, ...lessonIds.filter((id) => !done.includes(id))];
    if (next.length === done.length) return;
    saveDone(next);
    set({ done: next });
  },

  close() {
    set({ lessonId: null, step: 0, hint: null, view: 'top' });
  },
}));
