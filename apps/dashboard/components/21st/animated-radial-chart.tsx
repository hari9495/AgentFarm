// 21st.dev component — isaiahbjork/animated-radial-chart (petrol-recolored)
'use client';

import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { useEffect } from 'react';
import { cn } from '@/app/lib/utils';

interface AnimatedRadialChartProps {
    value?: number;
    size?: number;
    strokeWidth?: number;
    className?: string;
    showLabels?: boolean;
    duration?: number;
}

export function AnimatedRadialChart({
    value = 74,
    size = 300,
    strokeWidth: customStrokeWidth,
    className,
    showLabels = true,
    duration = 2,
}: AnimatedRadialChartProps) {
    const strokeWidth = customStrokeWidth ?? Math.max(12, size * 0.06);
    const radius = size * 0.35;
    const center = size / 2;
    const circumference = Math.PI * radius;
    const innerLineRadius = radius - strokeWidth - 4;

    const animatedValue = useMotionValue(0);
    const offset = useTransform(animatedValue, [0, 100], [circumference, 0]);
    const progressAngle = useTransform(animatedValue, [0, 100], [-Math.PI, 0]);
    const innerRadius = radius - strokeWidth / 2;

    useEffect(() => {
        const controls = animate(animatedValue, value, { duration, ease: 'easeOut' });
        return controls.stop;
    }, [value, animatedValue, duration]);

    const fontSize = Math.max(16, size * 0.1);
    const labelFontSize = Math.max(12, size * 0.04);
    const lineX1 = useTransform(progressAngle, (angle) => center + Math.cos(angle) * innerRadius);
    const lineY1 = useTransform(progressAngle, (angle) => center + Math.sin(angle) * innerRadius);
    const lineX2 = useTransform(progressAngle, (angle) => center + Math.cos(angle) * innerRadius - Math.cos(angle) * 30);
    const lineY2 = useTransform(progressAngle, (angle) => center + Math.sin(angle) * innerRadius - Math.sin(angle) * 30);
    const rounded = useTransform(animatedValue, (latest) => Math.round(latest));

    return (
        <div className={cn('relative', className)} style={{ width: size, height: size * 0.7 }}>
            <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`} className="overflow-visible">
                <defs>
                    <linearGradient id={`baseGradient-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
                        <stop offset="50%" stopColor="#d1d5db" stopOpacity="0.10" />
                        <stop offset="100%" stopColor="#6b7280" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id={`progressGradient-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#5EE6D0" />
                        <stop offset="50%" stopColor="#37A0A0" />
                        <stop offset="100%" stopColor="#1C6E6E" />
                    </linearGradient>
                    <filter id={`dropshadow-${size}`} x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#37A0A0" floodOpacity="0.45" />
                    </filter>
                </defs>

                <path d={`M ${center - innerLineRadius} ${center} A ${innerLineRadius} ${innerLineRadius} 0 0 1 ${center + innerLineRadius} ${center}`} fill="none" stroke="#6b7280" strokeWidth="1" strokeLinecap="butt" opacity="0.35" />
                <path d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`} fill="none" stroke={`url(#baseGradient-${size})`} strokeWidth={strokeWidth} strokeLinecap="round" />
                <motion.path d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`} fill="none" stroke={`url(#progressGradient-${size})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} filter={`url(#dropshadow-${size})`} />
                <motion.line x1={lineX1} y1={lineY1} x2={lineX2} y2={lineY2} stroke="#5EE6D0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
                <motion.div className="font-bold tracking-tight mt-10" style={{ fontSize: `${fontSize}px` }} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: duration * 0.75 }}>
                    <span style={{ background: 'linear-gradient(to right, #ECEAEC, #7A8A8A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        <motion.span>{rounded}</motion.span>%
                    </span>
                </motion.div>
            </div>

            {showLabels && (
                <>
                    <motion.div className="absolute text-neutral-500 font-medium" style={{ fontSize: `${labelFontSize}px`, left: center - radius - 5, top: center + strokeWidth / 2 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: duration * 0.25 }}>0%</motion.div>
                    <motion.div className="absolute text-neutral-500 font-medium" style={{ fontSize: `${labelFontSize}px`, left: center + radius - 20, top: center + strokeWidth / 2 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: duration * 0.25 }}>100%</motion.div>
                </>
            )}
        </div>
    );
}

export default AnimatedRadialChart;
