/** The handful of sequences the beginner method needs, in WCA notation (white on the bottom). */
export const ALGORITHMS = {
  sexy: {
    name: 'Sexy move',
    notation: "R U R' U'",
    use: 'Repeat it to drop a white corner from above into the slot below it.',
  },
  rightInsert: {
    name: 'Edge to the right',
    notation: "U R U' R' U' F' U F",
    use: 'Moves the top-front edge into the middle layer on the right.',
  },
  leftInsert: {
    name: 'Edge to the left',
    notation: "U' L' U L U F U' F'",
    use: 'Moves the top-front edge into the middle layer on the left.',
  },
  yellowCross: {
    name: 'Yellow cross',
    notation: "F R U R' U' F'",
    use: 'Turns a dot into an L, an L into a line, a line into a cross.',
  },
  sune: {
    name: 'Sune',
    notation: "R U R' U R U2 R'",
    use: 'A last-layer classic: twists corners and moves three edges.',
  },
  edgeSwap: {
    name: 'Edge swap',
    notation: "R U R' U R U2 R' U",
    use: 'Sune plus one U: swaps the front and left yellow edges, back and right stay put.',
  },
  cornerCycle: {
    name: 'Corner cycle',
    notation: "U R U' L' U R' U' L",
    use: 'Cycles three yellow corners, keeping the front-right one in place.',
  },
  cornerTwist: {
    name: 'Corner twist',
    notation: "R' D' R D",
    use: 'Repeat on each corner until yellow is on top; the bottom fixes itself at the end.',
  },
} as const;

export type AlgorithmId = keyof typeof ALGORITHMS;
