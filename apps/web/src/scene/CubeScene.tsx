import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Move } from '@cuberush/cube-core';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Group, MOUSE, Vector3 } from 'three';
import { useReplay } from '../game/replay';
import { useSettings } from '../game/settings';
import { playTurn } from '../game/sound';
import { colorsHidden, useGame } from '../game/store';
import { useTutorial } from '../game/tutorial';
import { useActiveSkin } from '../net/profile';
import { Cube, TURN_MS } from './Cube';
import { MoveHint } from './MoveHint';

const FOV = 40;
/** Radius of a sphere around a 3x3 (half its space diagonal). */
const CUBE_RADIUS = 1.5 * Math.sqrt(3);
/** Margins around the cube; the HUD sits above and below it, so vertical needs more room. */
const V_MARGIN = 1.35;
const H_MARGIN = 1.1;
/**
 * Left-drag on the background and right-drag anywhere (even on the cube) orbit the camera;
 * left-drag on the cube turns layers instead (see Cube.tsx).
 */
const MOUSE_BUTTONS = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
/** On the home screen the camera looks below the cube so it sits above the menu panel. */
const HOME_LIFT = 0.14;
/** Lessons pull the camera back and lift the cube into the space above the lesson card. */
const LESSON_LIFT = 0.15;
const LESSON_ZOOM_OUT = 1.4;

/** Camera distance that fits the cube on screen in both directions, so phones see it whole. */
function useFitDistance(): number {
  const { width, height } = useThree((s) => s.size);
  return useMemo(() => {
    const vHalf = ((FOV / 2) * Math.PI) / 180;
    const hHalf = Math.atan(Math.tan(vHalf) * (width / height));
    return Math.max(
      (CUBE_RADIUS * V_MARGIN) / Math.sin(vHalf),
      (CUBE_RADIUS * H_MARGIN) / Math.sin(hHalf),
    );
  }, [width, height]);
}

function CameraRig({ onHome, inLesson }: { onHome: boolean; inLesson: boolean }) {
  const distance = useFitDistance();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3 } | null;
  const goal = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.position.setLength(distance * (inLesson ? LESSON_ZOOM_OUT : 1));
  }, [camera, distance, inLesson]);

  // Lessons about the bottom layer swing the camera underneath.
  const view = useTutorial((s) => s.view);
  useEffect(() => {
    const length = camera.position.length();
    camera.position.set(4.2, view === 'bottom' ? -3.6 : 3.6, 5.6).setLength(length);
  }, [camera, view]);

  // Glide the look-at point between screens instead of jumping.
  useFrame((_, delta) => {
    if (!controls) return;
    const lift = inLesson ? LESSON_LIFT : onHome ? HOME_LIFT : 0;
    goal.set(0, -distance * lift, 0);
    controls.target.lerp(goal, 1 - Math.exp(-delta * 5));
  });

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      mouseButtons={MOUSE_BUTTONS}
      minDistance={distance * 0.6}
      maxDistance={distance * 1.6}
      autoRotate={onHome}
      autoRotateSpeed={1.2}
    />
  );
}

const SHAKE_MS = 450;

/** A short shake of the whole cube when a solve lands. */
function Shake({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(
    () =>
      useGame.subscribe((state, prev) => {
        const solved = state.result && !prev.result && state.result.cleared !== 0;
        if (solved && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          startedAt.current = performance.now();
        }
      }),
    [],
  );

  useFrame(() => {
    const g = group.current;
    if (!g || startedAt.current === null) return;
    const t = (performance.now() - startedAt.current) / SHAKE_MS;
    if (t >= 1) {
      g.position.set(0, 0, 0);
      startedAt.current = null;
      return;
    }
    const strength = 0.12 * (1 - t) ** 2;
    g.position.set(
      Math.sin(t * 70) * strength,
      Math.cos(t * 83) * strength * 0.7,
      Math.sin(t * 61) * strength * 0.5,
    );
  });

  return <group ref={group}>{children}</group>;
}

/** Runs the replay clock while the replay screen is open. */
function ReplayDriver() {
  useFrame((_, delta) => useReplay.getState().advance(delta * 1000));
  return null;
}

function onTurnStart(move: Move, n: number) {
  const { sound, melody } = useSettings.getState();
  if (sound) playTurn(move, n, melody);
}

export function CubeScene() {
  const onHome = useGame((s) => s.screen !== 'play' && s.screen !== 'replay');
  const inLesson = useGame((s) => s.screen === 'play' && s.mode === 'tutorial');
  const replaying = useGame((s) => s.screen === 'replay');
  const look = useGame((s) => (colorsHidden(s) ? 'hidden' : 'normal'));
  const speed = useReplay((s) => s.speed);
  const skin = useActiveSkin();
  return (
    <Canvas
      className="scene"
      camera={{ position: [4.2, 3.6, 5.6], fov: FOV }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, -3, -5]} intensity={0.5} />
      <Shake>
        {replaying ? (
          <Cube
            key="replay"
            source={useReplay.getState}
            skin={skin}
            turnMs={TURN_MS / speed}
            onTurnStart={onTurnStart}
          />
        ) : (
          <Cube
            key="game"
            source={useGame.getState}
            interactive
            look={look}
            skin={skin}
            onTurnStart={onTurnStart}
          />
        )}
        <MoveHint />
      </Shake>
      {replaying && <ReplayDriver />}
      <CameraRig onHome={onHome} inLesson={inLesson} />
    </Canvas>
  );
}
