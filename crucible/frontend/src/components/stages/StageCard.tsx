import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface StageCardProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StageCard({ title, subtitle, badge, children, className = "" }: StageCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-xl border border-stone-800 bg-stone-900/40 shadow-lg shadow-black/20 backdrop-blur-sm ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-800/80 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-stone-100">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </header>
      <div className="px-4 py-4">{children}</div>
    </motion.article>
  );
}
