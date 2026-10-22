import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { formatFrequency, responseAt } from './eq';
import type { Band } from './eq';

export function Graph({ bands, selected, onSelect, onChange, onCommit, disabled, gainLimit = 12 }: {
  bands: Band[]; selected: number; onSelect: (index: number) => void;
  onChange: (index: number, patch: Partial<Band>) => void; onCommit: () => void; disabled: boolean; gainLimit?: number;
}) {
  const gradient = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const W = width, H = width < 500 ? 260 : 285;
  const LEFT = width < 500 ? 36 : 43, RIGHT = 22, TOP = 26, BOTTOM = 34;
  const PW = W - LEFT - RIGHT, PH = H - TOP - BOTTOM;
  const xAt = (f: number) => LEFT + Math.log10(f / 20) / 3 * PW;
  const drag = useRef<number | null>(null);
  const response = Array.from({ length: 360 }, (_, i) => {
    const frequency = 20 * Math.pow(1000, i / 359);
    return { frequency, db: bands.reduce((sum, band) => sum + responseAt(band, frequency), 0) };
  });
  const range = Math.ceil(Math.max(20, ...response.map(point => Math.abs(point.db)), ...bands.map(band => Math.abs(band.gain))) / 10) * 10;
  const yAt = (gain: number) => TOP + (range - Math.max(-range, Math.min(range, gain))) / (range * 2) * PH;
  const points = Array.from({ length: 360 }, (_, i) => {
    const { frequency, db } = response[i];
    return `${i === 0 ? 'M' : 'L'}${xAt(frequency).toFixed(2)},${yAt(db).toFixed(2)}`;
  }).join(' ');
  const selectedCurve = Array.from({ length: 260 }, (_, i) => {
    const frequency = 20 * Math.pow(1000, i / 259);
    return `${i === 0 ? 'M' : 'L'}${xAt(frequency).toFixed(2)},${yAt(responseAt(bands[selected], frequency)).toFixed(2)}`;
  }).join(' ');
  function move(event: PointerEvent<SVGSVGElement>): void {
    if (drag.current === null || disabled) return;
    const matrix = event.currentTarget.getScreenCTM()?.inverse();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    onChange(drag.current, {
      frequency: Math.round(20 * Math.pow(1000, Math.max(0, Math.min(1, (p.x - LEFT) / PW)))),
      gain: Math.round(Math.max(-gainLimit, Math.min(gainLimit, range - (p.y - TOP) / PH * range * 2)) * 10) / 10,
    });
  }
  const end = (): void => { drag.current = null; };
  return <div className="graph-wrap" ref={container}>
    <svg className="eq-graph" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Interactive equalizer graph" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3159de" stopOpacity="0.13"/><stop offset="100%" stopColor="#3159de" stopOpacity="0.01"/></linearGradient></defs>
      {[20, 30, 40, 50, 60, 80, 100, 200, 300, 400, 500, 600, 800, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 20000].map(f => <line key={f} x1={xAt(f)} x2={xAt(f)} y1={TOP} y2={H - BOTTOM} className={[20, 100, 1000, 10000, 20000].includes(f) ? 'grid-major' : 'grid-minor'}/>)}
      {[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map(fraction => { const g = Math.round(fraction * range); return <g key={g}><line x1={LEFT} x2={W - RIGHT} y1={yAt(g)} y2={yAt(g)} className={g === 0 ? 'grid-zero' : 'grid-major'}/><text x={LEFT - 12} y={yAt(g) + 4} textAnchor="end" className="axis-label">{g > 0 ? `+${g}` : g}</text></g>; })}
      {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map(f => <text key={f} x={xAt(f)} y={H - 11} textAnchor="middle" className="axis-label">{formatFrequency(f)}</text>)}
      <path d={`${points} L${W - RIGHT},${H - BOTTOM} L${LEFT},${H - BOTTOM} Z`} fill={`url(#${gradient})`}/>
      <path d={selectedCurve} fill="none" stroke="#dd773d" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.65"/>
      <path d={points} fill="none" stroke="#3159de" strokeWidth="2.8" strokeLinejoin="round"/>
      {bands.map((band, index) => <g key={index} className={`graph-handle ${!band.enabled ? 'band-off' : ''} ${selected === index ? 'selected' : ''}`} role="slider" tabIndex={disabled ? -1 : 0}
        aria-label={`Band ${index + 1}, ${band.frequency} Hz`} aria-valuemin={Math.min(-gainLimit, band.gain)} aria-valuemax={Math.max(gainLimit, band.gain)} aria-valuenow={band.gain} aria-valuetext={`${band.gain} decibels at ${band.frequency} hertz${band.enabled ? '' : ', filter off'}`}
        onFocus={() => onSelect(index)}
        onKeyDown={event => {
          if (disabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault(); onCommit(); onSelect(index);
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') onChange(index, { gain: Math.round(Math.max(-gainLimit, Math.min(gainLimit, band.gain + (event.key === 'ArrowUp' ? 0.1 : -0.1))) * 10) / 10 });
          else onChange(index, { frequency: Math.round(Math.max(20, Math.min(20000, band.frequency * (event.key === 'ArrowRight' ? 1.03 : 1 / 1.03)))) });
        }}
        onPointerDown={event => {
          if (disabled) return;
          onCommit(); onSelect(index); drag.current = index;
          event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
          event.currentTarget.focus(); event.preventDefault();
        }}>
        <circle cx={xAt(band.frequency)} cy={yAt(band.gain)} r="18" fill="transparent"/>
        {selected === index && <circle cx={xAt(band.frequency)} cy={yAt(band.gain)} r="13" fill="#fff0e4" stroke="#e8bb9b"/>}
        <circle cx={xAt(band.frequency)} cy={yAt(band.gain)} r={selected === index ? 8 : 5} fill={selected === index ? '#dd773d' : '#fff'} stroke={selected === index ? '#dd773d' : '#3159de'} strokeWidth="2"/>
        {selected === index && <text x={xAt(band.frequency)} y={yAt(band.gain) - 22} textAnchor="middle" className="point-label">{index + 1}</text>}
      </g>)}
    </svg>
    <div className="graph-caption"><span><i className="line-swatch"/>Combined EQ <i className="line-swatch selected-line"/>Selected band</span><span>Filters only, 48 kHz</span></div>
  </div>;
}
