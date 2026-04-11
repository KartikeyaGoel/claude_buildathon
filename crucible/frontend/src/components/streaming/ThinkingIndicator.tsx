import { motion } from "framer-motion";

export function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-stone-500 text-sm" role="status" aria-live="polite">
      <motion.div
        className="flex gap-1"
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-amber-500/70"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.12,
              ease: "easeInOut",
            }}
          />
        ))}
      </motion.div>
      <span>{label}…</span>
    </div>
  );
}
