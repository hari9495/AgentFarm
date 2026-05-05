type HealthRingTone = 'ok' | 'warn' | 'danger' | 'neutral';

type HealthRingProps = {
    value: number; // 0–100
    size?: number;
    tone?: HealthRingTone;
    label: string;
};

const RING_COLORS: Record<HealthRingTone, string> = {
    ok: '#10b981',
    warn: '#f59e0b',
    danger: '#ef4444',
    neutral: '#94a3b8',
};

const RING_TRACK: Record<HealthRingTone, string> = {
    ok: 'rgba(16,185,129,0.14)',
    warn: 'rgba(245,158,11,0.14)',
    danger: 'rgba(239,68,68,0.14)',
    neutral: 'rgba(148,163,184,0.14)',
};

export function HealthRing({ value, size = 54, tone = 'ok', label }: HealthRingProps) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const r = (size - 8) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (clamped / 100) * circ;
    const color = RING_COLORS[tone];
    const track = RING_TRACK[tone];

    return (
        <div className="health-ring-wrap" aria-label={`${label}: ${clamped}%`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeWidth="5" />
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${circ}`}
                    strokeDashoffset={`${offset}`}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: 'stroke-dashoffset 0.75s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
                <text
                    x={cx}
                    y={cy + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={size * 0.21}
                    fontWeight="800"
                    fill={color}
                    fontFamily="var(--font-space-grotesk,sans-serif)"
                >
                    {clamped}
                </text>
            </svg>
            <span className="health-ring-label">{label}</span>
        </div>
    );
}
