'use client';
import { useId, useState } from 'react';
import type { ForecastAsset } from './types';
import styles from './styles.module.css';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 2 ? 5 : 2 }).format(value);
export default function Chart({ asset, windowDays, holdout }: { asset: ForecastAsset; windowDays: number; holdout: boolean }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const history = asset.history.slice(-windowDays);
  const predicted = asset.forecast;
  const width = 960, height = 320, pad = { left: 92, right: 20, top: 30, bottom: 40 };
  const evaluation = asset.evaluation.observations;
  const values = holdout ? evaluation.flatMap(p => [p.actual, p.predicted, p.baseline]) : [...history.map(p => p.price), ...predicted.flatMap(p => [p.lower, p.upper])];
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(max - min, max * 0.0001, 0.000001);
  const low = Math.max(0, min - span * 0.12), high = max + span * 0.12;
  const count = holdout ? evaluation.length : history.length + predicted.length;
  const x = (i: number) => pad.left + i / Math.max(1, count - 1) * (width - pad.left - pad.right);
  const y = (value: number) => height - pad.bottom - (value - low) / (high - low) * (height - pad.top - pad.bottom);
  const path = (points: { i: number; v: number }[]) => points.map(({ i, v }, j) => `${j === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const actual = holdout ? evaluation.map((p, i) => ({ i, v: p.actual })) : history.map((p, i) => ({ i, v: p.price }));
  const forecast = holdout ? evaluation.map((p, i) => ({ i, v: p.predicted })) : [{ i: history.length - 1, v: history.at(-1)!.price }, ...predicted.map((p, i) => ({ i: history.length + i, v: p.price }))];
  const band = holdout ? '' : path(predicted.map((p, i) => ({ i: history.length + i, v: p.upper }))) + ' ' + predicted.map((p, i) => ({ i: history.length + i, v: p.lower })).reverse().map(p => `L${x(p.i)},${y(p.v)}`).join(' ') + ' Z';
  const tooltip = hover === null ? null : holdout ? { date: evaluation[hover].date, text: `Actual ${money(evaluation[hover].actual)} · AutoTS ${money(evaluation[hover].predicted)}` } : hover < history.length ? { date: history[hover].date, text: `Close ${money(history[hover].price)}` } : { date: predicted[hover - history.length].date, text: `Forecast ${money(predicted[hover - history.length].price)} · Range ${money(predicted[hover - history.length].lower)}–${money(predicted[hover - history.length].upper)}` };
  const labels = holdout ? evaluation.map(p => p.date) : [...history.map(p => p.date), ...predicted.map(p => p.date)];
  return <div className={styles.chartWrap}>
    <div className={styles.chartReadout} aria-live="polite">{tooltip ? <><span>{tooltip.date} UTC</span><strong>{tooltip.text}</strong></> : <><span>{holdout ? 'Untouched 10-day holdout' : `${windowDays} days of history + 10 daily-close forecasts`}</span><strong>Hover or tap the chart to inspect</strong></>}</div>
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`} onPointerLeave={() => setHover(null)} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const position = (event.clientX - rect.left) / rect.width * width; setHover(Math.max(0, Math.min(count - 1, Math.round((position - pad.left) / (width - pad.left - pad.right) * (count - 1))))); }}>
      <title id={`${id}-title`}>{asset.name}: {holdout ? 'holdout evaluation' : 'price history and ten-day forecast'}</title><desc id={`${id}-desc`}>{holdout ? 'Observed prices compared with AutoTS predictions and an unchanged-price baseline.' : 'White shows completed daily closes, mint shows AutoTS forecasts, and the shaded band is the nominal 90 percent prediction interval. Daily values are available below.'}</desc>
      <defs><linearGradient id={`${id}-band`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6ee7b7" stopOpacity=".22" /><stop offset="100%" stopColor="#6ee7b7" stopOpacity=".03" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(i => { const value = low + (high - low) * i / 4; return <g key={i}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="#ffffff12" /><text x={pad.left - 12} y={y(value) + 4} textAnchor="end" fill="#929b98" fontSize="11">{money(value)}</text></g>; })}
      {!holdout && <><path d={band} fill={`url(#${id}-band)`} /><line x1={x(history.length - 1)} x2={x(history.length - 1)} y1={pad.top} y2={height - pad.bottom} stroke="#6ee7b750" strokeDasharray="4 5" /><text x={x(history.length - 1) - 8} y={20} textAnchor="end" fill="#6ee7b7" fontSize="10">FORECAST →</text></>}
      <path d={path(actual)} stroke="#e5e7eb" strokeWidth="2.2" fill="none" /><path d={path(forecast)} stroke="#6ee7b7" strokeWidth="2.5" strokeDasharray="5 4" fill="none" />
      {holdout && <path d={path(evaluation.map((p, i) => ({ i, v: p.baseline })))} stroke="#b497ff" strokeWidth="1.8" strokeDasharray="3 5" fill="none" />}
      {[0, Math.floor((count - 1) / 2), count - 1].map(i => <text key={i} x={x(i)} y={height - 10} textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'} fill="#929b98" fontSize="11">{labels[i]}</text>)}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} stroke="#ffffff50" strokeDasharray="2 4" />}
    </svg>
    <div className={styles.legend}><span><i />{holdout ? 'Actual close' : 'Historical close'}</span><span><i className={styles.mintDot} />AutoTS forecast</span><span><i className={holdout ? styles.purpleDot : styles.bandDot} />{holdout ? 'Unchanged-price baseline' : '90% model interval'}</span></div>
  </div>;
}
