import { motion } from "framer-motion";

interface StreamingTextProps {
  text: string;
  className?: string;
  /** When true, show a soft pulse at the end (active stream). */
  active?: boolean;
}

export function StreamingText({ text, className = "", active }: StreamingTextProps) {
  return (
    <div className={`whitespace-pre-wrap text-sm leading-relaxed text-stone-200 ${className}`}>
      {text}
      {active ? (
        <motion.span
          className="inline-block h-3 w-1.5 translate-y-0.5 rounded-sm bg-amber-500/80 align-middle ml-0.5"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
