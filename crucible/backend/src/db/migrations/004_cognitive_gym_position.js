export async function up(pgm) {
  pgm.sql(`
    ALTER TABLE interrogation_context_records
      ADD COLUMN IF NOT EXISTS user_position text;

    CREATE TABLE cognitive_position_commitments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trace_id text NOT NULL,
      initial_position text NOT NULL,
      final_position text NOT NULL,
      source text NOT NULL DEFAULT 'mcp' CHECK (source IN ('api', 'mcp', 'extension', 'sdk')),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX cognitive_position_commitments_user_created_idx
      ON cognitive_position_commitments (user_id, created_at DESC);

    CREATE INDEX cognitive_position_commitments_trace_idx
      ON cognitive_position_commitments (trace_id);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS cognitive_position_commitments;
    ALTER TABLE interrogation_context_records DROP COLUMN IF EXISTS user_position;
  `);
}
