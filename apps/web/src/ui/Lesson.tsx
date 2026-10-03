import {
  ALGORITHMS,
  applyMoves,
  createSolvedCube,
  formatMove,
  formatMoves,
  invertMove,
  nextHint,
  parseMove,
  parseMoves,
  practiceCube,
  stageReached,
  STAGES,
  type AlgorithmId,
  type CubeState,
} from '@cuberush/cube-core';
import { useEffect, useState } from 'react';
import { drillDone, drillHint, drillStep, startDrill, type Drill } from '../game/drill';
import { keyFor, useKeyboardTurns } from '../game/keyboard';
import { useSettings } from '../game/settings';
import { useGame } from '../game/store';
import { useTutorial } from '../game/tutorial';
import { KeyboardHelp } from './KeyboardHelp';
import { CASES, LESSONS, type CaseId, type Lesson as LessonData } from './lessons';

/** The method is taught with white on the bottom. */
const HELD = applyMoves(createSolvedCube(3), parseMoves('z2'));

function startCube(state?: CubeState) {
  useGame.getState().startGame('tutorial', { inspection: false, ...(state ? { state } : {}) });
}

/** Starts a lesson from the Learn screen. */
export function openLesson(lesson: LessonData) {
  useTutorial.getState().open(lesson.id, lesson.view);
  startCube(lesson.course === 'method' ? HELD : undefined);
}

function MoveChips({ drill }: { drill: Drill }) {
  const keyboard = useSettings((s) => s.keyboard);
  return (
    <ol className="chips" aria-label="Moves to make">
      {drill.expected.map((move, i) => (
        <li
          key={i}
          className={
            i < drill.index ? 'chip chip--done' : i === drill.index ? 'chip chip--next' : 'chip'
          }
          aria-current={i === drill.index ? 'step' : undefined}
        >
          {formatMove(move)}
          {keyboard && i === drill.index && keyFor(move) && (
            <kbd className="chip__key" title="Keyboard key">
              {keyFor(move)}
            </kbd>
          )}
        </li>
      ))}
    </ol>
  );
}

function Feedback({ drill }: { drill: Drill }) {
  const wrong = drill.wrong.at(-1);
  if (wrong) {
    return (
      <p className="lesson__feedback lesson__feedback--bad" role="status">
        That was {formatMove(wrong)}. Undo it with {formatMove(invertMove(wrong))}, or press Undo.
      </p>
    );
  }
  if (drill.half) {
    return (
      <p className="lesson__feedback" role="status">
        Halfway: turn {formatMove(drill.half)} once more.
      </p>
    );
  }
  return null;
}

function CaseDiagram({ id }: { id: CaseId }) {
  const c = CASES[id];
  return (
    <figure className="case">
      <span className="case__grid" aria-hidden>
        {c.cells.map((on, i) => (
          <span key={i} className={on ? 'case__cell case__cell--on' : 'case__cell'} />
        ))}
      </span>
      <figcaption>
        <strong>{c.name}</strong> {c.how}
      </figcaption>
    </figure>
  );
}

function AlgorithmCard({ id, onGuide }: { id: AlgorithmId; onGuide: () => void }) {
  const alg = ALGORITHMS[id];
  return (
    <div className="alg">
      <div className="alg__head">
        <strong>{alg.name}</strong>
        <code className="alg__moves">{alg.notation}</code>
      </div>
      <p className="alg__use">{alg.use}</p>
      <button className="btn btn--small" onClick={onGuide}>
        Guide me through it
      </button>
    </div>
  );
}

function LessonRunner({ lesson, stepIndex }: { lesson: LessonData; stepIndex: number }) {
  const step = lesson.steps[stepIndex]!;
  const [drill, setDrill] = useState<Drill | null>(null);
  const [practiceDone, setPracticeDone] = useState(false);
  const [round, setRound] = useState(0);
  /** Hides the explanation so the cube has room while practicing. */
  const [collapsed, setCollapsed] = useState(false);
  /** What the current hint's moves are for (solve steps). */
  const [hintText, setHintText] = useState<string | null>(null);
  const canUndo = useGame((s) => s.undoStack.length > 0);
  const solving = step.kind === 'solve';
  const reached = useGame((s): number => (solving ? stageReached(s.cube) : 0));
  const { setStep, complete, close, setHint } = useTutorial.getState();
  useKeyboardTurns();

  // Set up the cube for this step.
  useEffect(() => {
    setPracticeDone(false);
    setHintText(null);
    if (step.kind === 'practice' || step.kind === 'solve') {
      // A whole cube is a stage-1 practice cube: a full scramble held white side down.
      const stage = step.kind === 'practice' ? step.stage : 1;
      startCube(practiceCube(stage, `${Date.now()}:${round}`).state);
      setDrill(null);
    } else if (step.kind === 'moves') {
      if (step.fresh) startCube();
      setDrill(startDrill(step.moves));
    } else {
      setDrill(null);
    }
  }, [step, round]);

  // Follow every turn the player makes.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.mode !== 'tutorial' || s.log.length <= prev.log.length) return;
        const moves = s.log.slice(prev.log.length).map((entry) => parseMove(entry.m));
        setDrill((d) => d && moves.reduce(drillStep, d));
        const goal = step.kind === 'practice' ? step.stage : step.kind === 'solve' ? 7 : null;
        if (goal !== null && stageReached(s.cube) >= goal) setPracticeDone(true);
      }),
    [step],
  );

  // The arrow shows the drill's next turn.
  useEffect(() => setHint(drill && !drillDone(drill) ? drillHint(drill) : null), [drill, setHint]);
  useEffect(() => () => setHint(null), [setHint]);

  const guiding = (step.kind === 'practice' || solving) && drill !== null;
  const done =
    step.kind === 'read' ||
    (step.kind === 'moves' && drill !== null && drillDone(drill)) ||
    ((step.kind === 'practice' || solving) && practiceDone);
  const last = stepIndex === lesson.steps.length - 1;
  const course = LESSONS.filter((l) => l.course === lesson.course);
  const nextLesson = course[course.indexOf(lesson) + 1];

  useEffect(() => {
    if (done && last) complete(lesson.id);
  }, [done, last, complete, lesson.id]);

  // A finished guide clears itself so the arrow goes away.
  useEffect(() => {
    if (guiding && drill && drillDone(drill)) {
      setDrill(null);
      setHintText(null);
    }
  }, [guiding, drill]);

  const showHint = () => {
    const hint = nextHint(useGame.getState().cube);
    if (!hint) return;
    setHintText(hint.text);
    setDrill(startDrill(formatMoves(hint.moves)));
  };
  const stopGuide = () => {
    setDrill(null);
    setHintText(null);
  };

  const leave = () => {
    close();
    useGame.getState().showLearn();
  };

  return (
    <div className="hud lesson">
      <header className="hud__top">
        <button className="btn btn--ghost" onClick={leave}>
          ← Lessons
        </button>
        <div className="lesson__title">
          <strong>{lesson.title}</strong>
          <span>
            Step {stepIndex + 1} of {lesson.steps.length}
          </span>
        </div>
        <span />
      </header>

      <footer className="hud__bottom">
        <section className="lesson__card" aria-live="polite">
          <div className="lesson__head">
            <h2>{step.title}</h2>
            <button
              className="chart__toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
            >
              {collapsed ? 'Show text' : 'Hide text'}
            </button>
          </div>
          {!collapsed && step.body.map((p) => <p key={p}>{p}</p>)}

          {!collapsed && step.kind === 'practice' && step.cases && (
            <div className="cases">
              {step.cases.map((id) => (
                <CaseDiagram key={id} id={id} />
              ))}
            </div>
          )}
          {!collapsed &&
            step.kind === 'practice' &&
            !guiding &&
            step.algorithms.map((id) => (
              <AlgorithmCard
                key={id}
                id={id}
                onGuide={() => setDrill(startDrill(ALGORITHMS[id].notation))}
              />
            ))}

          {solving && !practiceDone && (
            <p className="lesson__progress" role="status">
              You’re on step {reached + 1} of 7: <strong>{STAGES[reached]}</strong>
            </p>
          )}
          {hintText && <p className="lesson__hint">{hintText}</p>}
          {drill && !drillDone(drill) && (
            <>
              <MoveChips drill={drill} />
              <Feedback drill={drill} />
            </>
          )}
          {solving && practiceDone && (
            <p className="lesson__win" role="status">
              Solved! You just did a whole Rubik’s cube.
            </p>
          )}
          {step.kind === 'practice' && practiceDone && (
            <p className="lesson__win" role="status">
              Nice! {STAGES[step.stage - 1]} done.
            </p>
          )}
          {step.kind === 'moves' && done && (
            <p className="lesson__win" role="status">
              Well done!
            </p>
          )}

          <div className="lesson__nav">
            {stepIndex > 0 && (
              <button className="btn btn--ghost" onClick={() => setStep(stepIndex - 1)}>
                Back
              </button>
            )}
            {step.kind !== 'read' && (
              <button className="btn" onClick={() => useGame.getState().undo()} disabled={!canUndo}>
                Undo
              </button>
            )}
            {step.kind !== 'read' && <KeyboardHelp />}
            {solving && !guiding && !practiceDone && (
              <button className="btn btn--highlight" onClick={showHint}>
                Hint
              </button>
            )}
            {guiding && (
              <button className="btn" onClick={stopGuide}>
                Stop guide
              </button>
            )}
            {(step.kind === 'practice' || solving) && (
              <button className="btn" onClick={() => setRound((r) => r + 1)}>
                {practiceDone ? 'Another cube' : 'New cube'}
              </button>
            )}
            {!last ? (
              <button
                className="btn btn--primary"
                disabled={!done}
                onClick={() => setStep(stepIndex + 1)}
              >
                Next
              </button>
            ) : nextLesson ? (
              <button
                className="btn btn--primary"
                disabled={!done}
                onClick={() => openLesson(nextLesson)}
              >
                Next lesson
              </button>
            ) : (
              <button className="btn btn--primary" disabled={!done} onClick={leave}>
                Finish
              </button>
            )}
          </div>
        </section>
      </footer>
    </div>
  );
}

/** Shown instead of the game HUD while a lesson is open. */
export function Lesson() {
  const lessonId = useTutorial((s) => s.lessonId);
  const step = useTutorial((s) => s.step);
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson) return null;
  return <LessonRunner key={lesson.id} lesson={lesson} stepIndex={step} />;
}
