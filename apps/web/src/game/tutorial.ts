import type { Move } from '@cuberush/cube-core';
import { create } from 'zustand';

const STORAGE_KEY = 'cuberush:learn';

// Lesson progress is a per-browser convenience; storage may be missing or throw.
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

  close() {
    set({ lessonId: null, step: 0, hint: null, view: 'top' });
  },
}));
