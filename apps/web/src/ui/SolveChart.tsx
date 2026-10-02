import { rollingAverages } from '@cuberush/cube-core';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { formatTime } from '../game/time';

interface SolvePoint {
  timeMs: number;
  moveCount: number;
}

const HEIGHT = 220;
const PAD = { top: 12, right: 72, bottom: 26, left: 44 };

/** Round tick values that cover [min, max] in about four steps. */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Solve times as dots with the rolling average of 5 as a line, oldest on the left. */
export function SolveChart({ solves }: { solves: readonly SolvePoint[] }) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const seconds = useMemo(() => solves.map((s) => s.timeMs / 1000), [solves]);
  const ao5 = useMemo(() => rollingAverages(seconds, 5), [seconds]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.min(...seconds), Math.max(...seconds));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const x = (i: number) =>
    PAD.left + (seconds.length < 2 ? plotW / 2 : (i / (seconds.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const linePoints = ao5
    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
    .filter((p): p is string => p !== null)
    .join(' ');
  const lastAo5 = ao5.at(-1);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(fraction * (seconds.length - 1)));
  };

  const hovered = hover === null ? null : { i: hover, time: seconds[hover]!, avg: ao5[hover] };

  return (
    <figure className="chart">
      <div className="chart__head">
        <div className="chart__legend" aria-hidden>
          <span className="chart__key">
            <svg width="12" height="12">
              <circle cx="6" cy="6" r="4" className="chart__dot" />
            </svg>
            Solve time
          </span>
          {linePoints && (
            <span className="chart__key">
              <svg width="18" height="12">
                <line x1="1" y1="6" x2="17" y2="6" className="chart__line" />
              </svg>
              Average of 5
            </span>
          )}
        </div>
        <button className="chart__toggle" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {asTable ? (
        <div className="chart__table">
          <table className="board">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col" className="num">
                  Moves
                </th>
                <th scope="col" className="num">
                  Ao5
                </th>
              </tr>
            </thead>
            <tbody>
              {solves.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="num">{formatTime(s.timeMs)}</td>
                  <td className="num">{s.moveCount}</td>
                  <td className="num">{ao5[i] == null ? '—' : formatTime(ao5[i]! * 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="chart__plot">
          {width > 0 && (
            <svg width={width} height={HEIGHT} role="img" aria-label="Solve times over time">
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={y(t)}
                    y2={y(t)}
                    className="chart__grid"
                  />
                  <text
                    x={PAD.left - 8}
                    y={y(t)}
                    className="chart__tick"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {t}s
                  </text>
                </g>
              ))}
              <text x={PAD.left} y={HEIGHT - 6} className="chart__tick">
                Older
              </text>
              <text x={PAD.left + plotW} y={HEIGHT - 6} className="chart__tick" textAnchor="end">
                Latest
              </text>

              {hovered && (
                <line
                  x1={x(hovered.i)}
                  x2={x(hovered.i)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  className="chart__cross"
                />
              )}
              {linePoints && <polyline points={linePoints} className="chart__line" />}
              {seconds.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={hovered?.i === i ? 5.5 : 4}
                  className="chart__dot"
                />
              ))}
              {lastAo5 != null && (
                <text
                  x={x(seconds.length - 1) + 10}
                  y={y(lastAo5)}
                  className="chart__label"
                  dominantBaseline="middle"
                >
                  Ao5 {formatTime(lastAo5 * 1000)}
                </text>
              )}

              <rect
                x={PAD.left - 6}
                y={PAD.top}
                width={plotW + 12}
                height={plotH}
                fill="transparent"
                onPointerMove={onMove}
                onPointerLeave={() => setHover(null)}
              />
            </svg>
          )}
          {hovered && (
            <div
              className="chart__tip"
              style={{
                left: Math.min(x(hovered.i), width - 150),
                top: Math.max(0, y(hovered.time) - 64),
              }}
            >
              <strong>Solve {hovered.i + 1}</strong>
              <span>{formatTime(hovered.time * 1000)} s</span>
              {hovered.avg != null && <span>Ao5 {formatTime(hovered.avg * 1000)}</span>}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
