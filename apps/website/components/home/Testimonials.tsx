"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useCompactMotion } from "@/lib/useCompactMotion";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "CTO @ BuildFast",
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "Test coverage 61% to 94% in 3 weeks",
    quote:
      "We replaced a full-time QA contractor with AgentFarm's QA robot. Test coverage went from 61% to 94% in three weeks. The ROI is insane.",
  },
  {
    name: "Marcus Webb",
    role: "VP Engineering @ TechCorp",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "Feature cycle time reduced by 42%",
    quote:
      "Our AI backend dev ships boilerplate features in hours, not days. Our human engineers now focus entirely on architecture and product decisions.",
  },
  {
    name: "Priya Nair",
    role: "Founder @ ShipIt",
    image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "MVP shipped in 6 days",
    quote:
      "I'm a solo founder. AgentFarm gives me what feels like a 4-person engineering team. I shipped an MVP in 6 days that would have taken 6 weeks.",
  },
  {
    name: "James Okafor",
    role: "Engineering Manager @ DevOps Inc.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "PR acceptance improved by 35%",
    quote:
      "The GitHub integration is seamless. PRs are well-structured, commit messages are clean, and the code quality is comparable to our senior engineers.",
  },
  {
    name: "Anita Russo",
    role: "Lead Architect @ CloudNative",
    image: "https://images.unsplash.com/photo-1573496799515-eebbb63814f2?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "Team velocity doubled",
    quote:
      "We run 3 AI workers alongside our 8-person team. They handle all the grunt work, our engineers focus on hard problems. Velocity doubled.",
  },
  {
    name: "Tom Lindström",
    role: "Head of Product @ StartupX",
    image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=80",
    stars: 5,
    metric: "Saved around 2 hours/week in standups",
    quote:
      "I was skeptical. Two months later I can't imagine our workflow without it. The Slack integration alone saves us 2 hours of standups per week.",
  },
];

export default function Testimonials() {
  const compactMotion = useCompactMotion();
  const motionScale = compactMotion ? 0.8 : 1;

  return (
    <section className="bg-white dark:bg-slate-950 py-24 border-t border-slate-100 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.48 * motionScale }}
          className="max-w-2xl mx-auto text-center"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Testimonials
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
            Real Teams. Measurable Results.
          </h2>
          <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
            Concrete outcomes from founders, engineering leads, and operators using AgentFarm in production.
          </p>
        </motion.div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.article
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45 * motionScale, delay: i * 0.06 * motionScale }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
            >
              <img
                src={t.image}
                alt={t.name}
                className="w-full h-40 object-cover"
                loading="lazy"
              />
              <div className="p-5 flex flex-col h-[260px]">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">{t.metric}</p>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.role}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}


