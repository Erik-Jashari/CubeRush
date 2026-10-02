import { useGame } from '../game/store';
import { useTutorial } from '../game/tutorial';
import { leaveRound } from '../net/session';
import { openLesson } from './Lesson';
import { COURSES, lessonsOf } from './lessons';

/** The two courses and their lessons, with progress saved in this browser. */
export function Learn() {
  const goHome = useGame((s) => s.goHome);
  const done = useTutorial((s) => s.done);

  return (
    <main className="home">
      <div className="home__panel board-panel learn-panel">
        <div className="board-panel__head">
          <button className="btn btn--ghost" onClick={goHome}>
            ← Home
          </button>
          <h2>Learn to solve</h2>
        </div>
        <div className="board-panel__body">
          {COURSES.map((course) => {
            const lessons = lessonsOf(course.id);
            const finished = lessons.filter((l) => done.includes(l.id)).length;
            return (
              <section key={course.id} className="course">
                <h3 className="course__title">
                  {course.title}
                  <span className="board__caption">
                    {finished} of {lessons.length} done
                  </span>
                </h3>
                <p className="board__caption">{course.blurb}</p>
                <ol className="lessons">
                  {lessons.map((lesson) => {
                    const complete = done.includes(lesson.id);
                    return (
                      <li key={lesson.id}>
                        <button
                          className={`lesson-row${complete ? ' lesson-row--done' : ''}`}
                          onClick={() => {
                            leaveRound();
                            openLesson(lesson);
                          }}
                        >
                          <span className="lesson-row__mark" aria-hidden>
                            {complete ? '✓' : '○'}
                          </span>
                          <span className="lesson-row__text">
                            <strong>{lesson.title}</strong>
                            <span>{lesson.summary}</span>
                          </span>
                          <span className="lesson-row__go">{complete ? 'Review' : 'Start'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
