export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE cognitive_gym_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id text NOT NULL UNIQUE,
      icr_id uuid NOT NULL REFERENCES interrogation_context_records(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'awaiting_judgment'
        CHECK (status IN ('awaiting_judgment', 'awaiting_recommitment', 'complete', 'abandoned')),
      user_position text NOT NULL,
      user_judgment text,
      final_position text,
      disagreement_question text,
      deliberation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      synthesis_snapshot jsonb,
      expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX cognitive_gym_sessions_user_status_idx
      ON cognitive_gym_sessions (user_id, status, created_at DESC);

    CREATE INDEX cognitive_gym_sessions_expires_idx
      ON cognitive_gym_sessions (expires_at)
      WHERE status IN ('awaiting_judgment', 'awaiting_recommitment');
  `);
}

export async function down(pgm) {
  pgm.sql("DROP TABLE IF EXISTS cognitive_gym_sessions;");
}
