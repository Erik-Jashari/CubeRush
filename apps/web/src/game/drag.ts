import { AXES, type Move, type Vec3 } from '@cuberush/cube-core';

/** A 2D direction in screen pixels (y grows downward). */
export type ScreenVec = readonly [number, number];

/** Drags shorter than this many pixels are ignored, so taps don't turn layers. */
export const DRAG_THRESHOLD_PX = 12;

/**
 * Outward normal of the outer face that `point` lies on. The cube is centered on the origin,
 * so the face is the one along the point's dominant axis.
 */
export function faceNormalFromPoint(point: Vec3): Vec3 {
  const abs = point.map(Math.abs);
  const axis = abs.indexOf(Math.max(...abs));
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = Math.sign(point[axis]!) || 1;
  return normal;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface DragInput {
  /** Cube size. */
  n: number;
  /** Where the drag started, in world units (one cubie = 1 unit, cube centered on the origin). */
  point: Vec3;
  /** Outward normal of the face the drag started on. */
  normal: Vec3;
  /** Pointer movement since the drag started, in screen pixels. */
  drag: ScreenVec;
  /** Where a unit step along a world axis lands on screen, measured at `point`. */
  screenDirOf: (axis: Vec3) => ScreenVec;
}

/**
 * Turns a drag on a sticker into a layer turn: the drag picks the in-face direction the sticker
 * should travel, and the layer turns so that the sticker moves that way.
 */
export function dragToMove({ n, point, normal, drag, screenDirOf }: DragInput): Move | null {
  if (Math.hypot(drag[0], drag[1]) < DRAG_THRESHOLD_PX) return null;

  // The two world axes lying in the face, compared by how well they match the drag on screen.
  let best: { tangent: Vec3; score: number } | null = null;
  for (let i = 0; i < 3; i++) {
    if (normal[i] !== 0) continue;
    const tangent: [number, number, number] = [0, 0, 0];
    tangent[i] = 1;
    const [sx, sy] = screenDirOf(tangent);
    const length = Math.hypot(sx, sy);
    if (length < 1e-6) continue;
    const score = (drag[0] * sx + drag[1] * sy) / length;
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { tangent, score };
  }
  if (!best) return null;

  const direction = best.tangent.map((v) => v * Math.sign(best.score)) as unknown as Vec3;
  // A +90° turn about normal × direction carries the face's stickers along `direction`.
  const rotationAxis = cross(normal, direction);
  const axisIndex = rotationAxis.findIndex((v) => v !== 0);
  const layer = Math.min(n - 1, Math.max(0, Math.floor(point[axisIndex]! + n / 2)));
  return {
    axis: AXES[axisIndex]!,
    from: layer,
    to: layer,
    turns: rotationAxis[axisIndex]! > 0 ? 1 : -1,
  };
}
