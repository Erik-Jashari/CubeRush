import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useGhost } from '../game/ghost';
import { useGame } from '../game/store';
import { formatTime } from '../game/time';
import { useActiveSkin } from '../net/profile';
import { Cube } from './Cube';

/** Ghost time on the player's clock: it starts when the player's timer does. */
function ghostElapsed(now: number): number {
  const { startedAt } = useGame.getState();
  return startedAt === null ? 0 : now - startedAt;
}

/** Feeds the ghost its moves as the player's clock reaches each one. */
function GhostDriver() {
  useFrame(() => useGhost.getState().advanceTo(ghostElapsed(performance.now())));
  return null;
}

function GhostClock() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const { info } = useGhost.getState();
      if (ref.current && info) {
        const elapsed = ghostElapsed(performance.now());
        ref.current.textContent =
          elapsed >= info.timeMs ? `Done · ${formatTime(info.timeMs)}` : formatTime(elapsed);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <span ref={ref} className="ghost__clock" />;
}

/** A small see-through cube replaying a recorded solve, raced in real time. */
export function GhostView() {
  const info = useGhost((s) => s.info);
  const playing = useGame((s) => s.screen === 'play');
  const skin = useActiveSkin();
  if (!info || !playing) return null;

  return (
    <aside className="ghost" aria-label={`Racing the ghost of ${info.label}`}>
      <Canvas
        className="ghost__canvas"
        camera={{ position: [5, 4.3, 6.7], fov: 40 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[5, 8, 6]} intensity={1.6} />
        <GhostDriver />
        <Cube source={useGhost.getState} look="ghost" skin={skin} />
      </Canvas>
      <p className="ghost__label">
        <span>Ghost · {info.label}</span>
        <GhostClock />
      </p>
    </aside>
  );
}
