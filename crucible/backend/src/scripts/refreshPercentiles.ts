import { closePool } from "../db/pool.js";
import { query } from "../db/client.js";

await query(
  [
    "WITH user_scores AS (",
    "SELECT u.id AS user_id, COALESCE(AVG(aer.composite_score), 0) AS avg_composite_score, COUNT(DISTINCT icr.id) AS interrogation_count",
    "FROM users u",
    "LEFT JOIN interrogation_context_records icr ON icr.user_id = u.id",
    "LEFT JOIN deliberation_traces dt ON dt.icr_id = icr.id",
    "LEFT JOIN assumption_extraction_records aer ON aer.dt_id = dt.id",
    "WHERE u.deleted_at IS NULL",
    "GROUP BY u.id",
    "), ranked AS (",
    "SELECT user_id, 'avg_composite_score'::text AS metric, percent_rank() OVER (ORDER BY avg_composite_score) * 100 AS percentile, COUNT(*) OVER () AS sample_size FROM user_scores",
    "UNION ALL",
    "SELECT user_id, 'interrogation_count'::text AS metric, percent_rank() OVER (ORDER BY interrogation_count) * 100 AS percentile, COUNT(*) OVER () AS sample_size FROM user_scores",
    ")",
    "INSERT INTO user_percentiles (user_id, metric, percentile, sample_size, computed_at)",
    "SELECT user_id, metric, percentile, sample_size, now() FROM ranked",
    "ON CONFLICT (user_id, metric) DO UPDATE SET percentile = EXCLUDED.percentile, sample_size = EXCLUDED.sample_size, computed_at = EXCLUDED.computed_at",
  ].join(" "),
);

await closePool();
console.log("Refreshed user percentiles.");
