import { useEffect, useState } from 'react';
import { useProfile } from '../net/profile';

export type Load<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/**
 * Fetches with the player's token (or none) and refetches when the player changes.
 * `fetcher` must be stable, e.g. a method of `api` or a module-level function.
 */
export function useLoad<T>(fetcher: (token: string | null) => Promise<T>): { load: Load<T> } {
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

  return { load };
}
