import { useState } from 'react';

export const PremiumLineChart = ({
  data = [],
  yField,
  labelField = 'startTime',
  title = 'Performance History',
  stroke = 'var(--accent-purple)',
  suffix = ''
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="glass-panel clinical-card" style={{ height: 300, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No telemetry sessions recorded yet.</p>
      </div>
    );
  }

  const chartData = data.map((item, idx) => {
    const val = typeof item[yField] === 'number' ? item[yField] : 0;
    const label = item[labelField]
      ? new Date(item[labelField]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : `Run ${idx + 1}`;
    return { val, label };
  }).reverse();

  const width = 600;
  const height = 300;
  const paddingX = 50;
  const paddingY = 40;
  const vals = chartData.map(d => d.val);
  const maxVal = Math.max(...vals, 10);
  const minVal = Math.min(...vals, 0);
  const valRange = maxVal - minVal || 1;

  const points = chartData.map((d, index) => {
    const x = paddingX + (index / Math.max(1, chartData.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((d.val - minVal) / valRange) * (height - 2 * paddingY);
    return { x, y, val: d.val, label: d.label };
  });

  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = points.length
    ? `${points[0].x},${height - paddingY} ${points.map(p => `${p.x},${p.y}`).join(' ')} ${points[points.length - 1].x},${height - paddingY}`
    : '';

  const gridLines = Array.from({ length: 4 }).map((_, i) => {
    const ratio = i / 3;
    const val = Math.round(minVal + ratio * valRange);
    const y = height - paddingY - ratio * (height - 2 * paddingY);
    return { y, val };
  });

  return (
    <div className="glass-panel clinical-card animate-fade-in" style={{ position: 'relative' }}>
      <h3 style={{ fontSize: '1.08rem', marginBottom: 18, fontFamily: 'var(--font-display)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{title}</span>
        <span style={{ fontSize: '0.85rem', color: stroke, whiteSpace: 'nowrap' }}>Peak: {maxVal}{suffix}</span>
      </h3>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={`grad-${yField}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line x1={paddingX} y1={line.y} x2={width - paddingX} y2={line.y} stroke="var(--border-color)" strokeWidth="1" strokeDasharray="4" />
              <text x={paddingX - 10} y={line.y + 4} fill="var(--text-muted)" fontSize="11" textAnchor="end" fontFamily="var(--font-mono)">
                {line.val}{suffix}
              </text>
            </g>
          ))}

          {areaPath && <polygon points={areaPath} fill={`url(#grad-${yField})`} />}
          {linePath && <polyline fill="none" stroke={stroke} strokeWidth="3" points={linePath} style={{ filter: `drop-shadow(0 8px 12px ${stroke}33)` }} />}

          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredPoint === idx ? 7 : 4}
                fill="var(--bg-secondary)"
                stroke={stroke}
                strokeWidth="2.5"
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              <circle cx={p.x} cy={p.y} r="18" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredPoint(idx)} onMouseLeave={() => setHoveredPoint(null)} />
              <text x={p.x} y={height - 12} fill="var(--text-muted)" fontSize="11" textAnchor="middle">{p.label}</text>
            </g>
          ))}
        </svg>

        {hoveredPoint !== null && (
          <div style={{
            position: 'absolute',
            left: `${(points[hoveredPoint].x / width) * 100}%`,
            top: `${(points[hoveredPoint].y / height) * 100 - 45}%`,
            transform: 'translateX(-50%)',
            background: 'var(--bg-secondary)',
            border: `1px solid ${stroke}`,
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-glow)',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{points[hoveredPoint].label}:</span>{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{points[hoveredPoint].val}{suffix}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
