/**
 * Export Cognitive Gym training pairs for model calibration.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/scripts/exportTrainingData.ts [--limit=500] [--out=export.jsonl]
 */
import { writeFileSync } from "node:fs";
import { query } from "../db/client.js";

interface Row {
  trace_id: string;
  user_id: string;
  initial_position: string;
  final_position: string | null;
  user_judgment: string | null;
  session_status: string;
  synthesis_snapshot: Record<string, unknown> | null;
  deliberation_snapshot: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const limit = Math.min(Number(limitArg?.split("=")[1] ?? 500), 10_000);
  const outPath = outArg?.split("=")[1] ?? "crucible-training-export.jsonl";

  const result = await query<Row>(
    `SELECT
       s.trace_id,
       s.user_id,
       s.user_position AS initial_position,
       s.final_position,
       s.user_judgment,
       s.status AS session_status,
       s.synthesis_snapshot,
       s.deliberation_snapshot,
       s.created_at,
       CASE WHEN s.status = 'complete' THEN s.updated_at END AS completed_at
     FROM cognitive_gym_sessions s
     ORDER BY s.created_at DESC
     LIMIT $1`,
    [limit],
  );

  const lines = result.rows.map((row) =>
    JSON.stringify({
      trace_id: row.trace_id,
      user_id: row.user_id,
      initial_position: row.initial_position,
      user_judgment: row.user_judgment,
      final_position: row.final_position,
      session_status: row.session_status,
      loop_complete: row.session_status === "complete",
      synthesis: row.synthesis_snapshot,
      deliberation: row.deliberation_snapshot,
      created_at: row.created_at,
      completed_at: row.completed_at,
    }),
  );

  writeFileSync(outPath, lines.join("\n") + (lines.length ? "\n" : ""));
  console.log(`Exported ${lines.length} sessions to ${outPath}`);
  console.log(
    `Complete loops: ${result.rows.filter((r) => r.session_status === "complete").length}`,
  );
  console.log(
    `Abandoned/incomplete: ${result.rows.filter((r) => r.session_status !== "complete").length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
