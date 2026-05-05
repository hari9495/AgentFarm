type MetricSparklineProps = {
    data: number[];
    tone?: 'brand' | 'sky' | 'emerald' | 'amber' | 'violet';
};

const STROKE_COLORS: Record<string, string> = {
    brand: '#6366f1',
    sky: '#0ea5e9',
    emerald: '#10b981',
    amber: '#f59e0b',
    violet: '#8b5cf6',
};

const FILL_STOPS: Record<string, [string, string]> = {
    brand: ['rgba(99,102,241,0.42)', 'rgba(99,102,241,0.03)'],
    sky: ['rgba(14,165,233,0.42)', 'rgba(14,165,233,0.03)'],
    emerald: ['rgba(16,185,129,0.42)', 'rgba(16,185,129,0.03)'],
    amber: ['rgba(245,158,11,0.42)', 'rgba(245,158,11,0.03)'],
    violet: ['rgba(139,92,246,0.42)', 'rgba(139,92,246,0.03)'],
};

export function MetricSparkline({ data, tone = 'brand' }: MetricSparklineProps) {
    if (data.length < 2) return null;

    const W = 88;
    const H = 30;
    const PAD = 3;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = (W - PAD * 2) / (data.length - 1);

    const pts = data.map((v, i) => ({
        x: PAD + step * i,
        y: H - PAD - ((v - min) / range) * (H - PAD * 2),
    }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaPath = `M ${pts[0].x.toFixed(2)} ${H - PAD} ${pts.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')} L ${pts[pts.length - 1].x.toFixed(2)} ${H - PAD} Z`;

    const stroke = STROKE_COLORS[tone] ?? STROKE_COLORS.brand;
    const [gradTop, gradBottom] = FILL_STOPS[tone] ?? FILL_STOPS.brand;
    const last = pts[pts.length - 1];
    const gradId = `sl-${tone}`;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="metric-sparkline-svg"
            aria-hidden
        >
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={gradTop} />
                    <stop offset="100%" stopColor={gradBottom} />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={last.x} cy={last.y} r="2.5" fill={stroke} />
        </svg>
    );
}
