import { CHALLENGE_CODE_PATTERN } from '@cuberush/api';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useGame } from './game/store';
import { connectSession, openChallenge } from './net/session';
import './styles.css';

connectSession();

// Share links look like /c/<code>.
const challengeCode = /^\/c\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
if (challengeCode && CHALLENGE_CODE_PATTERN.test(challengeCode)) openChallenge(challengeCode);

// Dev builds only: lets you inspect or drive the game from the browser console.
if (import.meta.env.DEV) Object.assign(window, { cuberush: useGame });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
