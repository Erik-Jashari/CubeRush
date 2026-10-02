import { useEffect } from 'react';
import { useGame } from './game/store';
import { useActiveTheme } from './net/profile';
import { CubeScene } from './scene/CubeScene';
import { GhostView } from './scene/GhostView';
import { ChallengeScreen } from './ui/ChallengeScreen';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { Learn } from './ui/Learn';
import { Lesson } from './ui/Lesson';
import { Leaderboard } from './ui/Leaderboard';
import { Profile } from './ui/Profile';
import { ReplayHud } from './ui/ReplayHud';
import { ResultModal } from './ui/ResultModal';
import { applyTheme } from './ui/themes';

export function App() {
  const screen = useGame((s) => s.screen);
  const mode = useGame((s) => s.mode);
  const theme = useActiveTheme();

  useEffect(() => applyTheme(theme), [theme]);

  // A `/c/<code>` link stays in the address bar while that challenge is on screen.
  useEffect(() => {
    const onChallenge = screen === 'challenge' || (screen === 'play' && mode === 'challenge');
    if (!onChallenge && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
  }, [screen, mode]);

  return (
    <div className="app">
      <CubeScene />
      <GhostView />
      {screen === 'home' && <Home />}
      {screen === 'play' && (mode === 'tutorial' ? <Lesson /> : <Hud mode={mode} />)}
      {screen === 'learn' && <Learn />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'challenge' && <ChallengeScreen />}
      {screen === 'profile' && <Profile />}
      {screen === 'replay' && <ReplayHud />}
      <ResultModal />
    </div>
  );
}
