// Small chart kit: line (with crosshair tooltip), horizontal bars, hour-of-day strip.
// Thin marks, recessive grid, text in text colours, series colours only on marks.
import { useState } from 'preact/hooks';
import { fmtNum } from './api.js';

export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * series: [{ key, label, color, points: [{ x: number, y: number|null }] }]
 * xFmt(x) → axis/tooltip label; yFmt(y) → value label. One y-axis only.
 */
export function LineChart({ series, xFmt = String, yFmt = fmtNum, height = 200, yMax = null, ariaLabel, area = false, refLine = null, width = 720 }) {
  const [hover, setHover] = useState(null);
  const W = width, H = height, L = 46, R = 14, B = 24, T = 10;
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  if (xs.length < 2) return <p class="small muted" style={{ margin: 0 }}>Not enough data points yet.</p>;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const vmax = yMax ?? niceMax(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y || 0))));
  const sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (y) => T + (H - T - B) * (1 - Math.min(y, vmax) / vmax);
  const ticks = [0, vmax / 2, vmax];
  const xt = Array.from({ length: Math.min(6, xs.length) }, (_, i) => xs[Math.round((i * (xs.length - 1)) / Math.max(1, Math.min(6, xs.length) - 1))]);
  const path = (pts) => pts.filter((p) => p.y != null).map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(sx(xs[i]) - px) < Math.abs(sx(xs[best]) - px)) best = i;
    setHover(best);
  };
  const hx = hover != null ? xs[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}>
        <g class="grid">{ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke-width="1" />)}</g>
        <g class="axis">
          {ticks.map((t) => <text key={t} x={L - 8} y={sy(t) + 3.5} text-anchor="end">{yFmt(t)}</text>)}
          {xt.map((x, i) => <text key={i} x={sx(x)} y={H - 6} text-anchor={i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle'}>{xFmt(x)}</text>)}
        </g>
        {refLine != null && <line x1={L} x2={W - R} y1={sy(refLine.y)} y2={sy(refLine.y)} stroke="var(--text-3)" stroke-width="1" stroke-dasharray="0" opacity="0.6" />}
        {series.map((s) => (
          <g key={s.key}>
            {area && series.length === 1 && <path d={`${path(s.points)} L${sx(s.points[s.points.length - 1].x)},${sy(0)} L${sx(s.points[0].x)},${sy(0)} Z`} fill={s.color} opacity="0.1" />}
            <path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          </g>
        ))}
        {hx != null && <line x1={sx(hx)} x2={sx(hx)} y1={T} y2={H - B} stroke="var(--text-3)" stroke-width="1" />}
        {hx != null && series.map((s) => {
          const p = s.points.find((q) => q.x === hx);
          return p?.y != null ? <circle key={s.key} cx={sx(hx)} cy={sy(p.y)} r="4.5" fill={s.color} stroke="var(--surface)" stroke-width="2" /> : null;
        })}
      </svg>
      {hx != null && (
        <div class="chart-tip" style={{ left: `${(sx(hx) / W) * 100}%`, top: `${(T / H) * 100}%`, transform: 'translate(-50%, -100%)' }}>
          <b>{xFmt(hx, true)}</b>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === hx);
            return p?.y != null ? <div key={s.key} class="row" style={{ gap: 6 }}>{series.length > 1 && <span class="dot" style={{ background: s.color, width: 8, height: 8, borderRadius: 99, display: 'inline-block' }} />}{series.length > 1 ? `${s.label}: ` : ''}{yFmt(p.y)}</div> : null;
          })}
        </div>
      )}
      {series.length > 1 && (
        <div class="row wrap tiny" style={{ gap: 12, marginTop: 6 }}>
          {series.map((s) => <span key={s.key} class="row" style={{ gap: 5 }}><span style={{ width: 12, height: 2, background: s.color, display: 'inline-block', borderRadius: 2 }} />{s.label}</span>)}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars, one hue; value printed at the bar tip. rows: [{ key, label, value }] */
export function HBars({ rows, fmt = (v) => `${v}%`, color = 'var(--series-total)', max = null }) {
  if (!rows?.length) return <p class="small muted" style={{ margin: 0 }}>No data yet.</p>;
  const m = max ?? Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div class="col" style={{ gap: 6 }}>
      {rows.map((r) => (
        <div key={r.key} class="hbar2" title={`${r.label ?? r.key}: ${fmt(r.value)}`}>
          <span class="small ellipsis">{r.label ?? r.key}</span>
          <span class="track"><span class="fill" style={{ width: `${Math.max(1, ((r.value || 0) / m) * 100)}%`, background: color }} /></span>
          <span class="small num">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** 24 hour cells, one hue, darker = more followers online (hours shown in the given offset). */
export function HourStrip({ hoursUtc, tzOffsetMin = 330, label = 'followers online' }) {
  if (!hoursUtc?.length) return null;
  const local = Array.from({ length: 24 }, (_, h) => hoursUtc[((h * 60 - tzOffsetMin) / 60 % 24 + 24) % 24 | 0] || 0);
  const max = Math.max(1, ...local);
  const best = local.indexOf(max);
  return (
    <div>
      <div class="hour-strip">
        {local.map((v, h) => (
          <div key={h} class="hcell" title={`${String(h).padStart(2, '0')}:00 — ${fmtNum(v)} ${label}`} style={{ background: `color-mix(in srgb, var(--series-total) ${Math.round(12 + (v / max) * 88)}%, var(--surface))` }} />
        ))}
      </div>
      <div class="row between tiny faint" style={{ marginTop: 4 }}><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      <p class="small" style={{ margin: '6px 0 0' }}>Most {label} around <b>{String(best).padStart(2, '0')}:00</b> India time.</p>
    </div>
  );
}
