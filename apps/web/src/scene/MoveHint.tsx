import { layerToCoord, type Axis } from '@cuberush/cube-core';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Group, MeshBasicMaterial } from 'three';
import { useGame } from '../game/store';
import { useTutorial } from '../game/tutorial';

const RADIUS = 2.3;
const ARC = Math.PI * 0.55;
const HALF_ARC = Math.PI * 0.95;

/** Turns the local frame so its +z is the move's axis (the arrow is drawn around local z). */
const AXIS_ROTATION: Record<Axis, [number, number, number]> = {
  x: [0, Math.PI / 2, 0],
  y: [-Math.PI / 2, 0, 0],
  z: [0, 0, 0],
};

/**
 * Shows the tutorial's next turn on the cube: a tinted slab over the layer and a curved arrow
 * around it in the turning direction. The arrow swings round to face the camera.
 */
export function MoveHint() {
  const hint = useTutorial((s) => s.hint);
  const show = useGame((s) => s.screen === 'play' && s.mode === 'tutorial');
  const spin = useRef<Group>(null);
  const camera = useThree((s) => s.camera);

  const materials = useMemo(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return {
      arrow: new MeshBasicMaterial({ color: accent || '#ffd23f' }),
      slab: new MeshBasicMaterial({
        color: accent || '#ffd23f',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    };
  }, [hint]);

  useFrame(() => {
    const group = spin.current;
    if (!group?.parent) return;
    const eye = group.parent.worldToLocal(camera.position.clone());
    const arc = hint?.turns === 2 ? HALF_ARC : ARC;
    group.rotation.z = Math.atan2(eye.y, eye.x) - arc / 2;
  });

  if (!show || !hint) return null;

  const arc = hint.turns === 2 ? HALF_ARC : ARC;
  // Layer centers in world units (cubie spacing 1).
  const center = (layerToCoord(3, hint.from) + layerToCoord(3, hint.to)) / 4;
  const depth = hint.to - hint.from + 1;
  // Positive turns go counterclockwise about +axis; mirroring flips the arrow for clockwise.
  const clockwise = hint.turns === -1;

  return (
    <group rotation={AXIS_ROTATION[hint.axis]}>
      <group position={[0, 0, center]}>
        <mesh material={materials.slab} renderOrder={2}>
          <boxGeometry args={[3.08, 3.08, depth + 0.06]} />
        </mesh>
        <group scale={[1, clockwise ? -1 : 1, 1]}>
          <group ref={spin}>
            <mesh material={materials.arrow}>
              <torusGeometry args={[RADIUS, 0.07, 10, 48, arc]} />
            </mesh>
            <mesh
              material={materials.arrow}
              position={[RADIUS * Math.cos(arc), RADIUS * Math.sin(arc), 0]}
              rotation={[0, 0, arc]}
            >
              <coneGeometry args={[0.2, 0.45, 16]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
