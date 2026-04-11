import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-lg font-semibold tracking-tight text-stone-100 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold text-stone-100 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-sm font-semibold text-stone-100 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 text-stone-200">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-stone-200">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-stone-200">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-stone-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-stone-300">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-amber-400 underline decoration-amber-600/50 underline-offset-2 hover:text-amber-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-amber-600/40 pl-3 text-stone-300 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-stone-700" />,
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} font-mono text-sm`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-crucible-800 px-1.5 py-0.5 font-mono text-[0.8125rem] text-amber-100/90"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-stone-700 bg-crucible-900 p-3 font-mono text-sm text-stone-200">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm text-stone-200">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-stone-600">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold text-stone-100">{children}</th>,
  td: ({ children }) => <td className="border-b border-stone-800 px-3 py-2 align-top">{children}</td>,
};

interface StreamingTextProps {
  text: string;
  className?: string;
  /** When true, show a soft pulse at the end (active stream). */
  active?: boolean;
}

export function StreamingText({ text, className = "", active }: StreamingTextProps) {
  if (!text && !active) return null;

  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      {text ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      ) : null}
      {active ? (
        <span
          className="crucible-stream-caret inline-block h-3 w-1.5 translate-y-0.5 rounded-sm bg-amber-500/80 align-middle ml-0.5"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
