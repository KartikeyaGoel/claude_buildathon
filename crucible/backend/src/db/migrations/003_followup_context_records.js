export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE conversation_followup_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trace_id text NOT NULL,
      source text NOT NULL DEFAULT 'mcp' CHECK (source IN ('api', 'mcp', 'extension', 'sdk')),
      messages jsonb NOT NULL DEFAULT '[]'::jsonb,
      final_answer text,
      outcome text,
      confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      output_embedding vector(1536),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX conversation_followup_records_user_created_idx
      ON conversation_followup_records (user_id, created_at DESC);

    CREATE INDEX conversation_followup_records_trace_idx
      ON conversation_followup_records (trace_id);
  `);
}

export async function down(pgm) {
  pgm.sql("DROP TABLE IF EXISTS conversation_followup_records;");
}

