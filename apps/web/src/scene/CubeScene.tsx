import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { MOUSE, Vector3 } from 'three';
import { colorsHidden, useGame } from '../game/store';
import { Cube } from './Cube';

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

function CameraRig({ onHome }: { onHome: boolean }) {
  const distance = useFitDistance();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3 } | null;
  const goal = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.position.setLength(distance);
  }, [camera, distance]);

  // Glide the look-at point between screens instead of jumping.
  useFrame((_, delta) => {
    if (!controls) return;
    goal.set(0, onHome ? -distance * HOME_LIFT : 0, 0);
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

export function CubeScene() {
  const onHome = useGame((s) => s.screen !== 'play');
  const look = useGame((s) => (colorsHidden(s) ? 'hidden' : 'normal'));
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
      <Cube source={useGame.getState} interactive look={look} />
      <CameraRig onHome={onHome} />
    </Canvas>
  );
}
