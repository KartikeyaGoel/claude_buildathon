import { AlertCircle, ArrowLeft, Ban, Radio, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AssumptionStage } from "../components/stages/AssumptionStage";
import { FramingStage } from "../components/stages/FramingStage";
import { SteelmanStage } from "../components/stages/SteelmanStage";
import { SynthesisStage } from "../components/stages/SynthesisStage";
import { useDecisionSession } from "../hooks/useDecisionSession";
import { useSessionStore } from "../stores/sessionStore";
import { readStoredDecisionPrompt } from "../utils/decisionPromptStorage";

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? undefined;
  const location = useLocation();

  const decisionPrompt = useMemo(() => {
    if (!sessionId) return null;
    const fromState = (location.state as { decisionText?: string } | null)?.decisionText?.trim();
    if (fromState) return fromState;
    return readStoredDecisionPrompt(sessionId)?.trim() ?? null;
  }, [sessionId, location.state]);

  const {
    stageProgress,
    connectionStatus,
    connectionError,
    framingStreaming,
    framingFinal,
    framingAwaitingConfirm,
    framingConfirmed,
    assumption,
    steelman,
    synthesis,
    pipelineComplete,
    finalResult,
    stageErrors,
    pipelineError,
  } = useSessionStore();

  const { confirm, cancel } = useDecisionSession(sessionId);
  const [feedback, setFeedback] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const framingActive =
    stageProgress === 1 &&
    !framingFinal &&
    !framingAwaitingConfirm &&
    (framingStreaming.length > 0 ||
      connectionStatus === "open" ||
      connectionStatus === "connecting" ||
      connectionStatus === "reconnecting");

  const showParallel =
    framingConfirmed ||
    assumption.active ||
    steelman.active ||
    assumption.complete ||
    steelman.complete ||
    assumption.iterations.length > 0 ||
    steelman.iterations.length > 0;

  const showSynthesis =
    synthesis.active ||
    synthesis.complete ||
    synthesis.iterations.length > 0 ||
    synthesis.streamingText.length > 0 ||
    (assumption.complete && steelman.complete && framingConfirmed);

  const pipelineRunning = !pipelineComplete && !pipelineError;

  async function handleConfirm(onlyFeedback: boolean) {
    if (!sessionId) return;
    setConfirmBusy(true);
    try {
      if (onlyFeedback) {
        const f = feedback.trim();
        if (!f) return;
        await confirm(f);
        setFeedback("");
      } else {
        await confirm();
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-stone-500 transition hover:text-stone-300"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          New decision
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-stone-800 bg-stone-900/60 px-3 py-1.5 text-xs text-stone-400"
            title={connectionStatus}
          >
            {connectionStatus === "open" || connectionStatus === "connecting" ? (
              <Radio className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            ) : connectionStatus === "reconnecting" ? (
              <Radio className="h-3.5 w-3.5 animate-pulse text-amber-500" aria-hidden />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-stone-500" aria-hidden />
            )}
            <span className="capitalize">{connectionStatus.replace(/_/g, " ")}</span>
          </div>
          <div className="rounded-full border border-stone-700 bg-stone-900/80 px-3 py-1.5 font-mono text-xs text-stone-300">
            Stage {stageProgress} / 4
          </div>
          {pipelineRunning ? (
            <button
              type="button"
              onClick={() => void cancel()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-950/70"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Cancel run
            </button>
          ) : null}
        </div>
      </div>

      {decisionPrompt ? (
        <div className="mb-6 rounded-xl border border-stone-800 bg-stone-900/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Your decision</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-100">
            <strong className="font-semibold">{decisionPrompt}</strong>
          </p>
        </div>
      ) : null}

      {connectionError ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {connectionError}
        </p>
      ) : null}

      {pipelineError ? (
        <div className="mb-6 rounded-xl border border-rose-900/50 bg-rose-950/30 p-4 text-rose-100">
          <p className="font-medium">Pipeline stopped</p>
          <p className="mt-1 text-sm text-rose-200/90">{pipelineError.error}</p>
        </div>
      ) : null}

      {stageErrors.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {stageErrors.map((se, i) => (
            <li
              key={`${se.stage}-${i}`}
              className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100"
            >
              <span className="font-medium capitalize">{se.stage}</span>: {se.error}
              {se.retryable ? <span className="text-amber-200/70"> (retryable)</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-8">
        <FramingStage
          streamingText={framingStreaming}
          finalText={framingFinal}
          awaitingConfirm={framingAwaitingConfirm}
          active={Boolean(framingActive)}
        />

        {framingAwaitingConfirm ? (
          <div className="rounded-xl border border-stone-800 bg-stone-900/50 p-4">
            <label htmlFor="feedback" className="block text-sm font-medium text-stone-300">
              Optional feedback if the framing should change
            </label>
            <textarea
              id="feedback"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. You missed that my partner is also a co-founder…"
              className="mt-2 w-full resize-y rounded-lg border border-stone-700 bg-stone-950/80 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-700/80"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => void handleConfirm(false)}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-500 disabled:opacity-50"
              >
                Confirm &amp; continue
              </button>
              <button
                type="button"
                disabled={confirmBusy || !feedback.trim()}
                onClick={() => void handleConfirm(true)}
                className="rounded-lg border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Revise framing
              </button>
            </div>
          </div>
        ) : null}

        {showParallel ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <AssumptionStage state={assumption} peerComplete={steelman.complete} />
            <SteelmanStage state={steelman} peerComplete={assumption.complete} />
          </div>
        ) : null}

        {showSynthesis ? <SynthesisStage state={synthesis} /> : null}

        {pipelineComplete && finalResult ? (
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
            <h2 className="text-lg font-semibold text-emerald-100">Session complete</h2>
            <p className="mt-2 text-sm text-emerald-200/80">
              Full structured outputs are in the stage cards above. Raw bundle:
            </p>
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-emerald-900/30 bg-stone-950/80 p-3 font-mono text-[11px] text-stone-400 whitespace-pre-wrap">
              {JSON.stringify(finalResult, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
