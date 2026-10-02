# 3D Rubik's Cube Website: Ideas

Core features: 3D cube you can solve, timer, points, leaderboard.

## 1. Game Modes (chosen direction)

| Idea | What it is | Fun | Difficulty |
|---|---|---|---|
| Daily Scramble | Everyone gets the same seeded scramble each day, with a daily leaderboard | High | Easy |
| Blindfold Mode | Cube is shown for 10s, then colors hide and you solve from memory | High | Medium |
| Limited Moves | Solve in N moves or fewer | Medium | Easy |
| Mirror/Chaos Mode | Controls randomly invert or swap mid-solve | High | Medium |
| Race Ghost | Race a replay of your best solve (or a friend's) | High | Medium |
| Live 1v1 | Same scramble, two players, first to solve wins | Very high | Hard (WebSockets) |

## 2. Game Twists (still thinking)

| Idea | What it is | Fun | Difficulty |
|---|---|---|---|
| Survival Mode | The cube re-scrambles a few moves every 20s, survive as long as you can | High | Easy |
| Fog of War | You only see 3 faces and must rotate the camera to check the rest | Medium | Easy |
| Puzzle Levels | Pre-set states with goals like "solve the white cross in 8 moves" | High | Medium |
| Time Attack | Solve as many 2x2s as possible in 3 minutes | High | Easy |
| Share a Challenge | A link with a scramble seed (`/c/abc123`) so friends can try to beat your time | High | Easy |
| Custom Stickers | Upload your face or a logo and map it onto the cube | Medium | Easy |

## 3. Scoring Ideas

- **Points formula:** base points minus time, plus bonuses for no undo, few moves, or a solve streak
- **Combo multiplier:** bonus points per stage (white cross, F2L, last layer) when done fast
- **Handicaps:** bigger cubes (2x2, 4x4) or bigger multipliers for harder scrambles

## 4. Other Puzzles

- 2x2, Pyraminx, Skewb, Mirror Cube all work with the same engine once turn logic is generic
- 4x4 is much harder because of parity cases, so leave it for last

## 5. Learning and Stats

- **Beginner tutorial:** step-by-step layer-by-layer guidance that highlights the next move
- **Algorithm trainer:** drills for last-layer cases (OLL/PLL)
- **Stats page:** Ao5, Ao12, personal best, progress graph
- **Achievements:** "First solve", "Sub-60", "10 days in a row"

## 6. Polish and Presentation

- Sound effects and a "click" on each turn
- Each turn plays a note, so a fast solve sounds like a melody
- Confetti, camera shake, and particles on the final turn
- Slow-motion replay of your solve
- Skins and themes (neon, wood, pastel) unlocked with points
- Auto-solve hint button that costs points

## 7. Anti-Cheat (design this from the start)

Anyone can send `time: 0.5` to the API. Fix: send the full move list with each solve, then have the server replay it on the seeded scramble to confirm it ends solved and the time is plausible. Easy to design in early, painful to add later.

## 8. Suggested Build Order

1. Solid 3D cube with smooth turns, timer, and move counting
2. Daily Scramble plus leaderboard (with move-list verification)
3. Skins unlocked with points
4. Signature twist: Ghost Race, Blindfold, Survival, or Share a Challenge
5. Later: Live 1v1

## 9. Tech Notes

- Rendering: Three.js (or react-three-fiber if using React)
- Hardest part: cube state representation and animating layer rotations correctly
- Seeded scrambles: use a seeded random number generator so the same seed always gives the same scramble