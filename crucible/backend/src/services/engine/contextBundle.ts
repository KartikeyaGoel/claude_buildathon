import { query } from "../../db/client.js";
import type { ContextBundle } from "./types.js";

const EMPTY_BUNDLE: ContextBundle = {
  position_commitments: [],
  recurring_assumptions: [],
  prior_session_summaries: [],
};

export function formatContextBundleForPrompt(bundle: ContextBundle): string {
  const sections: string[] = [];

  if (bundle.position_commitments.length > 0) {
    sections.push(
      "## Recent position shifts (initial → final)",
      ...bundle.position_commitments.map(
        (row, i) =>
          `${i + 1}. (${row.created_at}) ${row.initial_position.slice(0, 200)} → ${row.final_position.slice(0, 200)}`,
      ),
    );
  }

  if (bundle.recurring_assumptions.length > 0) {
    sections.push(
      "## Recurring canonical assumptions",
      ...bundle.recurring_assumptions.map(
        (row, i) =>
          `${i + 1}. [${row.times_flagged}x] ${(row.text || "unknown").slice(0, 300)}`,
      ),
    );
  }

  if (bundle.prior_session_summaries.length > 0) {
    sections.push(
      "## Prior interrogation summaries",
      ...bundle.prior_session_summaries.map(
        (row, i) => `${i + 1}. [${row.domain}] ${row.summary.slice(0, 400)}`,
      ),
    );
  }

  if (sections.length === 0) {
    return "";
  }

  return ["# Cognitive context bundle", "", ...sections].join("\n");
}

export async function loadContextBundle(userId: string, limit = 5): Promise<ContextBundle> {
  try {
    const [commitments, recurring, sessions] = await Promise.all([
      query<{
        initial_position: string;
        final_position: string;
        created_at: Date;
      }>(
        `SELECT initial_position, final_position, created_at
         FROM cognitive_position_commitments
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      ),
      query<{
        assumption_text: string | null;
        times_flagged: number;
        canonical_id: string | null;
      }>(
        `SELECT COALESCE(ca.representative_text, MAX(aer.raw_text)) AS assumption_text,
                COUNT(*)::int AS times_flagged,
                aer.canonical_id
         FROM assumption_extraction_records aer
         LEFT JOIN canonical_assumptions ca ON ca.id = aer.canonical_id
         WHERE aer.user_id = $1
         GROUP BY aer.canonical_id, ca.representative_text
         HAVING COUNT(*) >= 2
         ORDER BY times_flagged DESC
         LIMIT $2`,
        [userId, limit],
      ),
      query<{
        trace_id: string;
        domain_tag: string;
        gate_reason: string | null;
        synthesis_snippet: string | null;
        created_at: Date;
      }>(
        `SELECT icr.trace_id,
                icr.domain_tag,
                icr.gate_reason,
                LEFT(COALESCE(ra.metadata->>'synthesis_preview', ''), 300) AS synthesis_snippet,
                icr.created_at
         FROM interrogation_context_records icr
         LEFT JOIN resolution_artifacts ra ON ra.icr_id = icr.id
         WHERE icr.user_id = $1
         ORDER BY icr.created_at DESC
         LIMIT $2`,
        [userId, limit],
      ),
    ]);

    return {
      position_commitments: commitments.rows.map((row) => ({
        initial_position: row.initial_position,
        final_position: row.final_position,
        created_at: row.created_at.toISOString(),
      })),
      recurring_assumptions: recurring.rows.map((row) => ({
        text: row.assumption_text ?? "",
        times_flagged: row.times_flagged,
        canonical_id: row.canonical_id,
      })),
      prior_session_summaries: sessions.rows.map((row) => ({
        trace_id: row.trace_id,
        domain: row.domain_tag,
        summary: [row.gate_reason, row.synthesis_snippet].filter(Boolean).join(" | ") || "Prior session",
        created_at: row.created_at.toISOString(),
      })),
    };
  } catch (error) {
    console.warn("[contextBundle] load failed; using empty bundle", error);
    return { ...EMPTY_BUNDLE };
  }
}
