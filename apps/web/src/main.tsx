import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useGame } from './game/store';
import './styles.css';

// Dev builds only: lets you inspect or drive the game from the browser console.
if (import.meta.env.DEV) Object.assign(window, { cuberush: useGame });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
