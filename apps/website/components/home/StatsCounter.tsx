"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    const duration = 1800;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * to));
      if (progress < 1) requestAnimationFrame(tick);
      else setCount(to);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

const stats = [
  { label: "Tasks Completed", value: 12480, suffix: "+" },
  { label: "Pull Requests Merged", value: 3210, suffix: "+" },
  { label: "Avg. Test Coverage", value: 94, suffix: "%" },
  { label: "Engineer Hours Saved", value: 2300, suffix: "h+" },
];

export default function StatsCounter() {
  return (
    <section className="bg-blue-600 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center text-white">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <p className="text-4xl sm:text-5xl font-extrabold">
                <Counter to={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-blue-100 text-sm font-medium">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

