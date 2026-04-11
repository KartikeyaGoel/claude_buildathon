import { Sparkles } from "lucide-react";
import { StreamingText } from "../streaming/StreamingText";
import { ThinkingIndicator } from "../streaming/ThinkingIndicator";
import { StageCard } from "./StageCard";

interface FramingStageProps {
  streamingText: string;
  finalText: string;
  awaitingConfirm: boolean;
  active: boolean;
}

export function FramingStage({ streamingText, finalText, awaitingConfirm, active }: FramingStageProps) {
  const display = finalText || streamingText;
  const streaming = active && !finalText;

  return (
    <StageCard
      title="Framing"
      subtitle="Decision type, stakeholders, and how we will think about this"
      badge={
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2.5 py-1 text-xs font-medium text-amber-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Stage 1
        </span>
      }
    >
      {!display && !streaming ? <ThinkingIndicator label="Preparing framing" /> : null}
      {streaming ? <StreamingText text={streamingText} active /> : null}
      {!streaming && display ? <StreamingText text={display} /> : null}
      {awaitingConfirm ? (
        <p className="mt-4 text-xs text-amber-200/90">
          Review the framing below, then confirm or request changes on this page.
        </p>
      ) : null}
    </StageCard>
  );
}
