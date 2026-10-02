import { useGame } from './game/store';
import { CubeScene } from './scene/CubeScene';
import { Home } from './ui/Home';
import { Hud } from './ui/Hud';
import { ResultModal } from './ui/ResultModal';

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <div className="app">
      <CubeScene />
      {screen === 'home' ? <Home /> : <Hud />}
      <ResultModal />
    </div>
  );
}
