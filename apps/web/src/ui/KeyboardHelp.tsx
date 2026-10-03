import { useEffect, useRef, useState } from 'react';
import { KEY_ROWS, KEYMAP } from '../game/keyboard';
import { useSettings } from '../game/settings';

/** Only shown where there is likely a physical keyboard. */
const FINE_POINTER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true;

/** A "Keys" button plus a keyboard cheat sheet; `?` toggles it too. */
export function KeyboardHelp() {
  const enabled = useSettings((s) => s.keyboard);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const card = dialog.current;
    if (!card) return;
    if (open && !card.open) card.showModal();
    if (!open && card.open) card.close();
  }, [open]);

  if (!enabled || !FINE_POINTER) return null;
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} title="Keyboard controls (?)">
        Keys
      </button>
      <dialog
        ref={dialog}
        className="result keys"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      >
        <h2>Keyboard controls</h2>
        <p className="keys__note">
          The csTimer layout: your right hand does R and U, your left hand L and U′. Ctrl+Z undoes.
        </p>
        <div className="keys__board">
          {KEY_ROWS.map((row, r) => (
            <div key={row} className="keys__row" style={{ marginLeft: `${r * 0.6}rem` }}>
              {[...row].map((key) => (
                <span key={key} className={KEYMAP[key] ? 'keys__key keys__key--on' : 'keys__key'}>
                  <kbd>{key.toUpperCase()}</kbd>
                  <span>{KEYMAP[key]?.replace("'", '′') ?? ''}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <button className="btn btn--primary" onClick={() => setOpen(false)}>
          Got it
        </button>
      </dialog>
    </>
  );
}
