import React, { useState } from 'react';

/**
 * Renders a premium, animated SVG Line Chart
 * @param {Array} data - Array of objects (e.g. therapy session items)
 * @param {string} yField - The property to plot on the Y axis
 * @param {string} labelField - The property to label on the X axis
 * @param {string} title - Chart title
 * @param {string} stroke - Accent stroke color (e.g. hex/var)
 * @param {string} fillGrad - Accent gradient color stop
 * @param {string} suffix - Suffix for Y-value tooltip (e.g. '%', '°')
 */
export const PremiumLineChart = ({
  data = [],
  yField,
  labelField = 'startTime',
  title = 'Performance History',
  stroke = 'var(--accent-purple)',
  fillGrad = 'rgba(170, 59, 255, 0.2)',
  suffix = ''
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 glass-panel" style={{ height: '300px' }}>
        <p>No telemetry sessions recorded yet.</p>
      </div>
    );
  }

  // Format dates for display
  const chartData = data.map((item, idx) => {
    const rawVal = item[yField];
    const val = typeof rawVal === 'number' ? rawVal : 0;
    let label = '';
    if (item[labelField]) {
      const d = new Date(item[labelField]);
      label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      label = `Run ${idx + 1}`;
    }
    return { val, label, original: item };
  }).reverse(); // sort chronological (oldest to newest)

  const width = 600;
  const height = 300;
  const paddingX = 50;
  const paddingY = 40;

  const vals = chartData.map(d => d.val);
  const maxVal = Math.max(...vals, 10);
  const minVal = Math.min(...vals, 0);
  const valRange = maxVal - minVal;

  const points = chartData.map((d, index) => {
    const x = paddingX + (index / Math.max(1, chartData.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((d.val - minVal) / valRange) * (height - 2 * paddingY);
    return { x, y, val: d.val, label: d.label };
  });

  // Construct SVG Polyline path
  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');

  // Construct SVG Area/Fill path (going down to baseline)
  const areaPath = points.length > 0
    ? `${points[0].x},${height - paddingY} ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${points[points.length - 1].x},${height - paddingY}`
    : '';

  // Grid line levels
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount }).map((_, i) => {
    const ratio = i / (gridCount - 1);
    const val = Math.round(minVal + ratio * valRange);
    const y = height - paddingY - ratio * (height - 2 * paddingY);
    return { y, val };
  });

  return (
    <div className="glass-panel p-6 animate-fade-in text-left" style={{ border: '1px solid rgba(255, 255, 255, 0.08)', position: 'relative' }}>
      <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', fontFamily: 'var(--font-display)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>
        <span style={{ fontSize: '0.85rem', color: stroke, textShadow: `0 0 8px ${stroke}44` }}>
          Peak: {maxVal}{suffix}
        </span>
      </h3>

      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id={`grad-${yField}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line 
                x1={paddingX} 
                y1={line.y} 
                x2={width - paddingX} 
                y2={line.y} 
                stroke="rgba(255, 255, 255, 0.04)" 
                strokeWidth="1" 
                strokeDasharray="4"
              />
              <text 
                x={paddingX - 10} 
                y={line.y + 4} 
                fill="var(--text-muted)" 
                fontSize="11" 
                textAnchor="end"
                fontFamily="var(--font-mono)"
              >
                {line.val}{suffix}
              </text>
            </g>
          ))}

          {/* Gradient Area Fill */}
          {areaPath && (
            <polygon 
              points={areaPath} 
              fill={`url(#grad-${yField})`} 
              style={{ transition: 'all 0.5s ease' }}
            />
          )}

          {/* Connecting Line */}
          {linePath && (
            <polyline 
              fill="none" 
              stroke={stroke} 
              strokeWidth="3" 
              points={linePath} 
              style={{ 
                strokeDasharray: '1000', 
                strokeDashoffset: '0', 
                transition: 'all 0.5s ease',
                filter: `drop-shadow(0px 4px 8px ${stroke}66)`
              }}
            />
          )}

          {/* Interactive Hover Area & Circles */}
          {points.map((p, idx) => (
            <g key={idx}>
              {/* Core joint circle */}
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={hoveredPoint === idx ? 7 : 4} 
                fill="#fff" 
                stroke={stroke} 
                strokeWidth="2.5" 
                style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              
              {/* Invisible larger hover target */}
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="18" 
                fill="transparent" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
              />

              {/* Date label */}
              <text 
                x={p.x} 
                y={height - 12} 
                fill="var(--text-muted)" 
                fontSize="11" 
                textAnchor="middle"
                style={{ transform: `rotate(0deg)` }}
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Tooltip Popup */}
        {hoveredPoint !== null && (
          <div style={{
            position: 'absolute',
            left: `${(points[hoveredPoint].x / width) * 100}%`,
            top: `${(points[hoveredPoint].y / height) * 100 - 45}%`,
            transform: 'translateX(-50%)',
            background: 'var(--bg-secondary)',
            border: `1px solid ${stroke}`,
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            boxShadow: `0 4px 15px rgba(0,0,0,0.5), 0 0 10px ${stroke}33`,
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{points[hoveredPoint].label}:</span>{' '}
            <strong style={{ color: '#fff' }}>{points[hoveredPoint].val}{suffix}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
