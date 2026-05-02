import { query } from "../../db/client.js";
import { openAiEmbeddings, toPgVector } from "../../providers/embeddings.js";
import type { AuthenticatedUser } from "./types.js";

interface Tier2HitRow {
  icr_id: string;
  similarity: number;
}

export async function detectTier2Followthrough(
  user: AuthenticatedUser,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const embedding = await openAiEmbeddings.embed(content, signal);
    if (embedding.length === 0) return;
    const vector = toPgVector(embedding);
    const hit = await query<Tier2HitRow>(
      "SELECT tw.icr_id, 1 - (aer.embedding <=> $1::vector) AS similarity FROM tier2_watches tw JOIN deliberation_traces dt ON dt.icr_id = tw.icr_id JOIN assumption_extraction_records aer ON aer.dt_id = dt.id WHERE tw.user_id = $2 AND tw.expires_at > now() AND aer.embedding IS NOT NULL ORDER BY aer.embedding <=> $1::vector LIMIT 1",
      [vector, user.id],
    );
    const row = hit.rows[0];
    if (!row || Number(row.similarity) <= 0.75) return;

    await query(
      "INSERT INTO resolution_artifacts (icr_id, user_id, decision, outcome, tier2_followthrough_prompt, tier2_followthrough, tier2_detected_at, metadata) VALUES ($1, $2, $3, $4, $5, true, now(), $6::jsonb)",
      [
        row.icr_id,
        user.id,
        "tier2_followthrough_detected",
        "followthrough_detected_from_future_interrogate",
        content,
        JSON.stringify({ similarity: Number(row.similarity) }),
      ],
    );
  } catch (error) {
    console.warn("[tier2] followthrough detection skipped", error);
  }
}
