import { formatMove, type Vec3 } from '@cuberush/cube-core';
import { describe, expect, it } from 'vitest';
import { dragToMove, faceNormalFromPoint, type ScreenVec } from './drag';

/** Camera looking straight at the front face: +x is right, +y is up (screen y is down). */
const frontView = (axis: Vec3): ScreenVec => [axis[0] * 100, -axis[1] * 100];
/** Camera looking straight down at the top face, front edge at the bottom of the screen. */
const topView = (axis: Vec3): ScreenVec => [axis[0] * 100, axis[2] * 100];

function dragOn(point: Vec3, drag: ScreenVec, view = frontView): string | null {
  const move = dragToMove({
    n: 3,
    point,
    normal: faceNormalFromPoint(point),
    drag,
    screenDirOf: view,
  });
  return move && formatMove(move);
}

describe('faceNormalFromPoint', () => {
  it('picks the face along the dominant axis', () => {
    expect(faceNormalFromPoint([0.2, 1.1, 1.5])).toEqual([0, 0, 1]);
    expect(faceNormalFromPoint([-1.5, 0.3, -0.9])).toEqual([-1, 0, 0]);
    expect(faceNormalFromPoint([0.4, -1.5, 0])).toEqual([0, -1, 0]);
  });
});

describe('dragToMove', () => {
  it('ignores tiny drags', () => {
    expect(dragOn([1, 1, 1.5], [3, 4])).toBeNull();
  });

  it('dragging the front right column up turns R', () => {
    expect(dragOn([1, 0, 1.5], [0, -60])).toBe('R');
    expect(dragOn([1, 0, 1.5], [0, 60])).toBe("R'");
  });

  it('dragging the front left column down turns L', () => {
    expect(dragOn([-1, 0.4, 1.5], [0, 60])).toBe('L');
  });

  it('dragging the front top row sideways turns U', () => {
    expect(dragOn([0.3, 1.2, 1.5], [-60, 0])).toBe('U');
    expect(dragOn([0.3, 1.2, 1.5], [60, 0])).toBe("U'");
  });

  it('dragging the middle row or column turns a slice', () => {
    expect(dragOn([0.1, 0, 1.5], [0, 60])).toBe('M');
    expect(dragOn([0.1, 0.2, 1.5], [60, 0])).toBe('E');
  });

  it('picks the closest axis for diagonal drags', () => {
    expect(dragOn([1, 0, 1.5], [10, -60])).toBe('R');
  });

  it('works on the top face', () => {
    // Pushing the front row of U to the right turns F clockwise.
    expect(dragOn([0, 1.5, 1], [60, 0], topView)).toBe('F');
    // Pulling the right column of U toward the viewer turns R'.
    expect(dragOn([1, 1.5, 0], [0, 60], topView)).toBe("R'");
  });
});
