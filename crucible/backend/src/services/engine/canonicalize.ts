import { query } from "../../db/client.js";
import { openAiEmbeddings, toPgVector } from "../../providers/embeddings.js";
import { sha256Hex } from "../../utils/crypto.js";
import type { ScoredAssumption } from "./types.js";

interface CanonicalRow {
  id: string;
  similarity: number;
}

function canonicalIdFor(assumption: ScoredAssumption): string {
  const domain = assumption.domain.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "general";
  const type = assumption.type.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
  return `${domain}_${type}_${sha256Hex(assumption.text).slice(0, 6)}`;
}

export async function canonicalizeAssumption(
  assumption: ScoredAssumption,
  signal?: AbortSignal,
): Promise<{ canonicalId: string | null; embedding: string | null }> {
  const embedding = await openAiEmbeddings.embed(assumption.text, signal);
  if (embedding.length === 0) return { canonicalId: null, embedding: null };

  const vector = toPgVector(embedding);
  const nearest = await query<CanonicalRow>(
    "SELECT id, 1 - (centroid_embedding <=> $1::vector) AS similarity FROM canonical_assumptions WHERE centroid_embedding IS NOT NULL ORDER BY centroid_embedding <=> $1::vector LIMIT 1",
    [vector],
  );

  const match = nearest.rows[0];
  if (match && Number(match.similarity) >= 0.85) {
    await query("UPDATE canonical_assumptions SET occurrence_count = occurrence_count + 1, updated_at = now() WHERE id = $1", [
      match.id,
    ]);
    return { canonicalId: match.id, embedding: vector };
  }

  const id = canonicalIdFor(assumption);
  await query(
    "INSERT INTO canonical_assumptions (id, domain, assumption_type, representative_text, centroid_embedding) VALUES ($1, $2, $3, $4, $5::vector) ON CONFLICT (id) DO UPDATE SET occurrence_count = canonical_assumptions.occurrence_count + 1, updated_at = now()",
    [id, assumption.domain, assumption.type, assumption.text, vector],
  );
  return { canonicalId: id, embedding: vector };
}
