import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession } from "../api/crucibleApi";
import { writeStoredDecisionPrompt } from "../utils/decisionPromptStorage";

export function HomePage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const decisionText = text.trim();
    if (!decisionText) {
      setError("Describe your decision first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { sessionId } = await createSession({ decisionText });
      writeStoredDecisionPrompt(sessionId, decisionText);
      navigate(`/session/${encodeURIComponent(sessionId)}`, {
        state: { decisionText },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-600/90">Crucible</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">
          Decide with structure, not vibes
        </h1>
        <p className="mt-3 text-stone-400">
          Framing, adversarial assumptions, steelman, then synthesis — streamed live as agents work.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label htmlFor="decision" className="block text-sm font-medium text-stone-300">
          What decision are you facing?
        </label>
        <textarea
          id="decision"
          name="decision"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Should I leave my role for a startup with 18 months runway…"
          className="w-full resize-y rounded-xl border border-stone-700 bg-stone-900/80 px-4 py-3 text-stone-100 placeholder:text-stone-600 outline-none ring-amber-600/0 transition focus:border-amber-700/80 focus:ring-2 focus:ring-amber-600/30"
        />
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Starting…" : "Start Crucible session"}
        </button>
      </form>
    </div>
  );
}
