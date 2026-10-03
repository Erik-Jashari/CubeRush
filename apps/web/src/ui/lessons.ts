import type { LessonId } from '@cuberush/api';
import type { AlgorithmId, Stage } from '@cuberush/cube-core';

/** Top-face patterns of the yellow-cross step, as 3×3 grids (true = yellow). */
export type CaseId = 'dot' | 'ell' | 'line' | 'cross';

export const CASES: Record<CaseId, { name: string; how: string; cells: boolean[] }> = {
  dot: {
    name: 'Dot',
    how: 'Any way round.',
    cells: [false, false, false, false, true, false, false, false, false],
  },
  ell: {
    name: 'L shape',
    how: 'Hold the L at the back and left.',
    cells: [false, true, false, true, true, false, false, false, false],
  },
  line: {
    name: 'Line',
    how: 'Hold the line left to right.',
    cells: [false, false, false, true, true, true, false, false, false],
  },
  cross: {
    name: 'Cross',
    how: 'Done!',
    cells: [false, true, false, true, true, true, false, true, false],
  },
};

export type LessonStep =
  | { kind: 'read'; title: string; body: string[] }
  /** Follow a sequence turn by turn with an arrow; `fresh` starts from a solved cube. */
  | { kind: 'moves'; title: string; body: string[]; moves: string; fresh: boolean }
  /** Solve a practice cube until `stage` is done. */
  | {
      kind: 'practice';
      title: string;
      body: string[];
      stage: Stage;
      algorithms: AlgorithmId[];
      cases?: CaseId[];
    }
  /** A whole scrambled cube, with hints from wherever the player gets stuck. */
  | { kind: 'solve'; title: string; body: string[] };

export interface Lesson {
  /** Also listed in LESSON_IDS (@cuberush/api) so the server accepts progress for it. */
  id: LessonId;
  course: CourseId;
  title: string;
  summary: string;
  view: 'top' | 'bottom';
  steps: LessonStep[];
}

export type CourseId = 'moves' | 'method';

export const COURSES: { id: CourseId; title: string; blurb: string }[] = [
  { id: 'moves', title: 'Moves 101', blurb: 'What R, U and F mean, and your first algorithms.' },
  {
    id: 'method',
    title: 'Solve the cube',
    blurb: 'The beginner method: seven steps, a few algorithms each.',
  },
];

const repeat = (moves: string, times: number) =>
  Array.from({ length: times }, () => moves).join(' ');

/** Shown above every practice cube in the method course. */
const HOLD = 'White center on the bottom, yellow on top. Drag the background to look around.';

export const LESSONS: Lesson[] = [
  {
    id: 'faces',
    course: 'moves',
    title: 'Faces and turns',
    summary: 'The six letters and what a prime means.',
    view: 'top',
    steps: [
      {
        kind: 'read',
        title: 'Every face has a letter',
        body: [
          'R is the right face, L left, U up, D down, F front and B back.',
          'A letter on its own means turn that face a quarter turn clockwise, as if you were looking straight at it. A prime (R′) means counterclockwise.',
        ],
      },
      {
        kind: 'moves',
        title: 'Try each face',
        body: [
          'Follow the arrow: drag a sticker on the highlighted layer the way it points. Each move is followed by its undo.',
        ],
        moves: "R R' U U' F F' L L' D D' B B'",
        fresh: true,
      },
    ],
  },
  {
    id: 'doubles',
    course: 'moves',
    title: 'Half turns and the middle',
    summary: 'R2, and slices like M.',
    view: 'top',
    steps: [
      {
        kind: 'moves',
        title: 'Half turns',
        body: ['A 2 means a half turn. Turn the same way twice.'],
        moves: 'R2 U2 F2 F2 U2 R2',
        fresh: true,
      },
      {
        kind: 'moves',
        title: 'The middle slice',
        body: [
          'M turns the middle layer between L and R, the same way L turns. Drag a sticker in the middle column.',
        ],
        moves: "M M' M2 M2",
        fresh: false,
      },
    ],
  },
  {
    id: 'sexy',
    course: 'moves',
    title: 'Your first algorithm',
    summary: "R U R' U', six times round.",
    view: 'top',
    steps: [
      {
        kind: 'read',
        title: 'What an algorithm is',
        body: [
          'An algorithm is a short sequence you learn by heart. R U R′ U′ is the most famous one; cubers call it the sexy move.',
          'It scrambles a few pieces, but do it six times and the cube comes back solved.',
        ],
      },
      {
        kind: 'moves',
        title: "R U R' U' × 6",
        body: ['Get the rhythm: right up, top left, right down, top right.'],
        moves: repeat("R U R' U'", 6),
        fresh: true,
      },
    ],
  },
  {
    id: 'sune',
    course: 'moves',
    title: 'Sune, and undoing it',
    summary: 'A last-layer algorithm and its reverse.',
    view: 'top',
    steps: [
      {
        kind: 'moves',
        title: 'Sune',
        body: ['R U R′ U R U2 R′ is used on the last layer. Watch how only the top changes.'],
        moves: "R U R' U R U2 R'",
        fresh: true,
      },
      {
        kind: 'moves',
        title: 'Backwards undoes it',
        body: [
          'Any algorithm is undone by doing it backwards with every turn reversed: R U2 R′ U′ R U′ R′.',
        ],
        moves: "R U2 R' U' R U' R'",
        fresh: false,
      },
    ],
  },

  {
    id: 'cross',
    course: 'method',
    title: '1. White cross',
    summary: 'A white plus on the bottom.',
    view: 'bottom',
    steps: [
      {
        kind: 'read',
        title: 'The goal',
        body: [
          'Make a white plus around the white center on the bottom. Each white edge’s other color must also match the center next to it.',
          'There is no algorithm for this step: you work it out, a piece at a time.',
        ],
      },
      {
        kind: 'practice',
        title: 'Build the cross',
        body: [
          HOLD,
          'Find a white edge on top. Turn U until its other color sits above the matching center, then turn that side twice to drop it down.',
          'A white edge in the middle layer or flipped the wrong way: turn its side once to bring it up first.',
        ],
        stage: 1,
        algorithms: [],
      },
    ],
  },
  {
    id: 'corners',
    course: 'method',
    title: '2. White corners',
    summary: 'Finish the first layer.',
    view: 'bottom',
    steps: [
      {
        kind: 'practice',
        title: 'Drop the corners in',
        body: [
          HOLD,
          'Find a white corner on top. Turn U until it sits right above its spot (its colors match the centers below it), and hold it at the front right.',
          'Repeat R U R′ U′ until it drops in with white facing down. It takes one, three or five goes.',
        ],
        stage: 2,
        algorithms: ['sexy'],
      },
    ],
  },
  {
    id: 'middle',
    course: 'method',
    title: '3. Middle edges',
    summary: 'The second layer.',
    view: 'top',
    steps: [
      {
        kind: 'practice',
        title: 'Slot the edges',
        body: [
          HOLD,
          'Find an edge on top without yellow. Turn U until its front color matches the front center. If its top color matches the right center, send it right; if it matches the left center, send it left.',
          'An edge stuck in the middle the wrong way: insert any top edge in its place to pop it out.',
        ],
        stage: 3,
        algorithms: ['rightInsert', 'leftInsert'],
      },
    ],
  },
  {
    id: 'yellow-cross',
    course: 'method',
    title: '4. Yellow cross',
    summary: 'A yellow plus on top.',
    view: 'top',
    steps: [
      {
        kind: 'practice',
        title: 'Make the yellow plus',
        body: [
          HOLD,
          'Look only at the yellow edges on top. Hold the shape as shown and do the algorithm; repeat until you have a cross.',
        ],
        stage: 4,
        algorithms: ['yellowCross'],
        cases: ['dot', 'ell', 'line', 'cross'],
      },
    ],
  },
  {
    id: 'yellow-edges',
    course: 'method',
    title: '5. Yellow edges',
    summary: 'Match the cross to the sides.',
    view: 'top',
    steps: [
      {
        kind: 'practice',
        title: 'Line up the edges',
        body: [
          HOLD,
          'Turn U until two neighboring yellow edges match their side centers. Turn the whole cube so those two are at the back and right, then do the edge swap.',
          'If the two matching edges are opposite each other, do the edge swap once from any side and look again.',
        ],
        stage: 5,
        algorithms: ['edgeSwap'],
      },
    ],
  },
  {
    id: 'place-corners',
    course: 'method',
    title: '6. Place the corners',
    summary: 'Every yellow corner in its spot.',
    view: 'top',
    steps: [
      {
        kind: 'practice',
        title: 'Cycle the corners',
        body: [
          HOLD,
          'A corner is in its spot when its three colors match the three centers around it, even if it is twisted.',
          'Hold a correct corner at the front right and do the corner cycle until all four are in place. No corner right yet? Do it once from anywhere.',
        ],
        stage: 6,
        algorithms: ['cornerCycle'],
      },
    ],
  },
  {
    id: 'twist-corners',
    course: 'method',
    title: '7. Twist the corners',
    summary: 'The last step: a solved cube.',
    view: 'top',
    steps: [
      {
        kind: 'practice',
        title: 'Finish the cube',
        body: [
          HOLD,
          'Hold a twisted corner at the front right. Repeat R′ D′ R D until its yellow faces up. The bottom will look broken; keep going.',
          'Then turn only U to bring the next twisted corner to the front right, and repeat. When the last one is done, the whole cube fixes itself.',
        ],
        stage: 7,
        algorithms: ['cornerTwist'],
      },
    ],
  },
  {
    id: 'full-solve',
    course: 'method',
    title: '8. Solve a whole cube',
    summary: 'All seven steps on a real scramble, with hints when you are stuck.',
    view: 'top',
    steps: [
      {
        kind: 'solve',
        title: 'Your first full solve',
        body: [
          HOLD,
          'Go through the seven steps in order. Stuck? Press Hint: it looks at your cube, works out which step you are on and shows the next few moves.',
        ],
      },
    ],
  },
];

export function lessonsOf(course: CourseId): Lesson[] {
  return LESSONS.filter((l) => l.course === course);
}
