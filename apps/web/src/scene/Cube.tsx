import {
  AXIS_INDEX,
  createSolvedCube,
  cubieColors,
  FACE_NORMALS,
  layerToCoord,
  type Cubie,
  type CubeState,
  type Face,
  type Move,
  type Vec3,
} from '@cuberush/cube-core';
import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  Group,
  Matrix4,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
  type Camera,
} from 'three';
import { dragToMove, faceNormalFromPoint, type ScreenVec } from '../game/drag';
import { canTurn, useGame } from '../game/store';
import { STICKER_COLORS } from './colors';

const CUBIE_SIZE = 0.95;
const STICKER_SIZE = 0.82;
const STICKER_OFFSET = CUBIE_SIZE / 2 + 0.002;
/** Duration of one quarter turn; turns queued up behind it play faster so input never lags. */
const TURN_MS = 160;
const MIN_TURN_MS = 45;

/** Rotation that turns a +z-facing plane to face each side. */
const STICKER_ROTATION: Readonly<Record<Face, [number, number, number]>> = {
  F: [0, 0, 0],
  B: [0, Math.PI, 0],
  R: [0, Math.PI / 2, 0],
  L: [0, -Math.PI / 2, 0],
  U: [-Math.PI / 2, 0, 0],
  D: [Math.PI / 2, 0, 0],
};

const AXIS_VECTORS = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

function roundedSquare(size: number, radius: number): ShapeGeometry {
  const h = size / 2;
  const shape = new Shape();
  shape.moveTo(-h + radius, -h);
  shape.lineTo(h - radius, -h);
  shape.quadraticCurveTo(h, -h, h, -h + radius);
  shape.lineTo(h, h - radius);
  shape.quadraticCurveTo(h, h, h - radius, h);
  shape.lineTo(-h + radius, h);
  shape.quadraticCurveTo(-h, h, -h, h - radius);
  shape.lineTo(-h, -h + radius);
  shape.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new ShapeGeometry(shape, 6);
}

const stickerGeometry = roundedSquare(STICKER_SIZE, 0.11);

/** How the cube is drawn: normally, with blank stickers (blindfold), or see-through (ghost). */
export type CubeLook = 'normal' | 'hidden' | 'ghost';

function materialsFor(look: CubeLook) {
  const ghost = look === 'ghost' ? { transparent: true, opacity: 0.55, depthWrite: false } : {};
  const sticker = (color: string) =>
    new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, ...ghost });
  const blank = sticker('#4a4f60');
  return {
    body: new MeshStandardMaterial({ color: '#111216', roughness: 0.55, ...ghost }),
    stickers: Object.fromEntries(
      Object.entries(STICKER_COLORS).map(([face, color]) => [
        face,
        look === 'hidden' ? blank : sticker(color),
      ]),
    ) as Record<Face, MeshStandardMaterial>,
  };
}

const MATERIALS: Record<CubeLook, ReturnType<typeof materialsFor>> = {
  normal: materialsFor('normal'),
  hidden: materialsFor('hidden'),
  ghost: materialsFor('ghost'),
};

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** World transform of a cubie at rest: its rotation, then its position (one cubie = 1 unit). */
function restMatrix(cubie: Cubie, out: Matrix4): Matrix4 {
  const r = cubie.rot;
  const [x, y, z] = cubie.pos;
  return out.set(
    r[0],
    r[1],
    r[2],
    x / 2,
    r[3],
    r[4],
    r[5],
    y / 2,
    r[6],
    r[7],
    r[8],
    z / 2,
    0,
    0,
    0,
    1,
  );
}

function screenDirection(camera: Camera, width: number, height: number, point: Vec3) {
  return (axis: Vec3): ScreenVec => {
    const origin = new Vector3(...point).project(camera);
    const tip = new Vector3(...point).addScaledVector(new Vector3(...axis), 0.5).project(camera);
    return [((tip.x - origin.x) * width) / 2, (-(tip.y - origin.y) * height) / 2];
  };
}

interface Controls {
  enabled: boolean;
}

/** Anything the cube view can play: the player's game or a ghost replay. */
export interface AnimatedCube {
  displayed: CubeState;
  animQueue: Move[];
  finishAnimation(): void;
}

interface CubeProps {
  /** Reads the current state; called every frame. */
  source: () => AnimatedCube;
  /** Whether dragging turns layers (only the player's own cube). */
  interactive?: boolean;
  look?: CubeLook;
}

export function Cube({ source, interactive = false, look = 'normal' }: CubeProps) {
  const n = useMemo(() => source().displayed.n, [source]);
  const pieces = useMemo(() => createSolvedCube(n).cubies, [n]);
  const materials = MATERIALS[look];
  const groups = useRef<(Group | null)[]>([]);
  const progress = useRef(0);
  const getThree = useThree((s) => s.get);

  // All transforms are set here every frame straight from the store, so the view can never drift
  // from the cube state and React never re-renders while turning.
  const rest = useMemo(() => new Matrix4(), []);
  const turning = useMemo(() => new Matrix4(), []);
  useFrame((_, delta) => {
    let state = source();
    if (state.animQueue.length > 0) {
      const ms = Math.max(MIN_TURN_MS, TURN_MS / state.animQueue.length);
      progress.current += (delta * 1000) / ms;
      if (progress.current >= 1) {
        progress.current = 0;
        state.finishAnimation();
        state = source();
      }
    }

    const move = state.animQueue[0];
    const axis = move ? AXIS_INDEX[move.axis] : 0;
    const lo = move ? layerToCoord(n, move.from) : 0;
    const hi = move ? layerToCoord(n, move.to) : 0;
    const angle = move ? (easeOutCubic(progress.current) * move.turns * Math.PI) / 2 : 0;
    if (move) turning.makeRotationAxis(AXIS_VECTORS[move.axis], angle);

    for (const cubie of state.displayed.cubies) {
      const group = groups.current[cubie.id];
      if (!group) continue;
      restMatrix(cubie, rest);
      const coord = cubie.pos[axis];
      if (move && coord >= lo && coord <= hi) group.matrix.multiplyMatrices(turning, rest);
      else group.matrix.copy(rest);
      group.matrixWorldNeedsUpdate = true;
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || !canTurn(useGame.getState())) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // right-drag orbits, even on the cube
    e.stopPropagation();

    const { camera, size, controls } = getThree();
    const orbit = controls as unknown as Controls | null;
    if (orbit) orbit.enabled = false;

    const point: Vec3 = [e.point.x, e.point.y, e.point.z];
    const normal = faceNormalFromPoint(point);
    const screenDirOf = screenDirection(camera, size.width, size.height, point);
    const { clientX: startX, clientY: startY, pointerId } = e;
    let turned = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || turned) return;
      const drag: ScreenVec = [ev.clientX - startX, ev.clientY - startY];
      const move = dragToMove({ n, point, normal, drag, screenDirOf });
      if (move) {
        turned = true; // one turn per drag
        useGame.getState().turn(move);
      }
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (orbit) orbit.enabled = true;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  return (
    <group onPointerDown={onPointerDown}>
      {pieces.map((piece) => (
        <group
          key={piece.id}
          ref={(g) => {
            groups.current[piece.id] = g;
          }}
          matrixAutoUpdate={false}
        >
          <RoundedBox
            args={[CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE]}
            radius={0.08}
            smoothness={3}
            material={materials.body}
          />
          {cubieColors(n, piece).map((face) => {
            const normal = new Vector3(...FACE_NORMALS[face]).multiplyScalar(STICKER_OFFSET);
            return (
              <mesh
                key={face}
                geometry={stickerGeometry}
                material={materials.stickers[face]}
                position={normal}
                rotation={STICKER_ROTATION[face]}
              />
            );
          })}
        </group>
      ))}
    </group>
  );
}
