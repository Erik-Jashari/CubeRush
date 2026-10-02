/** Integer 3D vector. */
export type Vec3 = readonly [number, number, number];

/** Row-major 3x3 integer matrix (only ever a rotation by multiples of 90°). */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type Axis = 'x' | 'y' | 'z';

export const AXES: readonly Axis[] = ['x', 'y', 'z'];

export const AXIS_INDEX: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** +90° (counterclockwise, right-hand rule) rotation about each axis. */
const QUARTER_TURN: Readonly<Record<Axis, Mat3>> = {
  x: [1, 0, 0, 0, 0, -1, 0, 1, 0],
  y: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  z: [0, -1, 0, 1, 0, 0, 0, 0, 1],
};

export function mulMatVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mulMatMat(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(
        a[row * 3]! * b[col]! + a[row * 3 + 1]! * b[3 + col]! + a[row * 3 + 2]! * b[6 + col]!,
      );
    }
  }
  return out as unknown as Mat3;
}

/** Rotation by `quarterTurns` × 90° about `axis`; positive is counterclockwise (right-hand rule). */
export function rotationMatrix(axis: Axis, quarterTurns: number): Mat3 {
  const count = ((quarterTurns % 4) + 4) % 4;
  let m = IDENTITY;
  for (let i = 0; i < count; i++) m = mulMatMat(QUARTER_TURN[axis], m);
  return m;
}

export function vecEquals(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
